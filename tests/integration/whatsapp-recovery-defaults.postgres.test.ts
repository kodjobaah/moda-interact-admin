import assert from "node:assert/strict";
import { test, after } from "node:test";
import { PrismaClient, Prisma } from "@prisma/client";
import { ACTOR_ID, WABA } from "../fixtures/arch047-publication.fixture";
import { recoveryDefaultFixture } from "../fixtures/whatsapp-recovery-defaults.fixture";
import { previewRecoveryDefault, readRecoveryDefaults, setRecoveryDefault } from "../../src/lib/admin/whatsapp-templates/recovery-defaults/service";
import { PublicationError } from "../../src/lib/admin/whatsapp-templates/publishing/validation";

// The owning harness always starts an invocation-owned PostgreSQL container and sets this exact URL.
if (process.env.ARCH047_PUBLICATION_DISPOSABLE_POSTGRES !== "1" || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID !== WABA ||
    !/^postgresql:\/\/postgres:fixture-only@127\.0\.0\.1:\d+\/arch047_publication_fixture\?schema=public$/.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Refusing non-disposable recovery-default integration execution");
}
const db = new PrismaClient();
after(async () => { await db.$disconnect(); });
const principal = { id: ACTOR_ID, role: "SUPER_ADMIN" as const };
const code = (expected: string) => (error: unknown) => error instanceof PublicationError && error.code === expected;
const confirm = (preview: Awaited<ReturnType<typeof previewRecoveryDefault>>) => setRecoveryDefault({
  definitionId: preview.definitionId, fingerprint: preview.fingerprint, issuedAt: preview.issuedAt, reason: "Reviewed platform recovery default",
}, { db, principal });

async function seedDefinition(suffix: string) {
  const f = recoveryDefaultFixture(suffix);
  await db.whatsAppTemplateDefinition.create({ data: {
    id: f.id, kind: f.kind, purpose: f.purpose, offerType: f.offerType, providerTemplateName: f.providerTemplateName,
    sourceLanguageTag: "en", astSchemaVersion: 1, sourceHash: f.sourceHash, category: "MARKETING",
    status: f.status, createdByAdminId: ACTOR_ID,
    locales: { create: f.locales.map(l => ({ id: l.id, languageTag: l.languageTag, providerLanguageCode: l.providerLanguageCode,
      localeAst: l.localeAst as unknown as Prisma.InputJsonValue, contentHash: l.contentHash, status: l.status,
      reviewedAt: l.reviewedAt, reviewedByAdminId: l.reviewedByAdminId,
      metaRegistrations: { create: l.metaRegistrations.map(({ localeId: _localeId, ...reg }) => ({ ...reg,
        componentsSnapshot: reg.componentsSnapshot as unknown as Prisma.InputJsonValue,
        parameterBindingsSnapshot: reg.parameterBindingsSnapshot as unknown as Prisma.InputJsonValue,
      })) },
    })) },
  } });
  return f;
}

test("set and replace with zero merchants, retain immutable content and existing shop variants, reject drift/stale review, atomic audit rollback", async () => {
  await db.platformAdmin.create({ data: { id: ACTOR_ID, email: `${ACTOR_ID}@example.invalid`, provider: "default-fixture",
    providerSubject: ACTOR_ID, displayName: "Recovery defaults test", role: "SUPER_ADMIN", active: true } });
  const a = await seedDefinition("a"), b = await seedDefinition("b");
  const registration = a.locales[0].metaRegistrations[0];
  const originalLocales = await db.whatsAppTemplateLocale.findMany({ where: { definitionId: a.id }, orderBy: { id: "asc" } });
  const originalRegistrations = await db.whatsAppTemplateMetaRegistration.findMany({ where: { locale: { definitionId: a.id } }, orderBy: { id: "asc" } });
  assert.equal(await db.shop.count(), 0);
  assert.ok((await readRecoveryDefaults(db, principal)).slots.every(slot => !slot.current));
  const staleB = await previewRecoveryDefault(db, principal, b.id);
  const aPreview = await previewRecoveryDefault(db, principal, a.id);
  assert.equal(aPreview.languageTags.length, 20);
  await confirm(aPreview);
  const published = await db.whatsAppTemplateDefinition.findUniqueOrThrow({ where: { id: a.id } });
  assert.equal(published.status, "PUBLISHED"); assert.ok(published.publishedAt);
  assert.equal(await db.whatsAppTemplatePublicationOperation.count(), 0);
  assert.equal(await db.whatsAppTemplatePublicationTarget.count(), 0);
  assert.equal(await db.whatsAppTemplateVariant.count(), 0);
  assert.deepEqual(await db.whatsAppTemplateLocale.findMany({ where: { definitionId: a.id }, orderBy: { id: "asc" } }), originalLocales);
  assert.deepEqual(await db.whatsAppTemplateMetaRegistration.findMany({ where: { locale: { definitionId: a.id } }, orderBy: { id: "asc" } }), originalRegistrations);
  assert.equal((await confirm(await previewRecoveryDefault(db, principal, a.id))).unchanged, true);
  assert.equal(await db.commerceAuditEvent.count({ where: { metadata: { path: ["operation"], equals: "SET_RECOVERY_TEMPLATE_DEFAULT" } } }), 1);
  await assert.rejects(confirm(staleB), code("STALE_PREVIEW"));
  await db.shop.create({ data: { id: "default-fixture-shop", domain: "default-fixture.example.invalid", platform: "SHOPIFY", status: "ACTIVE" } });
  const existing = await db.whatsAppTemplateVariant.create({ data: {
    shopId: "default-fixture-shop", providerAccountId: WABA, purpose: "INITIAL_NO_OFFER", languageTag: a.locales[0].languageTag,
    providerLanguageCode: registration.providerLanguageCode, providerTemplateName: registration.providerTemplateName,
    providerTemplateId: registration.providerTemplateId, metaRegistrationId: registration.id, enabled: true, status: "APPROVED",
  } });
  const bReg = b.locales[0].metaRegistrations[0];
  const beforeDrift = await previewRecoveryDefault(db, principal, b.id);
  await db.whatsAppTemplateMetaRegistration.update({ where: { id: bReg.id }, data: { driftDetectedAt: new Date() } });
  await assert.rejects(confirm(beforeDrift), code("NOT_READY"));
  await db.whatsAppTemplateMetaRegistration.update({ where: { id: bReg.id }, data: { driftDetectedAt: null } });
  const bPreview = await previewRecoveryDefault(db, principal, b.id);
  // A database error after both pointer and lifecycle writes must roll back all of them.
  await db.$executeRawUnsafe(`CREATE FUNCTION commerce.test_default_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW."metadata"->>'operation' = 'SET_RECOVERY_TEMPLATE_DEFAULT' THEN RAISE EXCEPTION 'fixture audit failure'; END IF; RETURN NEW; END; $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER test_default_audit_failure BEFORE INSERT ON commerce."CommerceAuditEvent" FOR EACH ROW EXECUTE FUNCTION commerce.test_default_audit_failure()`);
  try { await assert.rejects(confirm(bPreview)); }
  finally {
    await db.$executeRawUnsafe(`DROP TRIGGER test_default_audit_failure ON commerce."CommerceAuditEvent"`);
    await db.$executeRawUnsafe(`DROP FUNCTION commerce.test_default_audit_failure()`);
  }
  const where = { wabaId_purpose: { wabaId: WABA, purpose: "INITIAL_NO_OFFER" } };
  assert.equal((await db.whatsAppRecoveryTemplateDefault.findUniqueOrThrow({ where })).definitionId, a.id);
  assert.equal((await db.whatsAppTemplateDefinition.findUniqueOrThrow({ where: { id: b.id } })).status, "TRANSLATION_QUEUED");
  await confirm(await previewRecoveryDefault(db, principal, b.id));
  assert.equal((await db.whatsAppRecoveryTemplateDefault.findUniqueOrThrow({ where })).definitionId, b.id);
  assert.deepEqual(await db.whatsAppTemplateVariant.findUniqueOrThrow({ where: { id: existing.id } }), existing);
  assert.equal(await db.whatsAppTemplatePublicationOperation.count(), 0);
  assert.equal(await db.whatsAppTemplatePublicationTarget.count(), 0);
  assert.equal((await db.whatsAppTemplateDefinition.findUniqueOrThrow({ where: { id: a.id } })).publishedAt?.getTime(), published.publishedAt?.getTime());
  assert.equal(await db.commerceAuditEvent.count({ where: { metadata: { path: ["operation"], equals: "SET_RECOVERY_TEMPLATE_DEFAULT" } } }), 2);
});
