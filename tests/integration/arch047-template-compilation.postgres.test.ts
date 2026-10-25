import assert from "node:assert/strict";
import { test, after, before } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { newMetaDraft } from "../../src/lib/admin/whatsapp-templates/authoring/draft-operations.ts";
import { templateHash } from "../../src/lib/admin/whatsapp-templates/authoring/identifiers.ts";
import { saveEnglishTemplate } from "../../src/lib/admin/whatsapp-templates/authoring/service.ts";
import { reviewTranslation } from "../../src/lib/admin/whatsapp-templates/compilation/service.ts";
import type { ReviewRepository } from "../../src/lib/admin/whatsapp-templates/compilation/repository.ts";
import { compilationFixture } from "../fixtures/arch047-translation-fixture.ts";

if (process.env.ARCH047_DISPOSABLE_POSTGRES !== "1") throw new Error("Refusing non-disposable database execution.");
const db = new PrismaClient();
const adminId = `a47-review-${randomUUID()}`;
const principal = { id: adminId, role: "SUPER_ADMIN" as const, developmentBypass: false };
const ast = newMetaDraft("INITIAL", "NO_OFFER");
ast.header = [{ type: "text", value: "Hello from " }, { type: "variable", name: "shopBrand.brandName" }];
const fixture = compilationFixture(ast);
let definitionId = "";
let runId = "";
const review = (languageTag: string, decision: "APPROVE" | "REJECT") => ({ definitionId, languageTag, runId, decision });

before(async () => {
  await db.platformAdmin.create({ data: { id: adminId, provider: "arch047-compilation-fixture", providerSubject: adminId,
    email: `${adminId}@example.invalid`, role: "SUPER_ADMIN", active: true } });
  await db.commerceTranslationProviderCredential.create({ data: { environment: "TEST", provider: "arch047-fixture",
    ciphertext: Buffer.alloc(32, 1), nonce: Buffer.alloc(12, 2), authTag: Buffer.alloc(16, 3),
    keyId: "fixture-only", updatedByAdminId: adminId } });
  const model = await db.commerceTranslationModelConfiguration.create({ data: {
    environment: "TEST", provider: "arch047-fixture", providerModelId: "arch047-fixture-v1",
    displayName: "ARCH047 temporary fixture", createdByAdminId: adminId, updatedByAdminId: adminId,
  } });
  definitionId = (await saveEnglishTemplate({ submissionId: randomUUID(), draft: ast }, { principal, db })).id;
  const run = await db.whatsAppTemplateTranslationRun.create({ data: {
    definitionId, translationModelConfigurationId: model.id,
    provider: "arch047-fixture", providerModelId: model.providerModelId, modelConfigurationVersion: 1,
    sourceSchemaVersion: 1, sourceHash: templateHash(ast),
    sourceSnapshot: { ...fixture.source, definitionId }, status: "READY_FOR_REVIEW", requestedByAdminId: adminId,
    items: { create: ["fr", "de", "es"].map((tag) => ({ targetLanguageTag: tag,
      status: "COMPLETED", translatedAst: fixture.translated, outputContentHash: templateHash(fixture.translated),
      completedAt: new Date() })) },
  } });
  runId = run.id;
});
after(async () => { await db.$disconnect(); });

test("Postgres concurrent finalisation is unique, idempotent, frozen and audit-backed", async () => {
  const outcomes = await Promise.allSettled([reviewTranslation(review("fr", "APPROVE"), { db, principal }),
    reviewTranslation(review("fr", "APPROVE"), { db, principal })]);
  assert.ok(outcomes.some((outcome) => outcome.status === "fulfilled"));
  assert.deepEqual(await reviewTranslation(review("fr", "APPROVE"), { db, principal }), { replay: true });
  const locales = await db.whatsAppTemplateLocale.findMany({ where: { definitionId, languageTag: "fr" } });
  assert.equal(locales.length, 1);
  assert.equal(locales[0].status, "REVIEWED");
  assert.equal(locales[0].providerLanguageCode, "fr");
  assert.equal((locales[0].localeAst as { schemaVersion: number }).schemaVersion, 1);
  assert.equal((await db.whatsAppTemplateTranslationItem.findUniqueOrThrow({
    where: { runId_targetLanguageTag: { runId, targetLanguageTag: "fr" } },
  })).resultLocaleId, locales[0].id);
  assert.equal(await db.commerceAuditEvent.count({ where: { action: "REVIEW_WHATSAPP_TEMPLATE_LOCALE", operationId: `${definitionId}:fr` } }), 1);
  await assert.rejects(reviewTranslation(review("fr", "REJECT"), { db, principal }), /already finalised/);
});

test("rejected locale contains no content and can only be finalised once; source and live assignments untouched", async () => {
  await reviewTranslation(review("de", "REJECT"), { db, principal });
  const rejected = await db.whatsAppTemplateLocale.findUniqueOrThrow({ where: { definitionId_languageTag: { definitionId, languageTag: "de" } } });
  assert.equal(rejected.status, "REJECTED");
  assert.equal(rejected.localeAst, null);
  assert.equal(rejected.contentHash, null);
  await assert.rejects(reviewTranslation(review("de", "APPROVE"), { db, principal }), /Clone as New/);
  const unchanged = await db.whatsAppTemplateLocale.findUniqueOrThrow({ where: { definitionId_languageTag: { definitionId, languageTag: "de" } } });
  assert.equal(unchanged.id, rejected.id);
  assert.equal(unchanged.status, "REJECTED");
  assert.equal(unchanged.localeAst, null);
  assert.equal(await db.commerceAuditEvent.count({ where: { action: "REVIEW_WHATSAPP_TEMPLATE_LOCALE", operationId: `${definitionId}:de` } }), 1);
  assert.equal((await db.whatsAppTemplateDefinition.findUniqueOrThrow({ where: { id: definitionId } })).sourceHash, templateHash(ast));
});

test("failing audit rolls back a locale and item link in real PostgreSQL", async () => {
  const failingDb: ReviewRepository = {
    $transaction: ((fn: (tx: Prisma.TransactionClient) => Promise<unknown>, options: unknown) =>
      db.$transaction(async (tx) => fn(new Proxy(tx, { get(target, key, receiver) {
        if (key === "commerceAuditEvent") return { create: async () => { throw new Error("intentional audit failure"); } };
        return Reflect.get(target, key, receiver);
      } }) as Prisma.TransactionClient), options as { isolationLevel?: Prisma.TransactionIsolationLevel; timeout?: number; maxWait?: number })) as ReviewRepository["$transaction"],
  } as ReviewRepository;
  await assert.rejects(reviewTranslation(review("es", "APPROVE"), { db: failingDb, principal }), /intentional audit failure/);
  assert.equal(await db.whatsAppTemplateLocale.count({ where: { definitionId, languageTag: "es" } }), 0);
  assert.equal((await db.whatsAppTemplateTranslationItem.findUniqueOrThrow({
    where: { runId_targetLanguageTag: { runId, targetLanguageTag: "es" } },
  })).resultLocaleId, null);
  await assert.rejects(reviewTranslation(review("es", "APPROVE"), { db, principal: { ...principal, role: "ADMIN" } }), /SUPER_ADMIN/);
});
