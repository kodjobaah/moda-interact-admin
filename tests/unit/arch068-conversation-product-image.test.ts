import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { ConversationProductImageBindingSchema, readPreparedWrapper } from "@modainteract/moda-interact-shared/commerce/presentation";
import { newMetaDraft, newWrapperDraft, cloneDraft, setWrapperProductImage, setWrapperAudience } from "../../src/lib/admin/whatsapp-templates/authoring/draft-operations.ts";
import { validateTemplateAst } from "../../src/lib/admin/whatsapp-templates/authoring/validation.ts";
import { compileTemplateAst, makeImmutableAuthoringRecord } from "../../src/lib/admin/whatsapp-templates/authoring/compiler.ts";
import { makeExamplePreview, makeDraftExamplePreview } from "../../src/lib/admin/whatsapp-templates/authoring/preview.ts";
import { templateHash } from "../../src/lib/admin/whatsapp-templates/authoring/identifiers.ts";
import { makeTranslationSourceSnapshot } from "../../src/lib/admin/whatsapp-templates/translations/source-snapshot.ts";
import { reconstructAndCompile } from "../../src/lib/admin/whatsapp-templates/compilation/reconstruction.ts";
import { parseTranslatedSegments } from "../../src/lib/admin/whatsapp-templates/compilation/segments.ts";
import { REVIEW_LANGUAGES } from "../../src/lib/admin/whatsapp-templates/compilation/language-codes.ts";
import { checkWrapperEligibility } from "../../src/lib/admin/whatsapp-templates/wrappers/eligibility.ts";
import { renderWrapperPreview } from "../../src/lib/admin/whatsapp-templates/wrappers/preview.ts";
import { saveEnglishTemplate } from "../../src/lib/admin/whatsapp-templates/authoring/service.ts";
import { wrapperRow, FIXTURE_ID } from "../fixtures/arch047-wrapper-fixture.ts";
import { compilationFixture } from "../fixtures/arch047-translation-fixture.ts";

const binding = ConversationProductImageBindingSchema.parse({ variable: "response.productImage", placement: "BEFORE_BODY", optional: true });
const imageDraft = () => setWrapperProductImage(newWrapperDraft("AI"), true);
function translationInput() {
  const ast = imageDraft();
  ast.header = [{ type: "text", value: "Hello " }, { type: "variable", name: "shopBrand.brandName" }];
  ast.body = [{ type: "text", value: "Before " }, { type: "slot", name: "response.body" }, { type: "text", value: " After" }];
  ast.footer = [{ type: "text", value: "Regards" }];
  const record = makeImmutableAuthoringRecord(ast);
  const snapshot = makeTranslationSourceSnapshot({ definitionId: FIXTURE_ID, sourceHash: templateHash(ast), sourceLanguageTag: "en", englishLocaleAst: record, englishContentHash: templateHash(record.prepared) });
  const translated = { schemaVersion: 1, segments: snapshot.segments.map(({ key, text }) => ({ key, text: text.replace("Before", "Avant").replace("After", "Après") })) };
  return { ast, snapshot, translated, run: (snapshotOverride: unknown = snapshot, languageTag = "fr") => reconstructAndCompile({ definitionId: FIXTURE_ID, definitionSourceHash: templateHash(ast), runSourceHash: templateHash(ast), languageTag, english: ast, snapshot: snapshotOverride, translated, outputContentHash: templateHash(translated) }) };
}

test("default-off and toggled-off preserve exact legacy source, prepared shape and digests", () => {
  // Historical saved shape is explicit: new editable drafts now omit an exactly empty footer.
  const legacy = { ...newWrapperDraft("AI"), footer: [{ type: "text" as const, value: "" }] };
  const expected = { schemaVersion: 1, family: "MODA_CONVERSATION_WRAPPER", responseSlot: "response.body", header: [{ kind: "text", value: "" }], body: [{ kind: "responseSlot", name: "response.body" }], footer: [{ kind: "text", value: "" }], conditionals: [] };
  assert.equal(Object.hasOwn(legacy, "productImage"), false);
  assert.deepEqual(compileTemplateAst(legacy), expected);
  const restored = setWrapperProductImage(setWrapperProductImage(legacy, true), false);
  assert.deepEqual(restored, legacy);
  assert.equal(templateHash(restored), templateHash(legacy));
  assert.equal(templateHash(compileTemplateAst(restored)), templateHash(expected));
  const prepared = compileTemplateAst(imageDraft());
  assert.equal(prepared.family, "MODA_CONVERSATION_WRAPPER");
  const read = readPreparedWrapper({ schemaVersion: 1, prepared }, templateHash(prepared), (value) => createHash("sha256").update(value).digest("hex"));
  assert.equal(read.kind, "ok");
  if (read.kind === "ok") assert.equal(read.prepared.productImage?.placement, "BEFORE_BODY");
});

test("shared strict binding is accepted only on AI wrappers; malformed and URL bindings fail", () => {
  assert.equal(validateTemplateAst(imageDraft()).ok, true);
  for (const productImage of [null, undefined, false, {}, { ...binding, optional: false }, { ...binding, placement: "INLINE" }, { ...binding, variable: "shopBrand.logoUrl" }, { ...binding, url: "https://example.com/a.jpg" }, [binding, binding]]) {
    assert.equal(validateTemplateAst({ ...newWrapperDraft("AI"), productImage }).ok, false, JSON.stringify(productImage));
  }
  for (const audience of ["SHARED", "HUMAN"]) assert.equal(validateTemplateAst({ ...imageDraft(), audience }).ok, false);
  assert.equal(validateTemplateAst({ ...newMetaDraft("FOLLOW_UP"), productImage: binding }).ok, false);
  const inline = newWrapperDraft("AI");
  inline.body.push({ type: "variable", name: "response.productImage" } as never);
  assert.equal(validateTemplateAst(inline).ok, false, "image binding is not a text variable");
});

test("cloning and compilation preserve binding and change both source/prepared hashes", () => {
  const ast = imageDraft(); const clone = cloneDraft(ast);
  assert.deepEqual(clone, ast); assert.notEqual(clone, ast);
  assert.notEqual(templateHash(ast), templateHash(newWrapperDraft("AI")));
  assert.notEqual(templateHash(compileTemplateAst(ast)), templateHash(compileTemplateAst(newWrapperDraft("AI"))));
  assert.deepEqual(makeExamplePreview(compileTemplateAst(ast)).productImage, binding);
  assert.deepEqual(makeDraftExamplePreview(ast).productImage, binding);
  for (const audience of ["HUMAN", "SHARED"] as const) {
    const next = setWrapperAudience(ast, audience);
    assert.equal(Object.hasOwn(next, "productImage"), false);
    assert.equal(validateTemplateAst(next).ok, audience !== "SHARED");
    if (audience === "SHARED") {
      next.compositeProfile = newWrapperDraft("SHARED").compositeProfile;
      assert.equal(validateTemplateAst(next).ok, true);
    }
    assert.equal(Object.hasOwn(setWrapperProductImage(next, true), "productImage"), false);
  }
});

test("real translation extraction/reconstruction preserves structural binding and response slot in every locale", () => {
  const f = translationInput();
  assert.equal(Object.hasOwn(f.snapshot, "productImage"), false);
  assert.equal(f.snapshot.sourceHash, templateHash(f.ast));
  assert.notEqual(f.snapshot.sourceHash, templateHash(setWrapperProductImage(f.ast, false)));
  assert.doesNotMatch(JSON.stringify(f.snapshot.segments), /response\.productImage|BEFORE_BODY|response\.body/);
  assert.equal(REVIEW_LANGUAGES.length, 20);
  for (const tag of REVIEW_LANGUAGES.filter((tag) => tag !== "en")) {
    const compiled = f.run(f.snapshot, tag);
    assert.equal(compiled.record.authoring.family, "MODA_CONVERSATION_WRAPPER");
    if (compiled.record.authoring.family !== "MODA_CONVERSATION_WRAPPER" || compiled.record.prepared.family !== "MODA_CONVERSATION_WRAPPER") throw new Error("Wrong family");
    assert.deepEqual(compiled.record.authoring.productImage, binding);
    assert.deepEqual(compiled.record.prepared.productImage, binding);
    assert.deepEqual(compiled.record.authoring.body, [{ type: "text", value: "Avant " }, { type: "slot", name: "response.body" }, { type: "text", value: " Après" }]);
    assert.equal(compiled.preview.productImage?.placement, "BEFORE_BODY");
    assert.equal(compiled.contentHash, templateHash(compiled.record.prepared));
  }
});

test("stale source binding and translator-authored binding fail closed; historical keys still compile", () => {
  const f = translationInput();
  assert.throws(() => f.run({ ...f.snapshot, sourceHash: templateHash(setWrapperProductImage(f.ast, false)) }), /different source/);
  assert.throws(() => f.run({ ...f.snapshot, productImage: { ...binding, url: "https://attacker.example/x" } }));
  assert.throws(() => parseTranslatedSegments({ ...f.translated, productImage: binding }), /cannot supply/);
  const source = structuredClone(f.snapshot); source.segments[0].protectedTokens[0].variable = "shop.name";
  assert.throws(() => f.run(source), /protected bindings/);
  const old = compilationFixture(newWrapperDraft("AI"));
  assert.equal(old.run().record.prepared.family, "MODA_CONVERSATION_WRAPPER");
  const enabled = compilationFixture(imageDraft());
  const compiled = enabled.run();
  assert.deepEqual(compiled.record.prepared.family === "MODA_CONVERSATION_WRAPPER" && compiled.record.prepared.productImage, binding);
});

test("all reviewed locales must preserve optional binding, even when changed locale digests are recomputed", () => {
  const row = wrapperRow({ audience: "AI", ast: imageDraft() });
  const valid = checkWrapperEligibility(row, "AI"); assert.equal(valid.eligible, true);
  if (!valid.eligible) throw new Error("Expected eligible");
  assert.deepEqual(new Set(Object.keys(valid.projections)), new Set(REVIEW_LANGUAGES));
  assert.deepEqual(renderWrapperPreview(valid.projections.en, { response: "Complete response", checkoutAvailable: false }).productImage, binding);
  for (const sourceEnabled of [true, false]) {
    const changed = wrapperRow({ audience: "AI", ast: sourceEnabled ? imageDraft() : newWrapperDraft("AI") });
    const locale = changed.locales.find((item) => item.languageTag === "fr")!;
    const ast = sourceEnabled ? newWrapperDraft("AI") : imageDraft();
    const record = makeImmutableAuthoringRecord(ast);
    locale.localeAst = record; locale.contentHash = templateHash(record.prepared);
    const check = checkWrapperEligibility(changed, "AI");
    assert.equal(check.eligible, false);
    if (!check.eligible) assert.match(check.reason, /product image binding/);
  }
  assert.equal(checkWrapperEligibility(row, "HUMAN").eligible, false);
});

test("server save rejects forged audience/image requests before persistence", async () => {
  let calls = 0;
  const db = { whatsAppTemplateDefinition: { findUnique: async () => { calls++; return null; } } };
  for (const draft of [{ ...imageDraft(), audience: "HUMAN" }, { ...newMetaDraft(), productImage: binding }, { ...imageDraft(), productImage: { ...binding, optional: false } }]) {
    await assert.rejects(saveEnglishTemplate({ submissionId: "d49ae497-4cdc-48a3-9664-a0b0842345e7", draft }, { principal: { id: "admin", role: "SUPER_ADMIN" }, db } as never));
  }
  assert.equal(calls, 0);
});


test("server save persists immutable binding, source/prepared hashes and audit in one transaction", async () => {
  const ast = imageDraft();
  const writes: Array<{ table: string; data: Record<string, unknown> }> = [];
  const capture = (table: string) => ({ create: async ({ data }: { data: Record<string, unknown> }) => { writes.push({ table, data }); return data; } });
  const db = {
    whatsAppTemplateDefinition: { findUnique: async () => null },
    $transaction: async (run: (tx: unknown) => Promise<void>) => run({ whatsAppTemplateDefinition: capture("definition"), whatsAppTemplateLocale: capture("locale"), commerceAuditEvent: capture("audit") }),
  };
  const saved = await saveEnglishTemplate({ submissionId: "d49ae497-4cdc-48a3-9664-a0b0842345e7", draft: ast }, { principal: { id: "admin", role: "SUPER_ADMIN" }, db } as never);
  assert.equal(saved.replay, false);
  assert.deepEqual(writes.map((write) => write.table), ["definition", "locale", "audit"]);
  assert.equal(writes[0].data.audience, "AI");
  assert.equal(writes[0].data.sourceHash, templateHash(ast));
  assert.equal(writes[0].data.providerTemplateName, null);
  assert.deepEqual(writes[1].data.localeAst, makeImmutableAuthoringRecord(ast));
  assert.equal(writes[1].data.contentHash, templateHash(compileTemplateAst(ast)));
});

test("real Meta translation snapshot still restores protected bindings and reviewed initial Reply instruction", () => {
  for (const stage of ["INITIAL", "FOLLOW_UP"] as const) {
    const ast = newMetaDraft(stage);
    const record = makeImmutableAuthoringRecord(ast);
    const snapshot = makeTranslationSourceSnapshot({ definitionId: FIXTURE_ID, sourceHash: templateHash(ast), sourceLanguageTag: "en", englishLocaleAst: record, englishContentHash: templateHash(record.prepared) });
    assert.equal(Object.hasOwn(snapshot, "productImage"), false);
    const translated = { schemaVersion: 1, segments: snapshot.segments.map(({ key, text }) => ({ key, text })) };
    const candidate = reconstructAndCompile({ definitionId: FIXTURE_ID, definitionSourceHash: templateHash(ast), runSourceHash: templateHash(ast), languageTag: "fr", english: ast, snapshot, translated });
    assert.equal(candidate.record.prepared.family, "META_RECOVERY");
    if (candidate.record.prepared.family !== "META_RECOVERY" || record.prepared.family !== "META_RECOVERY") throw new Error("Expected Meta");
    assert.deepEqual(candidate.record.prepared.parameterBindings, record.prepared.parameterBindings);
    assert.equal(Object.hasOwn(candidate.record.prepared, "productImage"), false);
    if (stage === "INITIAL") assert.match(JSON.stringify(candidate.record.authoring), /WhatsApp/);
  }
});


test("translation snapshot refuses a prepared projection whose binding differs from its source", () => {
  const ast = imageDraft(); const record = makeImmutableAuthoringRecord(ast);
  record.prepared = compileTemplateAst(newWrapperDraft("AI"));
  assert.throws(() => makeTranslationSourceSnapshot({ definitionId: FIXTURE_ID, sourceHash: templateHash(ast), sourceLanguageTag: "en", englishLocaleAst: record, englishContentHash: templateHash(record.prepared) }), /prepared projection/);
});

test("legacy Meta snapshots without newer optional header bindings keep their existing acceptance", () => {
  const ast = newMetaDraft("FOLLOW_UP");
  const record = makeImmutableAuthoringRecord(ast);
  if (record.prepared.family !== "META_RECOVERY") throw new Error("Expected Meta");
  delete record.prepared.parameterBindings.header;
  const snapshot = makeTranslationSourceSnapshot({ definitionId: FIXTURE_ID, sourceHash: templateHash(ast), sourceLanguageTag: "en", englishLocaleAst: record, englishContentHash: templateHash(record.prepared) });
  assert.equal(snapshot.sourceHash, templateHash(ast));
  assert.equal(Object.hasOwn(snapshot, "productImage"), false);
});
