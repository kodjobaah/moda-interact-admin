import assert from "node:assert/strict";
import { test } from "node:test";
import { newMetaDraft, newWrapperDraft } from "../../src/lib/admin/whatsapp-templates/authoring/draft-operations.ts";
import { templateHash } from "../../src/lib/admin/whatsapp-templates/authoring/identifiers.ts";
import { SHOP_BRAND_VARIABLES } from "../../src/lib/admin/whatsapp-templates/authoring/registry.ts";
import { INITIAL_REPLY_INSTRUCTIONS } from "../../src/lib/admin/whatsapp-templates/authoring/initial-reply-instructions.ts";
import type { ContentNode, TemplateAst } from "../../src/lib/admin/whatsapp-templates/authoring/types.ts";
import { reconstructAndCompile } from "../../src/lib/admin/whatsapp-templates/compilation/reconstruction.ts";
import { providerLanguageCode, REVIEW_LANGUAGES } from "../../src/lib/admin/whatsapp-templates/compilation/language-codes.ts";
import type { TranslationSegmentResult } from "../../src/lib/admin/whatsapp-templates/compilation/contracts.ts";

const DEF_ID = `wtdef_${"a".repeat(64)}`;
import { compilationFixture } from "../fixtures/arch047-translation-fixture.ts";


function recoveryFixture() {
  const ast = newMetaDraft("INITIAL", "CODE_OFFER");
  ast.header = [{ type: "text", value: "Greetings from " }, { type: "variable", name: "shopBrand.brandName" }];
  ast.body = [{ type: "text", value: "Hi " }, { type: "variable", name: "customer.firstName" },
    { type: "text", value: ", your " }, { type: "variable", name: "shopBrand.brandName" },
    { type: "text", value: " cart has code " }, { type: "variable", name: "offer.code" },
    { type: "text", value: ". Brand again " }, { type: "variable", name: "shopBrand.brandName" },
    { type: "text", value: ".\n\nFrom " }, { type: "variable", name: "shop.name" },
    { type: "text", value: ". Need help with this basket? Use WhatsApp's Reply option on this message, then type your question or send a voice note (up to 2 minutes)." }];
  ast.footer = [{ type: "text", value: "No reply needed" }];
  ast.buttons = [{ type: "url", label: "Finish checkout", urlPrefix: "https://shop.example/checkout?url=", variable: "checkout.url" }];
  return ast;
}

const replaced = (result: TranslationSegmentResult, key: string, text: string): TranslationSegmentResult => ({
  schemaVersion: 1, segments: result.segments.map((item) => item.key === key ? { key, text } : item),
});


test("initial contextual Reply merchant binding survives every supported locale compilation", () => {
  const english = newMetaDraft("INITIAL", "NO_OFFER");
  english.body = [
    { type: "text", value: "From " }, { type: "variable", name: "shop.name" },
    { type: "text", value: ". Need help with this basket? Use WhatsApp's Reply option on this message, then type your question or send a voice note (up to 2 minutes)." },
  ];
  const f = compilationFixture(english);
  assert.equal(REVIEW_LANGUAGES.length, 20);
  assert.deepEqual(new Set(Object.keys(INITIAL_REPLY_INSTRUCTIONS)), new Set(REVIEW_LANGUAGES));
  assert.deepEqual(english.body.slice(-3), [
    { type: "text", value: INITIAL_REPLY_INSTRUCTIONS.en.from },
    { type: "variable", name: "shop.name" },
    { type: "text", value: INITIAL_REPLY_INSTRUCTIONS.en.checkout },
  ]);
  for (const languageTag of REVIEW_LANGUAGES.filter((tag) => tag !== "en")) {
    const compiled = f.run(languageTag, f.translated);
    if (compiled.record.prepared.family !== "META_RECOVERY") throw new Error("Expected Meta template.");
    assert.ok(compiled.record.prepared.parameterBindings.body.some((binding) => binding.variable === "shop.name"), languageTag);
    assert.deepEqual(compiled.record.authoring.family === "META_RECOVERY" ? compiled.record.authoring.body.slice(-3) : [], [
      { type: "text", value: INITIAL_REPLY_INSTRUCTIONS[languageTag as keyof typeof INITIAL_REPLY_INSTRUCTIONS].from },
      { type: "variable", name: "shop.name" },
      { type: "text", value: INITIAL_REPLY_INSTRUCTIONS[languageTag as keyof typeof INITIAL_REPLY_INSTRUCTIONS].checkout },
    ], languageTag);
    const tampered = { schemaVersion: 1 as const, segments: f.translated.segments.map((segment) =>
      segment.key === "body.replyInstruction" ? { ...segment, text: "Use a generic chat message {{1}}" } : segment) };
    const guarded = f.run(languageTag, tampered);
    assert.ok(!JSON.stringify(guarded.record.authoring).includes("generic chat message"), languageTag);
  }
});

test("English/French/German/Japanese: reordered semantic tokens keep correct Meta binding positions", () => {
  const english = recoveryFixture(); const f = compilationFixture(english);
  const original = JSON.stringify(english);
  const translated = replaced(f.translated, "body", "{{4}} und {{2}} / {{3}} et {{5}}");
  for (const language of ["fr", "de", "ja", "zh-Hans"]) {
    const candidate = f.run(language, translated);
    assert.equal(candidate.record.authoring.sourceLanguageTag, "en");
    assert.equal(candidate.record.prepared.family, "META_RECOVERY");
    if (candidate.record.prepared.family !== "META_RECOVERY") return;
    assert.deepEqual(candidate.record.prepared.parameterBindings.header, [{ position: 1, variable: "shopBrand.brandName" }]);
    assert.deepEqual(candidate.record.prepared.parameterBindings.body.map((b) => b.variable),
      ["offer.code", "customer.firstName", "shopBrand.brandName", "shopBrand.brandName", "shop.name"]);
    assert.deepEqual(candidate.record.prepared.parameterBindings.buttons, [{ index: 0, subType: "url", variable: "checkout.url" }]);
    assert.equal(candidate.record.authoring.family, "META_RECOVERY");
    if (candidate.record.authoring.family !== "META_RECOVERY") throw new Error("Expected Meta authoring AST.");
    assert.deepEqual(candidate.record.authoring.buttons, english.buttons);
    assert.equal(candidate.contentHash, templateHash(candidate.record.prepared));
  }
  assert.equal(JSON.stringify(english), original, "English source is never mutated");
});

test("all 20 supported language/provider identities stay canonical", () => {
  assert.equal(REVIEW_LANGUAGES.length, 20);
  assert.equal(new Set(REVIEW_LANGUAGES).size, 20);
  assert.equal(providerLanguageCode("fr", "META_RECOVERY"), "fr");
  assert.equal(providerLanguageCode("zh-Hans", "META_RECOVERY"), "zh_CN");
  assert.equal(providerLanguageCode("pt-BR", "META_RECOVERY"), "pt_BR");
  assert.equal(providerLanguageCode("pt-PT", "META_RECOVERY"), "pt_PT");
  assert.equal(providerLanguageCode("de", "MODA_CONVERSATION_WRAPPER"), null);
  assert.throws(() => providerLanguageCode("xx", "META_RECOVERY"), /Unsupported/);
});

test("all eight canonical shopBrand fields remain semantic identifiers, not sample values", () => {
  const ast = newMetaDraft("FOLLOW_UP");
  ast.body = SHOP_BRAND_VARIABLES.flatMap((name): ContentNode[] => [{ type: "variable", name }, { type: "text", value: "," }]);
  const f = compilationFixture(ast);
  const candidate = f.run();
  assert.equal(candidate.record.prepared.family, "META_RECOVERY");
  if (candidate.record.prepared.family !== "META_RECOVERY") return;
  assert.deepEqual(candidate.record.prepared.parameterBindings.body.map((b) => b.variable), [...SHOP_BRAND_VARIABLES]);
  assert.ok(!JSON.stringify(candidate.record.authoring).includes("Example Brand"));
});

test("wrapper header/footer/conditional brand references and non-translated response slot survive", () => {
  const ast = newWrapperDraft("HUMAN");
  ast.header = [{ type: "variable", name: "shopBrand.logoAltText" }, { type: "text", value: " welcomes you" }];
  ast.footer = [{ type: "text", value: "Regards, " }, { type: "variable", name: "shopBrand.brandName" }];
  ast.conditionals = [{ when: "checkout.available", nodes: [
    { type: "text", value: "Checkout " }, { type: "variable", name: "checkout.url" },
    { type: "text", value: " at " }, { type: "variable", name: "shopBrand.coverImageUrl" },
  ] }];
  const f = compilationFixture(ast);
  const translated = replaced(f.translated, "conditionals.0.nodes", "{{4}} puis {{3}} / terminer");
  const candidate = f.run("tr", translated);
  assert.equal(candidate.record.prepared.family, "MODA_CONVERSATION_WRAPPER");
  if (candidate.record.prepared.family !== "MODA_CONVERSATION_WRAPPER") return;
  assert.deepEqual(candidate.record.prepared.header[0], { kind: "variable", name: "shopBrand.logoAltText" });
  assert.deepEqual(candidate.record.prepared.footer.at(-1), { kind: "variable", name: "shopBrand.brandName" });
  assert.deepEqual(candidate.record.prepared.body, [{ kind: "responseSlot", name: "response.body" }]);
  assert.equal(candidate.record.prepared.conditionals[0].tokens[0].kind, "variable");
  assert.equal((candidate.record.prepared.conditionals[0].tokens[0] as { name: string }).name, "shopBrand.coverImageUrl");
  assert.ok(!candidate.record.authoring.body.some((node) => node.type === "text"));
});

test("missing/duplicate/mutated/invented markers and missing/extra/duplicate keys fail closed", () => {
  const f = compilationFixture(recoveryFixture());
  const body = f.translated.segments.find((s) => s.key === "body")!.text;
  const badBodies = [body.replace("{{2}}", ""), body.replace("{{2}}", "{{2}}{{2}}"),
    body.replace("{{2}}", "{{999}}"), body.replace("{{2}}", "{{customer.firstName}}"),
    body + " {{22}}", body + " ⟦MODA_BAD⟧"];
  for (const value of badBodies) assert.throws(() => f.run("fr", replaced(f.translated, "body", value)), /marker|placeholder/i);
  assert.throws(() => f.run("fr", { schemaVersion: 1, segments: f.translated.segments.slice(1) }), /component keys/);
  assert.throws(() => f.run("fr", { schemaVersion: 1, segments: [...f.translated.segments, { key: "unknown", text: "oops" }] }), /invalid segment key/);
  assert.throws(() => f.run("fr", { schemaVersion: 1, segments: [f.translated.segments[0], ...f.translated.segments] }), /duplicate/);
  assert.throws(() => f.run("fr", { schemaVersion: 2, segments: f.translated.segments } as unknown as TranslationSegmentResult), /Unsupported/);
});

test("tampered source/marker semantics/stale clone and changed provider output digest fail closed", () => {
  const ast = recoveryFixture(); const f = compilationFixture(ast);
  assert.throws(() => f.run("fr", f.translated, { ...f.source, definitionId: `wtdef_${"b".repeat(64)}` }), /different source/);
  assert.throws(() => f.run("fr", f.translated, { ...f.source, sourceHash: "c".repeat(64) }), /different source/);
  const source = structuredClone(f.source);
  source.segments.find((s) => s.key === "header")!.protectedTokens[0].variable = "shop.name";
  assert.throws(() => f.run("fr", f.translated, source), /protected variable identity/);
  assert.throws(() => reconstructAndCompile({ definitionId: DEF_ID, definitionSourceHash: f.source.sourceHash,
    runSourceHash: "b".repeat(64), english: ast, languageTag: "fr", snapshot: f.source, translated: f.translated }), /stale/);
  assert.throws(() => reconstructAndCompile({ definitionId: DEF_ID, definitionSourceHash: f.source.sourceHash,
    runSourceHash: f.source.sourceHash, english: ast, languageTag: "fr", snapshot: f.source, translated: f.translated,
    outputContentHash: "f".repeat(64) }), /digest/);
});

test("Meta footers never accept placeholders, and URL/button actions are protected from translation", () => {
  const ast = recoveryFixture(); const f = compilationFixture(ast);
  assert.throws(() => f.run("fr", replaced(f.translated, "footer", "Cordialement {{1}}")), /marker/i);
  assert.throws(() => f.run("fr", replaced(f.translated, "buttons.0.label", "Checkout {{checkout.url}}")), /marker/i);
  const translated = replaced(f.translated, "buttons.0.label", "Payer maintenant");
  const candidate = f.run("fr", translated);
  assert.equal(candidate.record.authoring.family, "META_RECOVERY");
  if (candidate.record.authoring.family !== "META_RECOVERY") return;
  assert.equal(candidate.record.authoring.buttons[0].label, "Payer maintenant");
  assert.equal(candidate.record.authoring.buttons[0].urlPrefix, ast.buttons[0].urlPrefix);
  assert.equal(candidate.record.authoring.buttons[0].variable, "checkout.url");
});

test("translation preserves both alternative-product CTA indexes and semantic bindings", () => {
  const english = recoveryFixture();
  english.offerType = "AUTOMATIC_OFFER";
  english.promotionTarget = "ALTERNATIVE_PRODUCT";
  english.body = [{ type: "text", value: "A different product " }, { type: "variable", name: "promotion.productName" },
    { type: "text", value: " has " }, { type: "variable", name: "promotion.offerDescription" },
    { type: "text", value: ". This offer does not apply to your abandoned basket: " }, { type: "variable", name: "promotion.productUrl" },
    { type: "text", value: ".\n\nFrom " }, { type: "variable", name: "shop.name" },
    { type: "text", value: ". Need help with this offer or your basket? Use WhatsApp's Reply option on this message, then type your question or send a voice note (up to 2 minutes)." }];
  english.buttons = [
    { type: "url", label: "Resume checkout", urlPrefix: "https://shop.example/redirect?checkout=", variable: "checkout.url" },
    { type: "url", label: "View offer", urlPrefix: "https://shop.example/redirect?product=", variable: "promotion.productUrl" },
  ];
  const f = compilationFixture(english);
  const translated = { ...f.translated, segments: f.translated.segments.map((segment) =>
    segment.key === "buttons.0.label" ? { ...segment, text: "Reprendre" }
      : segment.key === "buttons.1.label" ? { ...segment, text: "Voir l’offre" } : segment) };
  const candidate = f.run("fr", translated);
  if (candidate.record.prepared.family !== "META_RECOVERY" || candidate.record.authoring.family !== "META_RECOVERY") {
    throw new Error("Expected a Meta recovery translation snapshot.");
  }
  assert.deepEqual(candidate.record.prepared.parameterBindings.buttons, [
    { index: 0, subType: "url", variable: "checkout.url" },
    { index: 1, subType: "url", variable: "promotion.productUrl" },
  ]);
  assert.deepEqual(candidate.record.authoring.buttons.map((button) => button.label), ["Reprendre", "Voir l’offre"]);
  assert.deepEqual((candidate.record.prepared.components.find((component) => component.type === "BUTTONS") as any).buttons.map((button: any) => button.text),
    ["Reprendre", "Voir l’offre"]);
});

test("translated provider limits, ineligible header/checkout placements and unsafe script controls are refused", () => {
  const ast = recoveryFixture(); const f = compilationFixture(ast);
  assert.throws(() => f.run("fr", replaced(f.translated, "header", "X".repeat(100) + " {{1}}")), /limits/i);
  assert.throws(() => f.run("fr", replaced(f.translated, "body", "<script>\u202E")), /unsafe/i);
  const forbidden = newMetaDraft("FOLLOW_UP"); forbidden.header = [{ type: "variable", name: "shopBrand.logoUrl" }];
  const g = compilationFixture(forbidden);
  assert.throws(() => g.run(), /English authoring AST invalid/);
});
