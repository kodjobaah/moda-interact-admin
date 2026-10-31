import assert from "node:assert/strict";
import { test } from "node:test";
import { compileTemplateAst } from "../../src/lib/admin/whatsapp-templates/authoring/compiler.ts";
import { newMetaDraft } from "../../src/lib/admin/whatsapp-templates/authoring/draft-operations.ts";
import { templateHash } from "../../src/lib/admin/whatsapp-templates/authoring/identifiers.ts";
import { confirmMetaSubmission } from "../../src/lib/admin/whatsapp-templates/meta/submission.ts";
import { requestMetaReconciliation } from "../../src/lib/admin/whatsapp-templates/meta/reconcile.ts";
import { requestMetaTechnicalRetry } from "../../src/lib/admin/whatsapp-templates/meta/technical-retry.ts";
import { readMetaStatus } from "../../src/lib/admin/whatsapp-templates/meta/status.ts";
import { fixture, localizedInitialCopy } from "../helpers/arch047-template-meta-fixture.ts";

const principal = { id: "admin-123", role: "SUPER_ADMIN", developmentBypass: false } as const;
function mockedDb() {
  const f = fixture();
  const registrations: any[] = [];
  const events: any[] = [];
  const audits: any[] = [];
  let failAudit = false;
  let serialization = Promise.resolve();
  const registrationClient = (rows: any[], newEvents: any[]) => ({
    findMany: async ({ where, include }: any) => {
      const matches = rows.filter((r) => where.OR
        ? where.OR.some((q: any) => q.localeId?.in?.includes(r.localeId) || q.wabaId === r.wabaId && q.providerTemplateName === r.providerTemplateName)
        : f.locales.some((l) => l.id === r.localeId));
      if (!include) return matches;
      return matches.slice(0, 21).map((r) => ({ ...r, locale: r.locale,
        events: newEvents.filter((e) => e.registrationId === r.id).slice(-8).reverse() }));
    },
    createMany: async ({ data }: any) => {
      for (const candidate of data) {
        if ([...registrations, ...rows].some((row) => row.wabaId === candidate.wabaId &&
          row.providerTemplateName === candidate.providerTemplateName && row.providerLanguageCode === candidate.providerLanguageCode)) throw { code: "P2002" };
        rows.push({ ...candidate, id: `reg-${candidate.localeId}`, providerStatus: null,
          failureCode: null, providerTemplateId: null, lastSubmittedAt: null, nextRetryAt: null,
          lastReconciledAt: null, driftDetectedAt: null, lastObservedContentHash: null,
          lastObservedCategory: null, locale: { definitionId: f.definition.id,
            languageTag: f.locales.find((locale) => locale.id === candidate.localeId)?.languageTag } });
      }
      return { count: data.length };
    },
    findUnique: async ({ where }: any) => [...registrations, ...rows].find((r) => r.id === where.id) ?? null,
  });
  const definitionClient = {
    findUnique: async () => ({ ...f.definition, locales: f.locales }),
  };
  const db: any = {
    whatsAppTemplateDefinition: definitionClient,
    whatsAppTemplateMetaRegistration: registrationClient(registrations, events),
    whatsAppTemplateMetaEvent: {
      findFirst: async ({ where }: any) => events.find((event) => event.registrationId === where.registrationId &&
        event.source === where.source && event.eventType === where.eventType && event.processedAt === null) ?? null,
    },
    $transaction: async (callback: any) => {
      // A serializable in-memory transaction with rollback at the audit boundary.
      const previous = serialization;
      let release!: () => void;
      serialization = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      const stagedRegistrations: any[] = [];
      const stagedEvents: any[] = [];
      const stagedAudits: any[] = [];
      try {
        const tx: any = {
          whatsAppTemplateDefinition: definitionClient,
          whatsAppTemplateMetaRegistration: registrationClient(stagedRegistrations, stagedEvents),
          whatsAppTemplateMetaEvent: {
            findFirst: async ({ where }: any) => events.find((event) => event.registrationId === where.registrationId &&
              event.source === where.source && event.eventType === where.eventType &&
              (where.processedAt === null ? event.processedAt === null : where.processedAt?.not === null ? event.processedAt !== null : true) &&
              (where.outcome === undefined || where.outcome === event.outcome) &&
              (where.requestDigest === undefined || where.requestDigest === event.requestDigest) &&
              (where.wabaId === undefined || where.wabaId === event.wabaId) &&
              (where.providerTemplateName === undefined || where.providerTemplateName === event.providerTemplateName) &&
              (where.providerLanguageCode === undefined || where.providerLanguageCode === event.providerLanguageCode) &&
              (where.receivedAt?.gte === undefined || event.receivedAt >= where.receivedAt.gte)) ?? null,
            findUnique: async ({ where }: any) => events.find((event) => event.eventIdentity === where.eventIdentity) ?? null,
            create: async ({ data }: any) => {
              if ([...events, ...stagedEvents].some((event) => event.eventIdentity === data.eventIdentity)) throw { code: "P2002" };
              stagedEvents.push({ ...data, id: `event-${stagedEvents.length + events.length + 1}`, processedAt: null });
            },
          },
          commerceAuditEvent: { create: async ({ data }: any) => {
            if (failAudit) throw new Error("forced audit failure");
            stagedAudits.push(data);
          } },
        };
        const output = await callback(tx);
        registrations.push(...stagedRegistrations);
        events.push(...stagedEvents);
        audits.push(...stagedAudits);
        return output;
      } finally { release(); }
    },
  };
  return { f, db, registrations, events, audits, setAuditFailure: (v: boolean) => { failAudit = v; } };
}

const confirmation = (f: ReturnType<typeof fixture>) => ({ definitionId: f.definition.id,
  expectedDigest: f.plan().digest, confirmation: "SUBMIT_TO_META" as const });
const deps = (f: ReturnType<typeof mockedDb>) => ({ db: f.db, trustedWabaId: "123456789012", principal: principal as any });

test("confirmation inserts twenty immutable rows once; repeat and simultaneous clicks do not duplicate audits", async () => {
  const f = mockedDb();
  const [first, second, third] = await Promise.all(Array.from({ length: 3 }, () => confirmMetaSubmission(confirmation(f.f), deps(f))));
  assert.equal([first, second, third].filter((r) => !r.replay).length, 1);
  assert.equal(f.registrations.length, 20);
  assert.equal(f.audits.length, 1);
  assert.ok(f.registrations.every((r) => r.submissionState === "READY_TO_SUBMIT" && r.providerStatus === null));
  assert.equal(f.registrations[0].submittedContentHash, f.registrations[0].parameterBindingsSnapshot.localeContentHash);
  assert.deepEqual(f.registrations[0].parameterBindingsSnapshot.header, [{ position: 1, variable: "shopBrand.brandName" }]);
  assert.equal(f.events.length, 0);
});

test("IMAGE confirmation persists handle-free READY_TO_SUBMIT intent and replays idempotently", async () => {
  const f = mockedDb();
  const image = newMetaDraft("INITIAL", "CODE_OFFER");
  image.promotionTarget = "CHECKOUT";
  image.shopBrandMediaRole = "CHECKOUT_PRODUCT";
  image.body = [{ type: "variable", name: "checkout.itemsSummary" },
    { type: "variable", name: "offer.description" }, { type: "variable", name: "offer.code" },
    { type: "text", value: ".\n\nFrom " }, { type: "variable", name: "shop.name" },
    { type: "text", value: ". Need help with this basket? Use WhatsApp's Reply option on this message, then type your question or send a voice note (up to 2 minutes)." }];
  image.buttons = [{ type: "url", label: "Resume checkout", urlPrefix: "https://shop.example/checkout?url=", variable: "checkout.url" }];
  f.f.definition.offerType = "CODE_OFFER";
  f.f.definition.providerTemplateName = "moda_initial_code_offer_checkout_image";
  f.f.definition.sourceHash = templateHash(image);
  for (const locale of f.f.locales) {
    const authoring = localizedInitialCopy(image, locale.languageTag);
    const prepared = compileTemplateAst(authoring);
    locale.localeAst = { schemaVersion: 1, authoring, prepared };
    locale.contentHash = templateHash(prepared);
  }

  const [first, replay] = await Promise.all([
    confirmMetaSubmission(confirmation(f.f), deps(f)),
    confirmMetaSubmission(confirmation(f.f), deps(f)),
  ]);
  assert.equal([first, replay].filter((result) => !result.replay).length, 1);
  assert.equal(f.registrations.length, 20);
  assert.equal(f.audits.length, 1);
  assert.equal(f.events.length, 0);
  assert.ok(f.registrations.every((row) => row.submissionState === "READY_TO_SUBMIT"));
  assert.ok(f.registrations.every((row) => row.parameterBindingsSnapshot.headerMediaRole === "CHECKOUT_PRODUCT" &&
    row.parameterBindingsSnapshot.promotionTarget === "CHECKOUT"));
  assert.ok(f.registrations.every((row) => row.componentsSnapshot[0].format === "IMAGE" &&
    !("example" in row.componentsSnapshot[0]) && !JSON.stringify(row.componentsSnapshot[0]).includes("https://")));
  assert.ok(!JSON.stringify(f.registrations).includes("header_handle"));
  assert.ok(!JSON.stringify(f.registrations).includes("whatsup-sample.jpeg"));
});

test("audit failure rolls back every registration; explicit confirmation and SUPER_ADMIN required", async () => {
  const f = mockedDb(); f.setAuditFailure(true);
  await assert.rejects(confirmMetaSubmission(confirmation(f.f), deps(f)), /forced audit failure/);
  assert.equal(f.registrations.length, 0);
  assert.equal(f.audits.length, 0);
  await assert.rejects(confirmMetaSubmission({ ...confirmation(f.f), confirmation: "YES" } as any, deps(f)), /Explicit confirmation/);
  await assert.rejects(confirmMetaSubmission(confirmation(f.f), { ...deps(f), principal: { id: "fake", role: "ADMIN" } as any }), /SUPER_ADMIN/);
});

test("stale preview, different WABA, and registration collisions are refused", async () => {
  const f = mockedDb();
  await assert.rejects(confirmMetaSubmission({ ...confirmation(f.f), expectedDigest: "0".repeat(64) }, deps(f)), /sender changed/);
  await assert.rejects(confirmMetaSubmission(confirmation(f.f), { ...deps(f), trustedWabaId: "987654321000" }), /sender changed/);
  await confirmMetaSubmission(confirmation(f.f), deps(f));
  f.registrations[0].componentsSnapshot = [{ type: "BODY", text: "altered" }];
  await assert.rejects(confirmMetaSubmission(confirmation(f.f), deps(f)), /partial Meta registration/);
  assert.equal(f.registrations.length, 20);
  assert.equal(f.audits.length, 1);
});

test("reconciliation appends an unprocessed event and audit only after provider submission", async () => {
  const f = mockedDb();
  await confirmMetaSubmission(confirmation(f.f), deps(f));
  const input = { definitionId: f.f.definition.id, registrationId: f.registrations[0].id };
  await assert.rejects(requestMetaReconciliation(input, { ...deps(f) }), /not yet been sent/);
  f.registrations[0].submissionState = "PENDING";
  const first = await requestMetaReconciliation(input, { ...deps(f), now: () => new Date("2026-10-25T12:30:00Z") });
  const again = await requestMetaReconciliation(input, { ...deps(f), now: () => new Date("2026-10-25T12:31:00Z") });
  assert.equal(first.queued, true); assert.equal(again.queued, false);
  assert.equal(f.events.length, 1); assert.equal(f.audits.length, 2);
  assert.equal(f.events[0].source, "ADMIN"); assert.equal(f.events[0].eventType, "RECONCILE_REQUESTED");
  assert.equal(f.events[0].processedAt, null);
  assert.equal(f.registrations[0].submissionState, "PENDING");
  assert.equal(f.registrations[0].providerStatus, null);
  assert.deepEqual(f.registrations[0].componentsSnapshot, f.f.plan().locales[0].components);
});

test("forged tenant/WABA registration reconciliation is blocked without audit", async () => {
  const f = mockedDb(); await confirmMetaSubmission(confirmation(f.f), deps(f));
  f.registrations[0].submissionState = "SUBMITTED";
  const input = { definitionId: f.f.definition.id, registrationId: f.registrations[0].id };
  await assert.rejects(requestMetaReconciliation(input, { ...deps(f), trustedWabaId: "99999999" }), /does not belong/);
  await assert.rejects(requestMetaReconciliation({ ...input, definitionId: `wtdef_${"f".repeat(64)}` }, deps(f)), /does not belong/);
  assert.equal(f.events.length, 0); assert.equal(f.audits.length, 1);
});

test("DB-only provider approval status reads do not alter submissions or trust provider webhooks as publication", async () => {
  const f = mockedDb(); await confirmMetaSubmission(confirmation(f.f), deps(f));
  const row = f.registrations[0];
  row.submissionState = "SUBMITTED";
  row.providerStatus = "REJECTED";
  row.failureCode = "POLICY_REJECTION";
  f.registrations[1].providerStatus = "APPROVED";
  f.registrations[2].providerStatus = "PAUSED";
  f.registrations[2].driftDetectedAt = new Date("2026-10-25T12:00:00Z");
  f.events.push({ id: "e1", registrationId: row.id, eventType: "message_template_status_update",
    source: "WEBHOOK", outcome: "REJECTED", reasonCode: "POLICY_REJECTION", failureCode: null,
    receivedAt: new Date("2026-10-25T12:30:00Z") });
  const result = await readMetaStatus(f.f.definition.id, deps(f));
  assert.equal(result.registrations.length, 20);
  assert.equal(result.registrations[0].providerStatus, "REJECTED");
  assert.equal(result.registrations[0].events[0].reasonCode, "POLICY_REJECTION");
  assert.equal(result.registrations[1].providerStatus, "APPROVED");
  assert.ok(result.registrations[2].driftDetectedAt);
  assert.equal(f.audits.length, 1);
  await assert.rejects(readMetaStatus(f.f.definition.id, { ...deps(f), principal: { id: "u", role: "ADMIN" } as any }), /SUPER_ADMIN/);
});

test("technical retry is impossible without a matching processed provider-absence reconciliation", async () => {
  const f = mockedDb(); await confirmMetaSubmission(confirmation(f.f), deps(f));
  const row = f.registrations[0];
  const when = new Date("2026-10-25T12:00:00Z");
  row.submissionState = "SUBMISSION_UNCERTAIN";
  row.lastSubmittedAt = when;
  row.lastReconciledAt = new Date("2026-10-25T12:05:00Z");
  const input = { definitionId: f.f.definition.id, registrationId: row.id };
  await assert.rejects(requestMetaTechnicalRetry(input, deps(f)), /must first prove/);
  const absence = { id: "absence-1", registrationId: row.id, source: "RECONCILIATION",
    eventType: "PROVIDER_ABSENT_CONFIRMED", outcome: "NOT_FOUND", processedAt: new Date("2026-10-25T12:05:00Z"),
    receivedAt: new Date("2026-10-25T12:04:00Z"), requestDigest: row.submittedContentHash,
    wabaId: row.wabaId, providerTemplateName: row.providerTemplateName, providerLanguageCode: row.providerLanguageCode };
  f.events.push({ ...absence, requestDigest: "wrong-digest" });
  await assert.rejects(requestMetaTechnicalRetry(input, deps(f)), /must first prove/);
  f.events.pop(); f.events.push(absence);
  assert.deepEqual(await requestMetaTechnicalRetry(input, deps(f)), { queued: true });
  assert.deepEqual(await requestMetaTechnicalRetry(input, deps(f)), { queued: false });
  assert.equal(f.events.filter((e) => e.eventType === "TECHNICAL_RETRY_REQUESTED").length, 1);
  assert.equal(f.registrations.length, 20);
  assert.equal(f.audits.length, 2);
  row.providerStatus = "REJECTED";
  await assert.rejects(requestMetaTechnicalRetry(input, deps(f)), /Only an unresolved technical submission/);
});
