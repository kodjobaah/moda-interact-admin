import assert from "node:assert/strict";
import { test, after } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient, Prisma } from "@prisma/client";
import { definitionFixture, shopFixture, WABA, ACTOR_ID, DEFINITION_ID } from "../fixtures/arch047-publication.fixture.ts";
import { computePreview } from "../../src/lib/admin/whatsapp-templates/publishing/preview.ts";
import { confirmPublication } from "../../src/lib/admin/whatsapp-templates/publishing/operation.ts";
import { advancePublication } from "../../src/lib/admin/whatsapp-templates/publishing/assignment.ts";
import { PublicationError } from "../../src/lib/admin/whatsapp-templates/publishing/validation.ts";

if (process.env.ARCH047_PUBLICATION_DISPOSABLE_POSTGRES !== "1") throw new Error("Refusing non-disposable publication integration execution.");
if (process.env.WHATSAPP_BUSINESS_ACCOUNT_ID !== WABA) throw new Error("Test must resolve the exact disposable WABA.");
const db = new PrismaClient();
after(async () => { await db.$disconnect(); });
const principal = { id: ACTOR_ID, role: "SUPER_ADMIN" as const, developmentBypass: false };

async function persistDefinition(original = definitionFixture()) {
  const definition = structuredClone(original);
  const locales = definition.locales;
  await db.whatsAppTemplateDefinition.create({ data: {
    id: definition.id, kind: definition.kind, purpose: definition.purpose, offerType: definition.offerType,
    sourceLanguageTag: "en", astSchemaVersion: 1, sourceHash: definition.sourceHash,
    category: "MARKETING", providerTemplateName: definition.providerTemplateName, status: "SAVED",
    createdByAdminId: ACTOR_ID,
  } });
  for (const locale of locales) {
    const reg = locale.metaRegistrations[0];
    await db.whatsAppTemplateLocale.create({ data: {
      id: locale.id, definitionId: definition.id, languageTag: locale.languageTag, providerLanguageCode: locale.providerLanguageCode,
      localeAst: locale.localeAst as unknown as Prisma.InputJsonValue, contentHash: locale.contentHash,
      status: locale.status, reviewedAt: locale.reviewedAt, reviewedByAdminId: locale.reviewedByAdminId,
    } });
    await db.whatsAppTemplateMetaRegistration.create({ data: {
      id: reg.id, localeId: locale.id, wabaId: WABA, providerTemplateName: reg.providerTemplateName,
      providerLanguageCode: reg.providerLanguageCode, category: "MARKETING",
      componentsSnapshot: reg.componentsSnapshot as unknown as Prisma.InputJsonValue,
      parameterBindingsSnapshot: reg.parameterBindingsSnapshot as unknown as Prisma.InputJsonValue,
      submittedContentHash: reg.submittedContentHash, providerTemplateId: reg.providerTemplateId,
      submissionState: "APPROVED", providerStatus: "APPROVED",
      lastObservedCategory: "MARKETING", lastObservedContentHash: reg.submittedContentHash,
    } });
  }
}
async function start(scope: { mode: "one"; shopId: string } | { mode: "all" }) {
  const issuedAt = new Date().toISOString();
  const preview = await computePreview(db, DEFINITION_ID, scope, WABA, issuedAt);
  const progress = await confirmPublication({ definitionId: DEFINITION_ID, scope, previewIssuedAt: issuedAt,
    previewFingerprint: preview.previewFingerprint, operationKey: randomUUID(),
    reason: "Integration-test approved publication", acknowledgeOverrides: true,
  }, { db, principal, getWaba: async () => WABA });
  return { preview, progress };
}
async function finish(operationId: string) {
  let progress = await advancePublication(db, operationId);
  for (let i = 0; i < 100 && progress.status === "IN_PROGRESS"; i++) progress = await advancePublication(db, operationId);
  return progress;
}

test("100 active shops × 20 approved languages: bounded resume, durable targets, audit and idempotency", async () => {
  await db.platformAdmin.create({ data: { id: ACTOR_ID, email: `${ACTOR_ID}@example.invalid`,
    provider: "arch047-fixture", providerSubject: ACTOR_ID, displayName: "Publication test", role: "SUPER_ADMIN", active: true } });
  await persistDefinition();
  await db.shop.createMany({ data: Array.from({ length: 100 }, (_, index) => {
    const s = shopFixture(index + 1); return { id: s.id, domain: s.domain, platform: "SHOPIFY", status: "ACTIVE" };
  }) });
  await db.shopBrand.create({ data: { shopId: "shop_0001", brandName: "A configured brand" } });
  await db.shopBrand.create({ data: { shopId: "shop_0002", brandName: null } });
  const { preview, progress } = await start({ mode: "all" });
  assert.equal(preview.shopIds.length, 100); assert.equal(preview.impactCounts.new, 2000);
  assert.equal(progress.totalTargets, 2000); assert.equal(progress.totalShops, 100);
  let first = await advancePublication(db, progress.operationId);
  assert.equal(first.succeededShops, 5); assert.equal(first.succeededTargets, 100);
  assert.equal(first.pendingTargets, 1900);
  // Resume after an interrupted request; cursor remains a stable shop index.
  first = await finish(progress.operationId);
  assert.equal(first.status, "COMPLETE"); assert.equal(first.succeededShops, 100);
  assert.equal(first.succeededTargets, 2000); assert.equal(first.failedTargets, 0);
  assert.equal(await db.whatsAppTemplatePublicationTarget.count({ where: { operationId: progress.operationId } }), 2000);
  assert.equal(await db.whatsAppTemplateVariant.count({ where: {
    providerAccountId: WABA, purpose: "INITIAL_NO_OFFER", status: "APPROVED", enabled: true,
  } }), 2000);
  assert.equal(await db.commerceAuditEvent.count({ where: { operationId: progress.operationId } }), 2001);
  const retry = await advancePublication(db, progress.operationId);
  assert.equal(retry.status, "COMPLETE");
  assert.equal(await db.commerceAuditEvent.count({ where: { operationId: progress.operationId } }), 2001);
  const target = await db.whatsAppTemplatePublicationTarget.findFirstOrThrow({ where: { operationId: progress.operationId } });
  assert.ok(target.newVariantId); assert.equal(target.previousVariantId, null);
});

test("fresh provider approval and slot identity are rechecked; stale confirmation fails", async () => {
  const issuedAt = new Date().toISOString();
  const preview = await computePreview(db, DEFINITION_ID, { mode: "one", shopId: "shop_0001" }, WABA, issuedAt);
  await db.whatsAppTemplateMetaRegistration.update({ where: { id: "registration_0" }, data: { providerStatus: "PAUSED" } });
  await assert.rejects(confirmPublication({ definitionId: DEFINITION_ID,
    scope: { mode: "one", shopId: "shop_0001" }, previewIssuedAt: issuedAt,
    previewFingerprint: preview.previewFingerprint, operationKey: randomUUID(),
    reason: "Stale confirmation must fail", acknowledgeOverrides: true,
  }, { db, principal, getWaba: async () => WABA }), (error: unknown) => error instanceof PublicationError && error.code === "NOT_READY");
  await db.whatsAppTemplateMetaRegistration.update({ where: { id: "registration_0" }, data: { providerStatus: "APPROVED" } });
});

test("per-shop rollback on forced audit failure, then bounded retry without partial variants", async () => {
  // Re-publish a new immutable definition to a previously assigned shop so there
  // is a real 20-language replacement; an injected mid-batch audit failure must roll back earlier languages.
  const next = definitionFixture();
  next.id = `wtdef_${"b".repeat(64)}`;
  next.providerTemplateName = "moda_initial_no_offer_new_arch047_fixture";
  for (const [index, locale] of next.locales.entries()) {
    locale.id = `new_locale_${index}`; locale.definitionId = next.id;
    locale.metaRegistrations[0].id = `new_registration_${index}`;
    locale.metaRegistrations[0].localeId = locale.id;
    locale.metaRegistrations[0].providerTemplateName = next.providerTemplateName;
  }
  await persistDefinition(next);
  const one = { mode: "one" as const, shopId: "shop_0001" };
  const issuedAt = new Date().toISOString();
  const impact = await computePreview(db, next.id, one, WABA, issuedAt);
  assert.equal(impact.impactCounts.replaced, 20);
  const op = await confirmPublication({ definitionId: next.id, scope: one, previewIssuedAt: issuedAt,
    previewFingerprint: impact.previewFingerprint, operationKey: randomUUID(),
    reason: "Replace with reviewed second version", acknowledgeOverrides: true,
  }, { db, principal, getWaba: async () => WABA });
  await db.$executeRawUnsafe(`
    CREATE FUNCTION commerce.arch047_test_fail_audit() RETURNS trigger AS $$
    BEGIN
      IF NEW."action"::text = 'ASSIGN_WHATSAPP_TEMPLATE_DEFINITION'
         AND NEW."shopId" = 'shop_0001'
         AND NEW."metadata" ->> 'languageTag' = 'fr' THEN
        RAISE EXCEPTION 'ARCH047 deliberately failed audit';
      END IF;
      RETURN NEW;
    END; $$ LANGUAGE plpgsql;
  `);
  await db.$executeRawUnsafe(`
    CREATE TRIGGER arch047_test_fail_audit BEFORE INSERT ON commerce."CommerceAuditEvent"
    FOR EACH ROW EXECUTE FUNCTION commerce.arch047_test_fail_audit();
  `);
  try {
    const failed = await advancePublication(db, op.operationId);
    assert.equal(failed.failedTargets, 20); assert.equal(failed.succeededTargets, 0);
    assert.equal(await db.whatsAppTemplateVariant.count({ where: { shopId: "shop_0001",
      metaRegistrationId: { in: next.locales.map((l) => l.metaRegistrations[0].id) }, enabled: true } }), 0);
    assert.equal(await db.commerceAuditEvent.count({ where: { operationId: op.operationId, shopId: "shop_0001" } }), 0);
  } finally {
    await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS arch047_test_fail_audit ON commerce."CommerceAuditEvent"`);
    await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS commerce.arch047_test_fail_audit()`);
  }
  const recovered = await advancePublication(db, op.operationId, true);
  assert.equal(recovered.status, "COMPLETE"); assert.equal(recovered.succeededTargets, 20);
  assert.equal(await db.whatsAppTemplateVariant.count({ where: { shopId: "shop_0001",
    purpose: "INITIAL_NO_OFFER", enabled: true, status: "APPROVED" } }), 20);
});

test("overlapping selected and all-shop publications serialise by shop and cannot double-publish", async () => {
  const replacementId = `wtdef_${"b".repeat(64)}`;
  const scope = { mode: "one" as const, shopId: "shop_0002" };
  const all = { mode: "all" as const };
  const issuedAt = new Date().toISOString();
  const [onePreview, bulkPreview] = await Promise.all([
    computePreview(db, replacementId, scope, WABA, issuedAt),
    computePreview(db, replacementId, all, WABA, issuedAt),
  ]);
  const one = await confirmPublication({ definitionId: replacementId, scope, previewIssuedAt: issuedAt,
    previewFingerprint: onePreview.previewFingerprint, operationKey: randomUUID(),
    reason: "Race against bulk publication", acknowledgeOverrides: true,
  }, { db, principal, getWaba: async () => WABA });
  const bulk = await confirmPublication({ definitionId: replacementId, scope: all, previewIssuedAt: issuedAt,
    previewFingerprint: bulkPreview.previewFingerprint, operationKey: randomUUID(),
    reason: "Overlapping publication of all shops", acknowledgeOverrides: true,
  }, { db, principal, getWaba: async () => WABA });
  await Promise.all([advancePublication(db, one.operationId), advancePublication(db, bulk.operationId)]);
  assert.equal(await db.whatsAppTemplateVariant.count({ where: {
    shopId: "shop_0002", providerAccountId: WABA, purpose: "INITIAL_NO_OFFER", enabled: true, status: "APPROVED",
  } }), 20);
  const changed = await db.commerceAuditEvent.count({ where: { shopId: "shop_0002",
    action: "ASSIGN_WHATSAPP_TEMPLATE_DEFINITION", operationId: { in: [one.operationId, bulk.operationId] },
  } });
  assert.equal(changed, 20, "overlapping operations cannot create duplicate writes/audits");
});

test("never adopts an unlinked/external identity; conflict rolls back all twenty languages", async () => {
  const nextDefinitionId = `wtdef_${"b".repeat(64)}`;
  await db.whatsAppTemplateVariant.create({ data: {
    shopId: "shop_0003", providerAccountId: WABA, purpose: "INITIAL_NO_OFFER", languageTag: "en",
    providerTemplateName: "moda_initial_no_offer_new_arch047_fixture", providerLanguageCode: "en",
    providerTemplateId: "unverified_external", metaRegistrationId: null, status: "APPROVED", enabled: false,
  } });
  const scope = { mode: "one" as const, shopId: "shop_0003" };
  const issuedAt = new Date().toISOString();
  const preview = await computePreview(db, nextDefinitionId, scope, WABA, issuedAt);
  const operation = await confirmPublication({ definitionId: nextDefinitionId, scope,
    previewIssuedAt: issuedAt, previewFingerprint: preview.previewFingerprint,
    operationKey: randomUUID(), reason: "Confirm identity guard on publication", acknowledgeOverrides: true,
  }, { db, principal, getWaba: async () => WABA });
  const progress = await advancePublication(db, operation.operationId);
  assert.equal(progress.failedTargets, 20);
  assert.equal(progress.succeededTargets, 0);
  assert.equal(await db.whatsAppTemplateVariant.count({ where: { shopId: "shop_0003",
    metaRegistrationId: { not: null }, enabled: true,
    providerTemplateName: "moda_initial_no_offer_new_arch047_fixture",
  } }), 0);
  const unauthorised = await db.whatsAppTemplateVariant.findFirstOrThrow({ where: { shopId: "shop_0003",
    providerTemplateName: "moda_initial_no_offer_new_arch047_fixture", providerLanguageCode: "en",
  } });
  assert.equal(unauthorised.metaRegistrationId, null);
  assert.equal(unauthorised.enabled, false);
  assert.equal(await db.commerceAuditEvent.count({ where: {
    operationId: operation.operationId, action: "ASSIGN_WHATSAPP_TEMPLATE_DEFINITION",
  } }), 0);
});
