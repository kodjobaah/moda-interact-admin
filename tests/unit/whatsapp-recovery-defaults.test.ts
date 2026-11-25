import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { ACTOR_ID, WABA } from "../fixtures/arch047-publication.fixture";
import { recoveryDefaultFixture } from "../fixtures/whatsapp-recovery-defaults.fixture";
import { previewRecoveryDefault, readRecoveryDefaults, setRecoveryDefault } from "../../src/lib/admin/whatsapp-templates/recovery-defaults/service";
import { confirmScopedPublication, parsePublicationIntent, previewScopedPublication } from "../../src/lib/admin/whatsapp-templates/publishing/unified";
import type { PublicationIntent, PublicationPreview } from "../../src/lib/admin/whatsapp-templates/publishing/types";
import { verifiedDefaultFormat } from "../../src/lib/admin/whatsapp-templates/recovery-defaults/format";
import type { ApprovedSource } from "../../src/lib/admin/whatsapp-templates/publishing/source";
import { PublicationError } from "../../src/lib/admin/whatsapp-templates/publishing/validation";

process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = WABA;
process.env.DEPLOYMENT_ENVIRONMENT_NAME = "test";
const principal = { id: ACTOR_ID, role: "SUPER_ADMIN" as const, developmentBypass: false };
const code = (expected: string) => (error: unknown) => error instanceof PublicationError && error.code === expected;

function fakeDb() {
  const a = recoveryDefaultFixture(), b = recoveryDefaultFixture("b");
  const state = { pointer: null as null | { id: string; purpose: string; format: string; definitionId: string; updatedAt: Date },
    audits: [] as unknown[], actorActive: true, sharedLayoutActive: false, writes: 0 };
  const definition = (id: string) => [a, b].find(item => item.id === id);
  const pointer = () => state.pointer ? { ...state.pointer, definition: definition(state.pointer.definitionId)! } : null;
  // No shop, variant or publication delegates at all: any attempted merchant work fails the test.
  const fake = {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(fake),
    $queryRaw: async (sql: TemplateStringsArray, ...values: unknown[]) => {
      const query = sql.join(" ");
      if (query.includes('FROM "public"."PlatformAdmin"')) return state.actorActive ? [{ id: ACTOR_ID }] : [];
      if (query.includes('FROM "whatsapp"."WhatsAppTemplateMetaRegistration"')) return definition(String(values[0]))?.locales.flatMap(locale => locale.metaRegistrations) ?? [];
      if (query.includes('FROM "whatsapp"."WhatsAppTemplateLocale"')) return definition(String(values[0]))?.locales ?? [];
      return [];
    },
    platformConfiguration: { findUnique: async () => null },
    whatsAppConversationWrapperActiveSlot: { findUnique: async () => state.sharedLayoutActive ? { definitionId: "shared-layout", definition: { status: "PUBLISHED", publishedAt: new Date(), retiredAt: null } } : null },
    whatsAppTemplateDefinition: {
      findUnique: async ({ where }: { where: { id: string } }) => definition(where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: { status: string; publishedAt: Date } }) => {
        const row = definition(where.id)!;
        Object.assign(row, data); state.writes++; return row;
      },
    },
    whatsAppRecoveryTemplateDefault: {
      findUnique: async () => pointer(),
      findMany: async () => state.pointer ? [pointer()] : [],
      upsert: async ({ create, update }: { create: { definitionId: string; purpose: string; format: string }; update: { definitionId: string } }) => {
        state.pointer = { id: "default-id", purpose: create.purpose, format: create.format, definitionId: state.pointer ? update.definitionId : create.definitionId, updatedAt: new Date() };
        state.writes++; return state.pointer;
      },
    },
    commerceAuditEvent: { create: async ({ data }: { data: unknown }) => { state.audits.push(data); return {}; } },
  };
  return { db: fake as unknown as PrismaClient, a, b, state };
}
const confirmation = (preview: Awaited<ReturnType<typeof previewRecoveryDefault>>) => ({
  definitionId: preview.definitionId, fingerprint: preview.fingerprint, issuedAt: preview.issuedAt, reason: "Reviewed recovery default",
});

test("twelve independent slots; set and replace without any merchant delegate; preserve first publication and audit", async () => {
  const { db, a, b, state } = fakeDb();
  const overview = await readRecoveryDefaults(db, principal);
  assert.equal(overview.wabaId, WABA); assert.equal(overview.slots.length, 12);
  assert.ok(overview.slots.every(slot => slot.current === null));
  const first = await previewRecoveryDefault(db, principal, a.id);
  assert.equal(first.languageTags.length, 20); assert.equal(first.current, null);
  await setRecoveryDefault(confirmation(first), { db, principal });
  assert.equal(a.status, "PUBLISHED"); assert.ok(a.publishedAt);
  assert.equal(state.pointer?.definitionId, a.id); assert.equal(state.audits.length, 1);
  const writes = state.writes;
  assert.equal((await setRecoveryDefault(confirmation(await previewRecoveryDefault(db, principal, a.id)), { db, principal })).unchanged, true);
  assert.equal(state.writes, writes); assert.equal(state.audits.length, 1);
  const next = await previewRecoveryDefault(db, principal, b.id);
  assert.equal(next.current?.definitionId, a.id);
  await setRecoveryDefault(confirmation(next), { db, principal });
  assert.equal(state.pointer?.definitionId, b.id); assert.equal(state.audits.length, 2);
  assert.equal(a.status, "PUBLISHED"); assert.ok(a.publishedAt);
});

test("review and confirmation revalidate complete approved registrations, drift and current pointer", async () => {
  const { db, a, b, state } = fakeDb();
  const first = await previewRecoveryDefault(db, principal, a.id);
  const reg = a.locales[0].metaRegistrations[0];
  reg.providerStatus = "REJECTED";
  await assert.rejects(setRecoveryDefault(confirmation(first), { db, principal }), code("NOT_READY"));
  assert.equal(state.writes, 0); assert.equal(state.pointer?.definitionId ?? null, null);
  reg.providerStatus = "APPROVED";
  const original = reg.lastObservedContentHash;
  reg.lastObservedContentHash = "f".repeat(64);
  await assert.rejects(previewRecoveryDefault(db, principal, a.id), code("NOT_READY"));
  reg.lastObservedContentHash = original;
  const reconciliation = reg.lastReconciledAt;
  reg.lastReconciledAt = null;
  await assert.rejects(previewRecoveryDefault(db, principal, a.id), code("NOT_READY"));
  reg.lastReconciledAt = reconciliation;
  a.locales[0].status = "SOURCE_SAVED";
  await assert.rejects(previewRecoveryDefault(db, principal, a.id), code("NOT_READY"));
  a.locales[0].status = "REVIEWED";
  const locale = a.locales.pop()!;
  await assert.rejects(previewRecoveryDefault(db, principal, a.id), code("NOT_READY"));
  a.locales.push(locale);
  reg.wabaId = "9999999999";
  await assert.rejects(previewRecoveryDefault(db, principal, a.id), code("NOT_READY"));
  reg.wabaId = WABA;
  state.sharedLayoutActive = true;
  await assert.rejects(previewRecoveryDefault(db, principal, a.id), code("COMMON_LAYOUT_REQUIRED"));
  state.sharedLayoutActive = false;
  const pending = await previewRecoveryDefault(db, principal, b.id);
  await setRecoveryDefault(confirmation(await previewRecoveryDefault(db, principal, a.id)), { db, principal });
  await assert.rejects(setRecoveryDefault(confirmation(pending), { db, principal }), code("STALE_PREVIEW"));
  assert.equal(state.pointer?.definitionId, a.id);
});

test("server identity only; reject malformed requests, non-SUPER_ADMIN, expired review and revoked actor", async () => {
  const { db, a, state } = fakeDb();
  const preview = await previewRecoveryDefault(db, principal, a.id);
  const unauthorized = { ...principal, role: "SUPPORT" } as unknown as typeof principal;
  await assert.rejects(previewRecoveryDefault(db, unauthorized, a.id), /SUPER_ADMIN/);
  await assert.rejects(setRecoveryDefault(confirmation(preview), { db, principal: unauthorized }), /SUPER_ADMIN/);
  await assert.rejects(setRecoveryDefault({ ...confirmation(preview), wabaId: "999999" } as never, { db, principal }), code("INPUT"));
  await assert.rejects(setRecoveryDefault({ ...confirmation(preview), issuedAt: "2020-01-01T00:00:00.000Z" }, { db, principal }), code("STALE_PREVIEW"));
  state.actorActive = false;
  await assert.rejects(setRecoveryDefault(confirmation(preview), { db, principal }), code("FORBIDDEN"));
  assert.equal(state.writes, 0); assert.equal(state.audits.length, 0);
});

const publicationRequest = (preview: PublicationPreview, scope: PublicationIntent) => ({
  definitionId: preview.definitionId, scope, previewFingerprint: preview.fingerprint, previewIssuedAt: preview.issuedAt,
  operationKey: "unified-operation-key", reason: "Reviewed unified publication", acknowledgeOverrides: false,
});

test("future only uses the shared review and write, with no merchant or publication delegate", async () => {
  const { db, a, state } = fakeDb();
  const scope = { mode: "future" } as const;
  const preview = await previewScopedPublication(db, principal, { definitionId: a.id, scope, page: 1 });
  assert.equal(preview.totalShops, 0); assert.equal(preview.totalTargets, 0);
  assert.equal(preview.defaultImpact?.currentTemplateName, null);
  assert.equal(preview.defaultImpact?.proposedTemplateName, a.providerTemplateName);
  const result = await confirmScopedPublication(publicationRequest(preview, scope), { db, principal });
  assert.deepEqual(result, { kind: "default_only", purpose: "INITIAL_NO_OFFER" });
  assert.equal(state.pointer?.definitionId, a.id); assert.equal(state.audits.length, 1);
  const refreshed = await previewScopedPublication(db, principal, { definitionId: a.id, scope, page: 1 });
  await confirmScopedPublication(publicationRequest(refreshed, scope), { db, principal });
  assert.equal(state.audits.length, 1);
});

test("all existing and future supports zero shops; fingerprints bind the future-only intent", async () => {
  const { db, a, b, state } = fakeDb();
  Object.assign(db, { shop: { findMany: async () => [] },
    whatsAppTemplatePublicationOperation: { findUnique: async () => null } });
  const scope = { mode: "all_future" } as const;
  const preview = await previewScopedPublication(db, principal, { definitionId: a.id, scope, page: 1 });
  assert.equal(preview.totalShops, 0);
  await assert.rejects(confirmScopedPublication(publicationRequest(preview, { mode: "future" }), { db, principal }), code("STALE_PREVIEW"));
  assert.equal(Boolean(state.pointer), false);
  const stale = await previewScopedPublication(db, principal, { definitionId: b.id, scope, page: 1 });
  assert.deepEqual(await confirmScopedPublication(publicationRequest(preview, scope), { db, principal }), { kind: "default_only", purpose: "INITIAL_NO_OFFER" });
  await assert.rejects(confirmScopedPublication(publicationRequest(stale, scope), { db, principal }), code("STALE_PREVIEW"));
  assert.equal(state.pointer?.definitionId, a.id);
});

test("future publication refuses invalid scope payload, revoked Meta approval and stale common revision", async () => {
  const { db, a, state } = fakeDb();
  const scope = { mode: "future" } as const;
  assert.throws(() => parsePublicationIntent({ mode: "future", shopIds: ["x"] }), code("INPUT"));
  assert.throws(() => parsePublicationIntent({ mode: "all_future", wabaId: WABA }), code("INPUT"));
  const preview = await previewScopedPublication(db, principal, { definitionId: a.id, scope, page: 1 });
  a.locales[0].metaRegistrations[0].providerStatus = "REJECTED";
  await assert.rejects(confirmScopedPublication(publicationRequest(preview, scope), { db, principal }), code("NOT_READY"));
  a.locales[0].metaRegistrations[0].providerStatus = "APPROVED";
  state.sharedLayoutActive = true;
  await assert.rejects(previewScopedPublication(db, principal, { definitionId: a.id, scope, page: 1 }), code("COMMON_LAYOUT_REQUIRED"));
  assert.equal(state.writes, 0);
});


test("TEXT defaults cannot require merchant branding or a mixed IMAGE registration", () => {
 const source = {headerKind:"NONE",locales:[{languageTag:"en",view:{},brandFields:[]}]} as unknown as ApprovedSource;
 assert.equal(verifiedDefaultFormat(source),"TEXT");
 assert.throws(()=>verifiedDefaultFormat({...source,locales:[{...source.locales[0],brandFields:["shopBrand.brandName"]}]}),code("NOT_READY"));
 assert.throws(()=>verifiedDefaultFormat({...source,locales:[{...source.locales[0],view:{...source.locales[0].view,headerFormat:"IMAGE"}}]}),code("CONTENT"));
});
