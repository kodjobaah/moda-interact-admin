import assert from "node:assert/strict";
import { test, after } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { saveEnglishTemplate } from "../../src/lib/admin/whatsapp-templates/authoring/service.ts";
import { newMetaDraft, newWrapperDraft } from "../../src/lib/admin/whatsapp-templates/authoring/draft-operations.ts";
import type { TemplateRepository } from "../../src/lib/admin/whatsapp-templates/authoring/repository.ts";

if (process.env.ARCH047_DISPOSABLE_POSTGRES !== "1") throw new Error("Refusing non-disposable PostgreSQL integration execution.");
const db = new PrismaClient();
after(async () => { await db.$disconnect(); });
const actorId = `arch047_${randomUUID()}`;
const principal = { id: actorId, role: "SUPER_ADMIN" as const, developmentBypass: false };

async function ensureActor() {
  await db.platformAdmin.create({ data: {
    id: actorId, provider: "arch047-integration", providerSubject: actorId,
    email: `${actorId}@example.invalid`, displayName: "ARCH-047 test administrator", role: "SUPER_ADMIN", active: true,
  } });
}

test("transactional Meta/wrapper English create, read, replay, clone and audit", async () => {
  await ensureActor();
  const first = await saveEnglishTemplate({ submissionId: randomUUID(), draft: newMetaDraft() }, { db, principal });
  const persisted = await db.whatsAppTemplateDefinition.findUnique({ where: { id: first.id }, include: { locales: true } });
  assert.ok(persisted);
  assert.equal(persisted.locales.length, 1);
  assert.equal((persisted.locales[0].localeAst as { schemaVersion: number }).schemaVersion, 1);
  assert.equal(persisted.sourceLanguageTag, "en");
  assert.equal(await db.commerceAuditEvent.count({ where: { operationId: first.id } }), 1);

  const clone = await saveEnglishTemplate({ submissionId: randomUUID(), draft: newMetaDraft("FOLLOW_UP"), cloneFromDefinitionId: first.id }, { db, principal });
  assert.notEqual(clone.id, first.id);
  const cloned = await db.whatsAppTemplateDefinition.findUniqueOrThrow({ where: { id: clone.id } });
  assert.equal(cloned.clonedFromDefinitionId, first.id);
  assert.notEqual(cloned.providerTemplateName, persisted.providerTemplateName);
  assert.equal((await db.whatsAppTemplateDefinition.findUniqueOrThrow({ where: { id: first.id } })).purpose, "INITIAL");

  const submissionId = randomUUID();
  const results = await Promise.all([1, 2, 3].map(() => saveEnglishTemplate({ submissionId, draft: newWrapperDraft("HUMAN") }, { db, principal })));
  assert.equal(new Set(results.map((r) => r.id)).size, 1);
  assert.equal(results.filter((r) => !r.replay).length, 1);
  const wrapperId = results[0].id;
  assert.equal(await db.whatsAppTemplateLocale.count({ where: { definitionId: wrapperId, languageTag: "en" } }), 1);
  assert.equal(await db.commerceAuditEvent.count({ where: { operationId: wrapperId } }), 1);
  assert.equal((await db.whatsAppTemplateDefinition.findUniqueOrThrow({ where: { id: wrapperId } })).providerTemplateName, null);
  assert.equal(await db.whatsAppTemplateMetaRegistration.count({ where: { locale: { is: { definitionId: wrapperId } } } }), 0);
});

test("forced audit failure rolls back definition and English locale", async () => {
  const submissionId = randomUUID();
  const failAuditDb: TemplateRepository = {
    whatsAppTemplateDefinition: db.whatsAppTemplateDefinition,
    $transaction: ((callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => db.$transaction(async (tx) => callback(new Proxy(tx, {
      get(target, prop, receiver) {
        if (prop === "commerceAuditEvent") return { create: async () => { throw new Error("ARCH047 forced audit failure"); } };
        return Reflect.get(target, prop, receiver);
      },
    }) as Prisma.TransactionClient))) as TemplateRepository["$transaction"],
  };
  await assert.rejects(saveEnglishTemplate({ submissionId, draft: newMetaDraft() }, { db: failAuditDb, principal }), /forced audit failure/);
  // No leaked definition or locale, including for failed audit.
  assert.equal(await db.whatsAppTemplateDefinition.count({ where: { createdByAdminId: actorId } }), 3);
});
