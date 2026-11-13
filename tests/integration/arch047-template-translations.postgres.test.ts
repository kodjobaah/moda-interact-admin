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

test("concurrent run creation and repeated failed-language retries preserve audits, no-ops and rollback", async () => {
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

  // A provider may fail the same language again after the first genuine retry.
  // Preserve its first audit and all completed/in-flight work across that second decision.
  await db.whatsAppTemplateTranslationItem.update({ where: { id: run.items[3].id },
    data: { status: "REVIEWED", translatedAst: { schemaVersion: 1, segments: [{ key: "body.text", text: "hola" }] } } });
  const priorAudits = await db.commerceAuditEvent.findMany({ orderBy: { id: "asc" } });
  const unchangedItems = await db.whatsAppTemplateTranslationItem.findMany({
    where: { runId: run.id, id: { not: failed.id } }, orderBy: { id: "asc" },
  });
  await db.whatsAppTemplateTranslationItem.update({ where: { id: failed.id },
    data: { status: "FAILED", failureCode: "INVALID_TOKENS", nextAttemptAt: null } });
  const retries = await Promise.all(Array.from({ length: 3 }, () =>
    retryWhatsAppTemplateTranslation(saved.id, { db, principal })));
  assert.deepEqual(retries.map((result) => result.retryRequested).sort(), [0, 0, 1]);
  assert.equal((await retryWhatsAppTemplateTranslation(saved.id, { db, principal })).retryRequested, 0);
  const allAudits = await db.commerceAuditEvent.findMany({ orderBy: { id: "asc" } });
  assert.deepEqual(allAudits.filter((audit) => priorAudits.some((old) => old.id === audit.id)), priorAudits);
  const added = allAudits.filter((audit) => !priorAudits.some((old) => old.id === audit.id));
  assert.equal(added.length, 1);
  assert.equal(added[0].actorAdminId, adminId);
  assert.equal(added[0].action, "REQUEST_WHATSAPP_TEMPLATE_TRANSLATION");
  assert.deepEqual(added[0].metadata, { definitionId: saved.id, runId: run.id, retriedFailed: 1, requeuedPending: 0 });
  assert.ok(added[0].operationId && added[0].operationId.length <= 128);
  assert.equal(new Set(allAudits.map((audit) => audit.operationId).filter(Boolean)).size,
    allAudits.filter((audit) => audit.operationId).length);
  assert.deepEqual(await db.whatsAppTemplateTranslationItem.findMany({
    where: { runId: run.id, id: { not: failed.id } }, orderBy: { id: "asc" },
  }), unchangedItems);
  const retried = await db.whatsAppTemplateTranslationItem.findUniqueOrThrow({ where: { id: failed.id } });
  assert.equal(retried.status, "PENDING");
  assert.equal(retried.retryCount, failed.retryCount);
  assert.equal(retried.failureCode, null);
  assert.ok(retried.nextAttemptAt);
  assert.deepEqual(await db.whatsAppTemplateLocale.findUniqueOrThrow({ where: { id: sourceLocale.id } }), sourceLocale);

  // A real database audit insertion failure must roll back item/run/definition writes.
  await db.whatsAppTemplateTranslationItem.update({ where: { id: failed.id },
    data: { status: "FAILED", failureCode: "INVALID_TOKENS", nextAttemptAt: null } });
  await db.whatsAppTemplateTranslationRun.update({ where: { id: run.id },
    data: { status: "FAILED", failureCode: "TRANSLATION_ITEM_FAILED", completedAt: new Date() } });
  await db.whatsAppTemplateDefinition.update({ where: { id: saved.id }, data: { status: "PARTIALLY_FAILED" } });
  const beforeFailure = {
    item: await db.whatsAppTemplateTranslationItem.findUniqueOrThrow({ where: { id: failed.id } }),
    run: await db.whatsAppTemplateTranslationRun.findUniqueOrThrow({ where: { id: run.id } }),
    definition: await db.whatsAppTemplateDefinition.findUniqueOrThrow({ where: { id: saved.id } }),
  };
  // Missing actor is rejected by the real audit FK, after all retry writes have run.
  await assert.rejects(retryWhatsAppTemplateTranslation(saved.id, { db,
    principal: { ...principal, id: `missing-${randomUUID()}` } }), /Foreign key constraint/);
  assert.deepEqual({
    item: await db.whatsAppTemplateTranslationItem.findUniqueOrThrow({ where: { id: failed.id } }),
    run: await db.whatsAppTemplateTranslationRun.findUniqueOrThrow({ where: { id: run.id } }),
    definition: await db.whatsAppTemplateDefinition.findUniqueOrThrow({ where: { id: saved.id } }),
  }, beforeFailure);
  assert.deepEqual(await db.commerceAuditEvent.findMany({ orderBy: { id: "asc" } }), allAudits);
  const indexes = await db.$queryRaw<Array<{ indexdef: string }>>`
    SELECT indexdef FROM pg_indexes WHERE schemaname = 'commerce'
    AND indexname = 'CommerceAuditEvent_operation_id_unique'`;
  assert.equal(indexes.length, 1);
  assert.match(indexes[0].indexdef, /CREATE UNIQUE INDEX/);
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
