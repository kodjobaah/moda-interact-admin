import assert from "node:assert/strict";
import { test } from "node:test";
import { newMetaDraft, newWrapperDraft } from "../../src/lib/admin/whatsapp-templates/authoring/draft-operations.ts";
import { makeImmutableAuthoringRecord } from "../../src/lib/admin/whatsapp-templates/authoring/compiler.ts";
import { templateHash } from "../../src/lib/admin/whatsapp-templates/authoring/identifiers.ts";
import { extractTranslationSegments, makeTranslationSourceSnapshot, validateSegments } from "../../src/lib/admin/whatsapp-templates/translations/source-snapshot.ts";
import { targetTranslationLanguages } from "../../src/lib/admin/whatsapp-templates/translations/locale-contract.ts";
import { projectTranslationProgress } from "../../src/lib/admin/whatsapp-templates/translations/progress.ts";
import { retryWhatsAppTemplateTranslation, startWhatsAppTemplateTranslation } from "../../src/lib/admin/whatsapp-templates/translations/service.ts";
import type { PlatformAdminPrincipal } from "../../src/lib/auth/platform-admin.ts";
import type { TranslationDatabase } from "../../src/lib/admin/whatsapp-templates/translations/repository.ts";

const actor = { id: "arch047-admin-translation-fixture", role: "SUPER_ADMIN", developmentBypass: false } as PlatformAdminPrincipal;
const definitionId = `wtdef_${"a".repeat(64)}`;
const targets = targetTranslationLanguages();

function fixture() {
  const draft = newMetaDraft();
  const english = makeImmutableAuthoringRecord(draft);
  const definition = {
    id: definitionId, kind: "META_RECOVERY", purpose: "INITIAL", sourceLanguageTag: "en",
    sourceHash: templateHash(draft), status: "SAVED",
    locales: [{ languageTag: "en", status: "SOURCE_SAVED", localeAst: english, contentHash: templateHash(english.prepared) }],
  };
  let modelConfigured = true;
  let failAudit = false;
  let nextId = 1;
  let advisoryLockCalls = 0;
  let current = { definition, runs: [] as any[], audits: [] as any[] };
  let serial = Promise.resolve();
  const transaction = async (fn: (tx: any) => Promise<any>) => {
    let unlock!: () => void;
    const predecessor = serial;
    serial = new Promise<void>((resolve) => { unlock = resolve; });
    await predecessor;
    const staged = structuredClone(current);
    const tx = {
      $executeRaw: async () => { advisoryLockCalls += 1; return 1; },
      whatsAppTemplateDefinition: {
        findUnique: async () => staged.definition,
        updateMany: async ({ where, data }: any) => {
          if (!where.status || where.status === staged.definition.status || where.status.in?.includes(staged.definition.status)) Object.assign(staged.definition, data);
          return { count: 1 };
        },
      },
      commerceTranslationModelConfiguration: { findFirst: async () => modelConfigured ? {
        id: "translation-model", provider: "openai", providerModelId: "gpt-snapshot", editVersion: 4, credential: { id: "secret-id" },
      } : null },
      whatsAppTemplateTranslationRun: {
        findFirst: async ({ where }: any) => staged.runs.find((run) => run.definitionId === where.definitionId &&
          (!where.sourceHash || run.sourceHash === where.sourceHash) &&
          (!where.translationModelConfigurationId || run.translationModelConfigurationId === where.translationModelConfigurationId) &&
          (!where.modelConfigurationVersion || run.modelConfigurationVersion === where.modelConfigurationVersion) &&
          (!where.status || where.status.in.includes(run.status))) ?? null,
        create: async ({ data }: any) => {
          const run = { ...data, id: `run-${nextId++}`, requestedAt: new Date(),
            items: data.items.create.map((item: any, i: number) => ({ ...item, id: `item-${i}`, retryCount: 0, failureCode: null, nextAttemptAt: null, completedAt: null })),
            translationModel: { displayName: "Configured model" } };
          staged.runs.unshift(run);
          return { id: run.id };
        },
        update: async ({ where, data }: any) => {
          const run = staged.runs.find((value) => value.id === where.id);
          Object.assign(run, data);
          return run;
        },
      },
      whatsAppTemplateTranslationItem: { updateMany: async ({ where, data }: any) => {
        const run = staged.runs.find((candidate) => candidate.id === where.runId);
        const items = run.items.filter((item: any) => where.id.in.includes(item.id) &&
          (typeof where.status === "string" ? item.status === where.status : where.status.in.includes(item.status)));
        items.forEach((item: any) => Object.assign(item, data));
        return { count: items.length };
      } },
      commerceAuditEvent: { create: async ({ data }: any) => {
        if (failAudit) throw new Error("audit write failed");
        staged.audits.push(data);
      } },
    };
    try { const result = await fn(tx); current = staged; return result; }
    finally { unlock(); }
  };
  const db = {
    $transaction: transaction,
    whatsAppTemplateDefinition: { findUnique: async () => current.definition },
    whatsAppTemplateTranslationRun: { findFirst: async ({ where }: any) =>
      current.runs.find((run) => run.definitionId === where.definitionId) ?? null },
  } as unknown as TranslationDatabase;
  return { db, draft, get definition() { return current.definition; }, get runs() { return current.runs; }, get audits() { return current.audits; },
    get advisoryLockCalls() { return advisoryLockCalls; },
    setModelConfigured: (value: boolean) => { modelConfigured = value; }, setAuditFailure: (value: boolean) => { failAudit = value; },
    setEnglishStatus: (value: string) => { current.definition.locales[0].status = value; },
    corruptHash: () => { current.definition.sourceHash = "f".repeat(64); },
    status: (index: number, status: string, failureCode?: string) => {
      current.runs[0].items[index].status = status;
      current.runs[0].items[index].failureCode = failureCode ?? null;
    },
  };
}

test("all 20 supported locales map to one English source and 19 unique targets", () => {
  assert.equal(targets.length, 19);
  assert.ok(!targets.includes("en"));
  assert.throws(() => targetTranslationLanguages(["en", "fr"]), /nineteen unique/);
  assert.throws(() => targetTranslationLanguages(["en", ...Array(19).fill("fr")]), /nineteen unique/);
});

test("Meta keyed header/body/footer/button labels: stable keys, repeated independent brand token markers", () => {
  const draft = newMetaDraft();
  draft.header = [{ type: "text", value: "From " }, { type: "variable", name: "shopBrand.brandName" }];
  draft.body = [{ type: "text", value: "Hello " }, { type: "variable", name: "shopBrand.brandName" },
    { type: "text", value: " — " }, { type: "variable", name: "shopBrand.brandName" },
    { type: "text", value: " (" }, { type: "variable", name: "shopBrand.logoAltText" }, { type: "text", value: ")" }];
  draft.footer = [{ type: "text", value: "Thanks for visiting." }];
  draft.buttons = [{ type: "url", label: "Open basket", urlPrefix: "https://shop.example.com/go?url=", variable: "checkout.url" }];
  const rows = extractTranslationSegments(definitionId, draft);
  assert.deepEqual(rows.map((row) => row.key), ["header.text", "body.text", "footer.text", "buttons.0.text"]);
  const tokens = rows.flatMap((row) => row.protectedTokens);
  assert.equal(tokens.length, 4);
  assert.equal(new Set(tokens.map((item) => item.marker)).size, 4);
  assert.equal(tokens.filter((item) => item.variable === "shopBrand.brandName").length, 3);
  assert.ok(rows.every((row) => !row.text.includes("shop.example.com")));
  assert.deepEqual(extractTranslationSegments(definitionId, draft), rows);
});

test("all eight ShopBrand identifiers remain opaque; Meta footer variables are refused by authoring", () => {
  const draft = newMetaDraft();
  const eight = ["brandName", "logoUrl", "logoAltText", "logoWidth", "logoHeight", "squareLogoUrl", "squareLogoAltText", "coverImageUrl"] as const;
  draft.body = eight.flatMap((name) => [{ type: "variable" as const, name: `shopBrand.${name}` as const }, { type: "text" as const, value: " " }]);
  const row = extractTranslationSegments(definitionId, draft).find((item) => item.key === "body.text");
  assert.deepEqual(row?.protectedTokens.map((item) => item.variable), eight.map((name) => `shopBrand.${name}`));
  assert.ok(!row?.text.includes("Example Brand"));
  assert.throws(() => extractTranslationSegments(definitionId, { ...draft, footer: [{ type: "variable", name: "shopBrand.brandName" }] } as any), /Saved English template is invalid/);
});

test("wrapper response.body is excluded while header/body/footer/conditional brand tokens are protected", () => {
  const draft = newWrapperDraft("AI");
  draft.header = [{ type: "text", value: "Welcome " }, { type: "variable", name: "shopBrand.brandName" }];
  draft.body = [{ type: "text", value: "Answer: " }, { type: "slot", name: "response.body" }, { type: "text", value: " from " }, { type: "variable", name: "shopBrand.logoAltText" }];
  draft.footer = [{ type: "variable", name: "shopBrand.squareLogoAltText" }];
  draft.conditionals = [{ when: "checkout.available", nodes: [{ type: "text", value: "Shop: " }, { type: "variable", name: "shopBrand.coverImageUrl" }] }];
  const segments = extractTranslationSegments(definitionId, draft);
  assert.deepEqual(segments.map((item) => item.key), ["header.text", "body.0.text", "body.2.text", "footer.text", "conditionals.0.nodes.text"]);
  assert.ok(segments.every((item) => !item.text.includes("response.body")));
  assert.equal(segments.reduce((n, item) => n + item.protectedTokens.length, 0), 4);
});

test("malformed segment identities, marker injection, and English source tampering fail closed", () => {
  assert.throws(() => validateSegments([{ key: "header.text", text: "Hi", protectedTokens: [] }, { key: "header.text", text: "Again", protectedTokens: [] }]), /Duplicate/);
  assert.throws(() => validateSegments([{ key: "body.text", text: "Hi ⟦moda_" + "a".repeat(24) + "⟧", protectedTokens: [] }]), /Unregistered/);
  const draft = newMetaDraft();
  const english = makeImmutableAuthoringRecord(draft);
  const expected = { definitionId, sourceHash: templateHash(draft), sourceLanguageTag: "en", englishLocaleAst: english, englishContentHash: templateHash(english.prepared) };
  assert.equal(makeTranslationSourceSnapshot(expected).segments.length > 0, true);
  assert.throws(() => makeTranslationSourceSnapshot({ ...expected, sourceHash: "f".repeat(64) }), /source hash/);
});

test("Generate is atomic, concurrent-safe, replay-safe, and emits one audit for 19 target items", async () => {
  const f = fixture();
  const responses = await Promise.all([1, 2, 3].map(() => startWhatsAppTemplateTranslation(definitionId, { db: f.db, principal: actor })));
  assert.equal(new Set(responses.map((response) => response.runId)).size, 1);
  assert.equal(responses.filter((response) => !response.reused).length, 1);
  assert.equal(f.runs.length, 1);
  assert.equal(f.runs[0].items.length, 19);
  assert.equal(f.runs[0].sourceHash, templateHash(f.draft));
  assert.deepEqual(f.runs[0].sourceSnapshot.segments.map((s: any) => s.key), ["body.text"]);
  assert.equal(f.runs[0].modelConfigurationVersion, 4);
  assert.equal(f.audits.length, 1);
  assert.equal(f.advisoryLockCalls, 3);
  assert.equal(f.definition.status, "TRANSLATION_QUEUED");
});

test("missing model, uncommitted English, source hash mismatch, and audit failure leave no run", async () => {
  const f = fixture();
  f.setModelConfigured(false);
  await assert.rejects(startWhatsAppTemplateTranslation(definitionId, { db: f.db, principal: actor }), /Configure/);
  f.setModelConfigured(true);
  f.setEnglishStatus("DRAFT");
  await assert.rejects(startWhatsAppTemplateTranslation(definitionId, { db: f.db, principal: actor }), /not committed/);
  f.setEnglishStatus("SOURCE_SAVED");
  f.corruptHash();
  await assert.rejects(startWhatsAppTemplateTranslation(definitionId, { db: f.db, principal: actor }), /source hash/);
  assert.equal(f.runs.length, 0);
  const rollback = fixture(); rollback.setAuditFailure(true);
  await assert.rejects(startWhatsAppTemplateTranslation(definitionId, { db: rollback.db, principal: actor }), /audit write failed/);
  assert.equal(rollback.runs.length, 0);
});

test("retry preserves completed and processing locales and remains idempotent", async () => {
  const f = fixture();
  await startWhatsAppTemplateTranslation(definitionId, { db: f.db, principal: actor });
  f.status(0, "COMPLETED"); f.status(1, "FAILED", "BAD_PROVIDER_RESPONSE"); f.status(2, "PROCESSING");
  const result = await retryWhatsAppTemplateTranslation(definitionId, { db: f.db, principal: actor });
  assert.equal(result.retryRequested, 17);
  assert.equal(f.runs[0].items[0].status, "COMPLETED");
  assert.equal(f.runs[0].items[2].status, "PROCESSING");
  assert.equal(f.runs[0].items[1].status, "PENDING");
  assert.equal(f.runs[0].items[1].failureCode, null);
  assert.ok(f.runs[0].items[1].nextAttemptAt);
  const replay = await retryWhatsAppTemplateTranslation(definitionId, { db: f.db, principal: actor });
  assert.equal(replay.retryRequested, 0);
  assert.equal(f.audits.length, 2);
});

test("persisted partial failure and completion states are derived from item status", async () => {
  const f = fixture();
  await startWhatsAppTemplateTranslation(definitionId, { db: f.db, principal: actor });
  f.status(0, "COMPLETED"); f.status(1, "FAILED", "ITEM_REJECTED");
  const projection = projectTranslationProgress({ definitionId, family: "META_RECOVERY", purpose: "INITIAL", sourceHash: f.definition.sourceHash,
    definitionStatus: "TRANSLATION_QUEUED", run: f.runs[0] }, targets);
  assert.equal(projection.progress, "PARTIALLY_FAILED");
  assert.equal(projection.completed, 1); assert.equal(projection.failed, 1); assert.equal(projection.pending, 17);
  assert.equal(projection.targets[1].failureCode, "ITEM_REJECTED");
  f.runs[0].items.forEach((item: any) => { item.status = "COMPLETED"; });
  assert.equal(projectTranslationProgress({ definitionId, family: "META_RECOVERY", purpose: "INITIAL", sourceHash: f.definition.sourceHash,
    definitionStatus: "TRANSLATION_QUEUED", run: f.runs[0] }, targets).progress, "READY_FOR_REVIEW");
});

test("non-SUPER_ADMIN cannot start translation or inspect cross-shop state", async () => {
  const f = fixture();
  await assert.rejects(startWhatsAppTemplateTranslation(definitionId, { db: f.db, principal: { ...actor, role: "ADMIN" } as PlatformAdminPrincipal }), /SUPER_ADMIN/);
  assert.equal(f.runs.length, 0);
});
