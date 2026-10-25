import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { activateConversationWrapper } from "../../src/lib/admin/whatsapp-templates/wrappers/service.ts";
import type { WrapperRepository } from "../../src/lib/admin/whatsapp-templates/wrappers/repository.ts";
import { brandedWrapper } from "../fixtures/arch047-wrapper-fixture.ts";
import { compileTemplateAst } from "../../src/lib/admin/whatsapp-templates/authoring/compiler.ts";
import { templateHash } from "../../src/lib/admin/whatsapp-templates/authoring/identifiers.ts";
import { REVIEW_LANGUAGES } from "../../src/lib/admin/whatsapp-templates/compilation/language-codes.ts";

if (process.env.ARCH047_DISPOSABLE_POSTGRES !== "1") throw new Error("Refusing non-disposable PostgreSQL target.");
const db = new PrismaClient();
const adminId = `admin-wrapper-${randomUUID()}`;
const principal = { id: adminId, role: "SUPER_ADMIN" as const };
const created = [] as string[];

async function seed(audience: "SHARED" | "AI" | "HUMAN", label: string) {
  const ast = brandedWrapper(audience);
  const record = { schemaVersion: 1, authoring: ast, prepared: compileTemplateAst(ast) };
  const id = `wtdef_${randomUUID().replaceAll("-", "").padEnd(64, "a")}`;
  await db.whatsAppTemplateDefinition.create({ data: {
    id, kind: "MODA_CONVERSATION_WRAPPER", audience, sourceLanguageTag: "en", sourceHash: templateHash(ast),
    astSchemaVersion: 1, status: "SAVED", createdByAdminId: adminId,
    locales: { create: REVIEW_LANGUAGES.map((languageTag) => ({ languageTag,
      localeAst: record as unknown as Prisma.InputJsonValue, contentHash: templateHash(record.prepared),
      status: languageTag === "en" ? "SOURCE_SAVED" : "REVIEWED",
      reviewedByAdminId: languageTag === "en" ? null : adminId,
      reviewedAt: languageTag === "en" ? null : new Date(),
    })) },
  } });
  created.push(id);
  assert.ok(id.startsWith("wtdef_"), label);
  return id;
}
const input = (definitionId: string, audience: "SHARED" | "AI" | "HUMAN",
  expectedVersion: number | null = null, expectedDefinitionId: string | null = null) => ({
  definitionId, audience, expectedVersion, expectedDefinitionId, reason: "Approved immutable 20-language wrapper after comparison",
});

before(async () => {
  await db.platformAdmin.create({ data: { id: adminId, provider: "arch047-wrapper-fixture", providerSubject: adminId,
    email: `${adminId}@example.invalid`, role: "SUPER_ADMIN", active: true } });
});
after(async () => { await db.$disconnect(); });

test("schema-backed SHARED/AI/HUMAN pointers, idempotent replay, replacement, reactivation and bounded audit", async () => {
  const shared = await seed("SHARED", "shared");
  const newer = await seed("SHARED", "newer");
  const sourceBefore = (await db.whatsAppTemplateLocale.findUniqueOrThrow({
    where: { definitionId_languageTag: { definitionId: shared, languageTag: "en" } },
  })).contentHash;
  const ai = await seed("AI", "ai");
  const human = await seed("HUMAN", "human");
  assert.deepEqual(await activateConversationWrapper(input(shared, "SHARED"), { db, principal }), { replay: false, editVersion: 1 });
  assert.deepEqual(await activateConversationWrapper(input(ai, "AI"), { db, principal }), { replay: false, editVersion: 1 });
  assert.deepEqual(await activateConversationWrapper(input(human, "HUMAN"), { db, principal }), { replay: false, editVersion: 1 });
  assert.deepEqual(await activateConversationWrapper(input(shared, "SHARED", 1, shared), { db, principal }), { replay: true, editVersion: 1 });
  assert.deepEqual(await activateConversationWrapper(input(newer, "SHARED", 1, shared), { db, principal }), { replay: false, editVersion: 2 });
  assert.deepEqual(await activateConversationWrapper(input(shared, "SHARED", 2, newer), { db, principal }), { replay: false, editVersion: 3 });
  assert.equal((await db.whatsAppConversationWrapperActiveSlot.findUniqueOrThrow({ where: { audience: "SHARED" } })).definitionId, shared);
  assert.equal(await db.whatsAppConversationWrapperActiveSlot.count(), 3);
  assert.equal(await db.commerceAuditEvent.count({ where: { action: "ACTIVATE_WHATSAPP_CONVERSATION_WRAPPER", actorAdminId: adminId } }), 5);
  assert.ok((await db.whatsAppTemplateDefinition.findUniqueOrThrow({ where: { id: newer } })).publishedAt);
  assert.equal(await db.whatsAppTemplateLocale.count({ where: { definitionId: shared } }), 20);
  assert.equal((await db.whatsAppTemplateLocale.findUniqueOrThrow({
    where: { definitionId_languageTag: { definitionId: shared, languageTag: "en" } },
  })).contentHash, sourceBefore, "Pointer changes must not revise immutable compiled content");
  await assert.rejects(activateConversationWrapper(input(ai, "SHARED", 3, shared), { db, principal }), /audience/);
  await assert.rejects(activateConversationWrapper(input(newer, "SHARED", 1, shared), { db, principal }), /Refresh|changed/);
});

test("concurrent versioned CAS permits only one replacement and no duplicate audit", async () => {
  const one = await seed("HUMAN", "race one");
  const two = await seed("HUMAN", "race two");
  const prior = await db.whatsAppConversationWrapperActiveSlot.findUniqueOrThrow({ where: { audience: "HUMAN" } });
  const outcomes = await Promise.allSettled([
    activateConversationWrapper(input(one, "HUMAN", prior.editVersion, prior.definitionId), { db, principal }),
    activateConversationWrapper(input(two, "HUMAN", prior.editVersion, prior.definitionId), { db, principal }),
  ]);
  assert.equal(outcomes.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((x) => x.status === "rejected").length, 1);
  const next = await db.whatsAppConversationWrapperActiveSlot.findUniqueOrThrow({ where: { audience: "HUMAN" } });
  assert.equal(next.editVersion, prior.editVersion + 1);
  assert.ok([one, two].includes(next.definitionId));
});

test("audit write failure rolls back pointer, first-published timestamp and all locale content", async () => {
  const candidate = await seed("AI", "rollback");
  const beforeSlot = await db.whatsAppConversationWrapperActiveSlot.findUniqueOrThrow({ where: { audience: "AI" } });
  const failingDb = { $transaction: ((fn: (tx: Prisma.TransactionClient) => Promise<unknown>, options: unknown) =>
    db.$transaction(async (tx) => fn(new Proxy(tx, { get(target, key, receiver) {
      if (key === "commerceAuditEvent") return { create: async () => { throw new Error("audit insert denied"); } };
      return Reflect.get(target, key, receiver);
    } }) as Prisma.TransactionClient), options as { isolationLevel?: Prisma.TransactionIsolationLevel; timeout?: number; maxWait?: number }))
  } as WrapperRepository;
  await assert.rejects(activateConversationWrapper(input(candidate, "AI", beforeSlot.editVersion, beforeSlot.definitionId),
    { db: failingDb, principal }), /audit insert denied/);
  assert.equal((await db.whatsAppConversationWrapperActiveSlot.findUniqueOrThrow({ where: { audience: "AI" } })).definitionId,
    beforeSlot.definitionId);
  assert.equal((await db.whatsAppTemplateDefinition.findUniqueOrThrow({ where: { id: candidate } })).publishedAt, null);
  assert.equal(await db.whatsAppTemplateLocale.count({ where: { definitionId: candidate } }), 20);
});
