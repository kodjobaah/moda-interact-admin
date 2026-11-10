import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { PrismaClient, type Prisma } from "@prisma/client";
import { initializeConversationWrapper, canonicalConversationWrapper, INITIALIZER_SUBMISSION_ID } from "../../src/lib/admin/whatsapp-templates/wrappers/initialize.ts";
import { makeImmutableAuthoringRecord } from "../../src/lib/admin/whatsapp-templates/authoring/compiler.ts";
import { definitionIdForSubmit, templateHash } from "../../src/lib/admin/whatsapp-templates/authoring/identifiers.ts";
import { REVIEW_LANGUAGES } from "../../src/lib/admin/whatsapp-templates/compilation/language-codes.ts";
import { checkWrapperEligibility } from "../../src/lib/admin/whatsapp-templates/wrappers/eligibility.ts";
import type { WrapperTemplateAst } from "../../src/lib/admin/whatsapp-templates/authoring/types.ts";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (process.env.ARCH068_DISPOSABLE_POSTGRES !== "1" || !["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/arch068_initializer_fixture") throw new Error("Refusing a non-disposable database");
const db = new PrismaClient();
const reason = "Operator approval of the structural conversation wrapper";
const code = (expected: string) => (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === expected;
const input = (actorAdminId: string, mode: "APPLY" | "DRY_RUN" = "APPLY") => ({ environment: "test" as const, actorAdminId, reason, mode });
async function actor(role: "SUPER_ADMIN" | "ADMIN" = "SUPER_ADMIN", active = true) {
  const id = `initializer-${randomUUID()}`;
  await db.platformAdmin.create({ data: { id, email: `${id}@example.invalid`, provider: "disposable-fixture", role, active } }); return id;
}
async function snapshot() {
  return JSON.stringify(await Promise.all([
    db.whatsAppTemplateDefinition.findMany({ orderBy: { id: "asc" } }),
    db.whatsAppTemplateLocale.findMany({ orderBy: { id: "asc" } }),
    db.whatsAppConversationWrapperActiveSlot.findMany({ orderBy: { audience: "asc" } }),
    db.commerceAuditEvent.findMany({ orderBy: { id: "asc" } }),
    db.platformAdmin.findMany({ orderBy: { id: "asc" } }),
  ]));
}
async function seedDefinition(actorAdminId: string, ast: WrapperTemplateAst = canonicalConversationWrapper(), id = definitionIdForSubmit(actorAdminId, randomUUID()), languages: readonly string[] = REVIEW_LANGUAGES) {
  const record = makeImmutableAuthoringRecord(ast); const now = new Date();
  await db.whatsAppTemplateDefinition.create({ data: {
    id, kind: "MODA_CONVERSATION_WRAPPER", audience: "AI", sourceLanguageTag: "en", astSchemaVersion: 1,
    sourceHash: templateHash(ast), status: "SAVED", createdByAdminId: actorAdminId,
    locales: { create: languages.map((languageTag) => ({ languageTag, localeAst: record as unknown as Prisma.InputJsonValue,
      contentHash: templateHash(record.prepared), providerLanguageCode: null, status: languageTag === "en" ? "SOURCE_SAVED" : "REVIEWED",
      reviewedByAdminId: languageTag === "en" ? null : actorAdminId, reviewedAt: languageTag === "en" ? null : now })) },
  } }); return id;
}
beforeEach(async () => { await db.whatsAppConversationWrapperActiveSlot.deleteMany({ where: { audience: "AI" } }); });
after(async () => { await db.$disconnect(); });

test("dry-run is fully read-only and reports stable planned identity, digests, locale count and empty slot", async () => {
  const id = await actor(); const before = await snapshot();
  const result = await initializeConversationWrapper(input(id, "DRY_RUN"), { db });
  assert.equal(result.status, "DRY_RUN"); assert.equal(result.currentPointer, null);
  assert.equal(result.plannedDefinitionId, definitionIdForSubmit(id, INITIALIZER_SUBMISSION_ID));
  assert.equal(result.sourceHash, templateHash(canonicalConversationWrapper()));
  assert.equal(result.localeCount, REVIEW_LANGUAGES.length);
  assert.equal(await snapshot(), before);
});

test("apply atomically creates exact structural source, all canonical reviewed locales, active pointer and truthful audits", async () => {
  const id = await actor(); const result = await initializeConversationWrapper(input(id), { db });
  assert.equal(result.status, "CREATED_AND_ACTIVATED");
  const definition = await db.whatsAppTemplateDefinition.findUniqueOrThrow({ where: { id: result.definitionId }, include: { locales: true } });
  const expected = { schemaVersion: 1, family: "MODA_CONVERSATION_WRAPPER", sourceLanguageTag: "en", audience: "AI", header: [], body: [{ type: "slot", name: "response.body" }], footer: [], conditionals: [], productImage: { variable: "response.productImage", placement: "BEFORE_BODY", optional: true } };
  assert.equal(definition.sourceHash, templateHash(expected)); assert.equal(definition.status, "PUBLISHED"); assert.ok(definition.publishedAt);
  assert.equal(definition.locales.length, 20); assert.deepEqual(new Set(definition.locales.map((locale) => locale.languageTag)), new Set(REVIEW_LANGUAGES));
  const times = new Set<number>();
  for (const locale of definition.locales) {
    const record = locale.localeAst as unknown as { authoring: unknown; prepared: unknown };
    assert.deepEqual(record.authoring, expected); assert.equal(templateHash(record.prepared), result.contentHash);
    assert.equal(locale.providerLanguageCode, null); assert.equal(locale.contentHash, result.contentHash);
    assert.equal(locale.status, locale.languageTag === "en" ? "SOURCE_SAVED" : "REVIEWED");
    if (locale.languageTag === "en") { assert.equal(locale.reviewedAt, null); assert.equal(locale.reviewedByAdminId, null); }
    else { assert.equal(locale.reviewedByAdminId, id); assert.ok(locale.reviewedAt); times.add(locale.reviewedAt.getTime()); }
  }
  assert.equal(times.size, 1); assert.equal(definition.publishedAt.getTime(), [...times][0]);
  assert.equal(checkWrapperEligibility(definition, "AI").eligible, true);
  const slot = await db.whatsAppConversationWrapperActiveSlot.findUniqueOrThrow({ where: { audience: "AI" } });
  assert.equal(slot.definitionId, result.definitionId); assert.equal(slot.editVersion, 1);
  const audits = await db.commerceAuditEvent.findMany({ where: { actorAdminId: id } });
  assert.deepEqual(new Set(audits.map((entry) => entry.action)), new Set(["CREATE_WHATSAPP_TEMPLATE_DEFINITION", "ACTIVATE_WHATSAPP_CONVERSATION_WRAPPER"]));
  for (const entry of audits) {
    assert.equal(entry.reason, reason);
    const metadata = entry.metadata as Record<string, unknown>;
    assert.equal(metadata.script, "initialize-conversation-wrapper"); assert.equal(metadata.version, "1");
    assert.equal(metadata.sourceHash, result.sourceHash); assert.equal(metadata.contentHash, result.contentHash); assert.equal(metadata.previousDefinitionId, null);
    assert.deepEqual(new Set(metadata.structuralOnlyLocales as string[]), new Set(REVIEW_LANGUAGES));
    assert.match(String(metadata.structuralApproval), /Operator-approved language-invariant/);
  }
  assert.equal(await db.whatsAppTemplateTranslationRun.count(), 0);
  assert.equal(await db.whatsAppTemplateMetaRegistration.count(), 0);
});

test("same-actor repeat and canonical occupied slot from another actor are unchanged with no writes", async () => {
  const first = await actor(); const second = await actor();
  const created = await initializeConversationWrapper(input(first), { db }); const before = await snapshot();
  for (const who of [first, second]) {
    const result = await initializeConversationWrapper(input(who), { db });
    assert.equal(result.status, "UNCHANGED"); assert.equal(result.definitionId, created.definitionId);
    assert.equal(await snapshot(), before);
  }
  assert.equal(await db.whatsAppTemplateDefinition.count({ where: { id: definitionIdForSubmit(second, INITIALIZER_SUBMISSION_ID) } }), 0);
  const plan = await initializeConversationWrapper(input(second, "DRY_RUN"), { db });
  assert.equal(plan.status, "DRY_RUN"); assert.equal(plan.action, "UNCHANGED");
  assert.equal(plan.currentPointer?.definitionId, created.definitionId); assert.equal(await snapshot(), before);
});

test("same-actor immutable mismatch fails without edits or partial locales", async () => {
  const id = await actor(); const ast = canonicalConversationWrapper(); ast.header = [{ type: "text", value: "Altered immutable source" }];
  await seedDefinition(id, ast, definitionIdForSubmit(id, INITIALIZER_SUBMISSION_ID)); const before = await snapshot();
  await assert.rejects(initializeConversationWrapper(input(id), { db }), code("IMMUTABLE_CONFLICT"));
  assert.equal(await snapshot(), before);
});

test("occupied eligible but different wrapper is never overwritten, including on dry-run", async () => {
  const owner = await actor(); const caller = await actor(); const ast = canonicalConversationWrapper(); delete ast.productImage;
  const occupied = await seedDefinition(owner, ast);
  await db.whatsAppConversationWrapperActiveSlot.create({ data: { audience: "AI", definitionId: occupied, editVersion: 7, updatedByAdminId: owner } });
  const before = await snapshot();
  for (const mode of ["APPLY", "DRY_RUN"] as const) await assert.rejects(initializeConversationWrapper(input(caller, mode), { db }), code("SLOT_OCCUPIED"));
  assert.equal(await snapshot(), before);
});

test("missing/inactive/non-superadmin actors fail without provision or role changes", async () => {
  const ordinary = await actor("ADMIN"); const inactive = await actor("SUPER_ADMIN", false); const before = await snapshot();
  for (const who of [ordinary, inactive, `absent-${randomUUID()}`]) await assert.rejects(initializeConversationWrapper(input(who), { db }), code("ACTOR_DENIED"));
  assert.equal(await snapshot(), before);
});

test("existing exact immutable definition can be activated without rewriting its reviewed locales", async () => {
  const id = await actor(); const definitionId = definitionIdForSubmit(id, INITIALIZER_SUBMISSION_ID);
  await seedDefinition(id, canonicalConversationWrapper(), definitionId);
  const locales = JSON.stringify(await db.whatsAppTemplateLocale.findMany({ where: { definitionId }, orderBy: { languageTag: "asc" } }));
  const result = await initializeConversationWrapper(input(id), { db });
  assert.equal(result.status, "CREATED_AND_ACTIVATED"); assert.equal(result.definitionId, definitionId);
  assert.equal(JSON.stringify(await db.whatsAppTemplateLocale.findMany({ where: { definitionId }, orderBy: { languageTag: "asc" } })), locales);
  assert.equal(await db.commerceAuditEvent.count({ where: { actorAdminId: id } }), 1);
});

test("occupied structurally matching but incomplete locale set is refused without repair", async () => {
  const owner = await actor(); const caller = await actor();
  const definitionId = await seedDefinition(owner, canonicalConversationWrapper(), undefined, REVIEW_LANGUAGES.slice(0, -1));
  await db.whatsAppConversationWrapperActiveSlot.create({ data: { audience: "AI", definitionId, editVersion: 1, updatedByAdminId: owner } });
  const before = await snapshot();
  await assert.rejects(initializeConversationWrapper(input(caller), { db }), code("SLOT_OCCUPIED"));
  assert.equal(await snapshot(), before);
});

function proxyDatabase(wrap: (tx: Prisma.TransactionClient) => Prisma.TransactionClient) {
  return { $transaction: (run: (tx: Prisma.TransactionClient) => Promise<unknown>, options: { isolationLevel?: Prisma.TransactionIsolationLevel; timeout?: number }) => db.$transaction((tx) => run(wrap(tx)), options) } as unknown as Pick<PrismaClient, "$transaction">;
}

test("creation/activation audit failure rolls back definition, all locales, timestamp and pointer together", async () => {
  for (const action of ["CREATE_WHATSAPP_TEMPLATE_DEFINITION", "ACTIVATE_WHATSAPP_CONVERSATION_WRAPPER"]) {
    const id = await actor(); const before = await snapshot();
    const failing = proxyDatabase((tx) => new Proxy(tx, { get(target, key) {
      if (key === "commerceAuditEvent") return { create: async (request: Parameters<typeof tx.commerceAuditEvent.create>[0]) => {
        if (request.data.action === action) throw new Error("fixture audit denied; sensitive database details");
        return tx.commerceAuditEvent.create(request);
      } };
      return Reflect.get(target, key);
    } }));
    await assert.rejects(initializeConversationWrapper(input(id), { db: failing }), code("CONCURRENT_STATE_CHANGE"));
    assert.equal(await snapshot(), before);
    assert.equal(await db.whatsAppTemplateDefinition.count({ where: { id: definitionIdForSubmit(id, INITIALIZER_SUBMISSION_ID) } }), 0);
  }
});

test("two simultaneous empty-slot initializations commit one winner and no orphan losing definition/locales/audit", async () => {
  const first = await actor(); const second = await actor(); let reads = 0; let release!: () => void;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  const concurrent = proxyDatabase((tx) => new Proxy(tx, { get(target, key) {
    if (key === "whatsAppConversationWrapperActiveSlot") return new Proxy(tx.whatsAppConversationWrapperActiveSlot, { get(delegate, method) {
      if (method === "findUnique") return async (...args: Parameters<typeof delegate.findUnique>) => {
        const result = await delegate.findUnique(...args);
        if (!result) { reads++; if (reads === 2) release(); await barrier; }
        return result;
      };
      return Reflect.get(delegate, method);
    } });
    return Reflect.get(target, key);
  } }));
  const result = await Promise.allSettled([initializeConversationWrapper(input(first), { db: concurrent }), initializeConversationWrapper(input(second), { db: concurrent })]);
  assert.equal(result.filter((entry) => entry.status === "fulfilled").length, 1);
  const failure = result.find((entry) => entry.status === "rejected") as PromiseRejectedResult;
  assert.ok(code("CONCURRENT_STATE_CHANGE")(failure.reason));
  const ids = [first, second].map((who) => definitionIdForSubmit(who, INITIALIZER_SUBMISSION_ID));
  assert.equal(await db.whatsAppTemplateDefinition.count({ where: { id: { in: ids } } }), 1);
  assert.equal(await db.whatsAppTemplateLocale.count({ where: { definitionId: { in: ids } } }), REVIEW_LANGUAGES.length);
  assert.equal(await db.commerceAuditEvent.count({ where: { actorAdminId: { in: [first, second] } } }), 2);
});

test("actual CLI defaults dry-run, applies only to disposable fixture, repeats safely, and checks trusted environment", async () => {
  const id = await actor(); const args = ["--environment=test", `--actor-admin-id=${id}`, `--reason=${reason}`];
  const execute = (more: string[] = [], deployment = "test") => spawnSync(process.execPath, ["scripts/initialize-conversation-wrapper.mjs", ...args, ...more], { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, DEPLOYMENT_ENVIRONMENT_NAME: deployment } });
  const before = await snapshot(); const dry = execute(); assert.equal(dry.status, 0, dry.stderr); assert.equal(JSON.parse(dry.stdout).status, "DRY_RUN"); assert.equal(await snapshot(), before);
  const mismatch = execute(["--apply"], "development"); assert.equal(mismatch.status, 1); assert.equal(JSON.parse(mismatch.stderr).code, "ENVIRONMENT_MISMATCH"); assert.equal(await snapshot(), before);
  const applied = execute(["--apply"]); assert.equal(applied.status, 0, applied.stderr); assert.equal(JSON.parse(applied.stdout).status, "CREATED_AND_ACTIVATED");
  const after = await snapshot(); const again = execute(["--apply"]); assert.equal(again.status, 0, again.stderr); assert.equal(JSON.parse(again.stdout).status, "UNCHANGED"); assert.equal(await snapshot(), after);
  assert.doesNotMatch(applied.stdout + applied.stderr, /fixture-only|postgresql:|@example\.invalid|sensitive/);
});
