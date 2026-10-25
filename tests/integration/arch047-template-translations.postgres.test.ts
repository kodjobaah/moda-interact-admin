import assert from "node:assert/strict";
import { test, after } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { newMetaDraft } from "../../src/lib/admin/whatsapp-templates/authoring/draft-operations.ts";
import { saveEnglishTemplate } from "../../src/lib/admin/whatsapp-templates/authoring/service.ts";
import { startWhatsAppTemplateTranslation, retryWhatsAppTemplateTranslation } from "../../src/lib/admin/whatsapp-templates/translations/service.ts";
import { readTranslationWorkspace } from "../../src/lib/admin/whatsapp-templates/translations/repository.ts";

if (process.env.ARCH047_DISPOSABLE_TRANSLATION_DB !== "1") throw new Error("Refusing non-disposable PostgreSQL integration execution.");
const db = new PrismaClient();
after(async () => { await db.$disconnect(); });
const adminId = `arch047_t_${randomUUID()}`;
const principal = { id: adminId, role: "SUPER_ADMIN" as const, developmentBypass: false };

async function ensureConfiguration() {
  await db.platformAdmin.create({ data: {
    id: adminId, provider: "arch047-translation-fixture", providerSubject: adminId,
    email: `${adminId}@example.invalid`, displayName: "Translation test admin", role: "SUPER_ADMIN", active: true,
  } });
  await db.commerceTranslationProviderCredential.create({ data: {
    environment: "TEST", provider: "openai", ciphertext: Buffer.alloc(32, 1),
    nonce: Buffer.alloc(12, 2), authTag: Buffer.alloc(16, 3), keyId: "disposable-fixture",
    updatedByAdminId: adminId,
  } });
  await db.commerceTranslationModelConfiguration.create({ data: {
    id: "arch047-disposable-model", environment: "TEST", provider: "openai",
    providerModelId: "fixture-gpt-batch", displayName: "ARCH-047 fixture model",
    enabled: true, automaticDefault: true, editVersion: 1, createdByAdminId: adminId, updatedByAdminId: adminId,
  } });
}

test("persist committed English, atomically create one Run + 19 Items under concurrent requests", async () => {
  await ensureConfiguration();
  const saved = await saveEnglishTemplate({ submissionId: randomUUID(), draft: newMetaDraft() }, { db, principal });
  const results = await Promise.all(Array.from({ length: 4 }, () => startWhatsAppTemplateTranslation(saved.id, { db, principal })));
  assert.equal(new Set(results.map((result) => result.runId)).size, 1);
  assert.equal(results.filter((result) => !result.reused).length, 1);
  assert.equal(await db.whatsAppTemplateTranslationRun.count({ where: { definitionId: saved.id } }), 1);
  const run = await db.whatsAppTemplateTranslationRun.findFirstOrThrow({ where: { definitionId: saved.id }, include: { items: true } });
  assert.equal(run.items.length, 19);
  assert.equal(new Set(run.items.map((item) => item.targetLanguageTag)).size, 19);
  assert.equal(run.providerModelId, "fixture-gpt-batch");
  assert.equal(run.modelConfigurationVersion, 1);
  assert.equal((run.sourceSnapshot as { sourceHash: string }).sourceHash, run.sourceHash);
  assert.equal(await db.commerceAuditEvent.count({ where: { operationId: run.id } }), 1);
  assert.equal((await db.whatsAppTemplateDefinition.findUniqueOrThrow({ where: { id: saved.id } })).status, "TRANSLATION_QUEUED");
  const sourceLocale = await db.whatsAppTemplateLocale.findUniqueOrThrow({ where: { definitionId_languageTag: { definitionId: saved.id, languageTag: "en" } } });
  assert.equal(sourceLocale.status, "SOURCE_SAVED");
  assert.ok(sourceLocale.localeAst);

  await db.whatsAppTemplateTranslationItem.update({ where: { id: run.items[0].id }, data: { status: "COMPLETED", translatedAst: { schemaVersion: 1, segments: [{ key: "body.text", text: "bonjour" }] } } });
  await db.whatsAppTemplateTranslationItem.update({ where: { id: run.items[1].id }, data: { status: "FAILED", failureCode: "INVALID_TOKENS" } });
  await db.whatsAppTemplateTranslationItem.update({ where: { id: run.items[2].id }, data: { status: "PROCESSING" } });
  const status = await readTranslationWorkspace(db, saved.id);
  assert.equal(status.progress, "PARTIALLY_FAILED");
  assert.equal(status.failed, 1);
  assert.equal(status.completed, 1);
  const retry = await retryWhatsAppTemplateTranslation(saved.id, { db, principal });
  assert.equal(retry.retryRequested, 17);
  const secondRetry = await retryWhatsAppTemplateTranslation(saved.id, { db, principal });
  assert.equal(secondRetry.retryRequested, 0);
  assert.equal(await db.commerceAuditEvent.count({ where: { action: "REQUEST_WHATSAPP_TEMPLATE_TRANSLATION" } }), 2);
  const completed = await db.whatsAppTemplateTranslationItem.findUniqueOrThrow({ where: { id: run.items[0].id } });
  const processing = await db.whatsAppTemplateTranslationItem.findUniqueOrThrow({ where: { id: run.items[2].id } });
  const failed = await db.whatsAppTemplateTranslationItem.findUniqueOrThrow({ where: { id: run.items[1].id } });
  assert.equal(completed.status, "COMPLETED");
  assert.ok(completed.translatedAst);
  assert.equal(processing.status, "PROCESSING");
  assert.equal(failed.status, "PENDING");
  assert.equal(failed.failureCode, null);
  assert.ok(failed.nextAttemptAt);
});

test("no run or audit created before English source has committed", async () => {
  const saved = await saveEnglishTemplate({ submissionId: randomUUID(), draft: newMetaDraft() }, { db, principal });
  await db.whatsAppTemplateLocale.update({
    where: { definitionId_languageTag: { definitionId: saved.id, languageTag: "en" } },
    data: { status: "DRAFT" },
  });
  await assert.rejects(startWhatsAppTemplateTranslation(saved.id, { db, principal }), /not committed/);
  assert.equal(await db.whatsAppTemplateTranslationRun.count({ where: { definitionId: saved.id } }), 0);
});
