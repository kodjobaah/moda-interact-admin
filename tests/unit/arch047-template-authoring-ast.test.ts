import assert from "node:assert/strict";
import { test } from "node:test";
import { newMetaDraft, newWrapperDraft, formatEditorNodes, parseEditorNodes, insertEditorToken } from "../../src/lib/admin/whatsapp-templates/authoring/draft-operations.ts";
import { compileTemplateAst, makeImmutableAuthoringRecord } from "../../src/lib/admin/whatsapp-templates/authoring/compiler.ts";
import { validateTemplateAst } from "../../src/lib/admin/whatsapp-templates/authoring/validation.ts";
import { eligibleVariables, SHOP_BRAND_VARIABLES, VARIABLE_REGISTRY } from "../../src/lib/admin/whatsapp-templates/authoring/registry.ts";
import { templateHash } from "../../src/lib/admin/whatsapp-templates/authoring/identifiers.ts";
import { stableJson } from "../../src/lib/admin/whatsapp-templates/authoring/canonical.ts";
import { makeExamplePreview, makeDraftExamplePreview } from "../../src/lib/admin/whatsapp-templates/authoring/preview.ts";
import type { ContentNode } from "../../src/lib/admin/whatsapp-templates/authoring/types.ts";

const invalid = (draft: unknown, path: string) => {
  const check = validateTemplateAst(draft);
  assert.equal(check.ok, false);
  if (!check.ok) assert.ok(check.issues.some((i) => i.path.startsWith(path)), JSON.stringify(check.issues));
};

test("all six Meta purposes are valid and typed variables are specific to offer variant", () => {
  for (const stage of ["INITIAL", "FOLLOW_UP"] as const) {
    for (const offer of ["NO_OFFER", "CODE_OFFER", "AUTOMATIC_OFFER"] as const) {
      const draft = newMetaDraft(stage, offer);
      assert.equal(validateTemplateAst(draft).ok, true);
      assert.equal(compileTemplateAst(draft).family, "META_RECOVERY");
      assert.equal(eligibleVariables(draft).includes("offer.code"), offer === "CODE_OFFER");
      assert.equal(eligibleVariables(draft).includes("offer.description"), offer !== "NO_OFFER");
    }
  }
});
test("three wrapper audiences each require exactly one response slot", () => {
  for (const audience of ["SHARED", "AI", "HUMAN"] as const) {
    const draft = newWrapperDraft(audience);
    assert.equal(validateTemplateAst(draft).ok, true);
    invalid({ ...draft, body: [] }, "body");
    invalid({ ...draft, body: [...draft.body, { type: "slot", name: "response.body" }] }, "body");
    const prepared = compileTemplateAst(draft);
    assert.equal(prepared.family, "MODA_CONVERSATION_WRAPPER");
    assert.match(makeExamplePreview(prepared).body, /Example AI or merchant response/);
  }
});
test("server validation rejects arbitrary nodes and fields, placeholder spoofing and ineligible offer variables", () => {
  const draft = newMetaDraft();
  invalid({ ...draft, body: [{ type: "script", value: "x" }] }, "body");
  invalid({ ...draft, extra: "malicious" }, "root");
  invalid({ ...draft, body: [{ type: "text", value: "{{1}}" }] }, "body");
  invalid({ ...draft, body: [{ type: "variable", name: "offer.code" }] }, "body");
  invalid({ ...draft, body: [{ type: "variable", name: "random.member" }] }, "body");
  invalid({ ...draft, sourceLanguageTag: "fr" }, "sourceLanguageTag");
  invalid({ ...draft, schemaVersion: 99 }, "schemaVersion");
  invalid({ ...draft, body: [null] }, "body");
  invalid({ ...draft, header: [{ type: "variable", name: "checkout.url" }] }, "header");
  invalid({ ...draft, body: [{ type: "text", value: "A".repeat(1100) }] }, "body");
});
test("wrapper checkout URL only inside a checkout.available conditional", () => {
  const draft = newWrapperDraft();
  invalid({ ...draft, header: [{ type: "variable", name: "checkout.url" }] }, "header");
  const valid = { ...draft, conditionals: [{ when: "checkout.available", nodes: [{ type: "variable", name: "checkout.url" }] }] };
  assert.equal(validateTemplateAst(valid).ok, true);
  invalid({ ...draft, conditionals: [{ when: "unknown", nodes: [] }] }, "conditionals");
});
test("Meta body variables compile in occurrence order, repeated variables remain positional", () => {
  const draft = newMetaDraft("FOLLOW_UP", "CODE_OFFER");
  draft.body = [
    { type: "text", value: "Hi " }, { type: "variable", name: "customer.firstName" },
    { type: "text", value: ", use " }, { type: "variable", name: "offer.code" },
    { type: "text", value: " at " }, { type: "variable", name: "shop.name" },
    { type: "text", value: ". Code: " }, { type: "variable", name: "offer.code" },
  ];
  const prepared = compileTemplateAst(draft);
  assert.equal(prepared.family, "META_RECOVERY");
  if (prepared.family !== "META_RECOVERY") return;
  assert.deepEqual(prepared.parameterBindings.body.map((b) => b.variable), ["customer.firstName", "offer.code", "shop.name", "offer.code"]);
  assert.match(String(prepared.components[0].text), /\{\{1\}\}.*\{\{4\}\}/);
  assert.match(makeExamplePreview(prepared).body, /SAMPLE10.*SAMPLE10/);
  const record = makeImmutableAuthoringRecord(draft);
  assert.equal(record.schemaVersion, 1);
  assert.equal(record.authoring.family, record.prepared.family);
});
test("restrict Meta dynamic buttons to one supported checkout URL binding", () => {
  const draft = newMetaDraft();
  draft.buttons = [{ type: "url", label: "Checkout", urlPrefix: "https://store.example.com/redirect?next=", variable: "checkout.url" }];
  const prepared = compileTemplateAst(draft);
  assert.equal(prepared.family, "META_RECOVERY");
  if (prepared.family !== "META_RECOVERY") return;
  assert.deepEqual(prepared.parameterBindings.buttons, [{ index: 0, subType: "url", variable: "checkout.url" }]);
  assert.equal(makeExamplePreview(prepared).buttons.length, 1);
  invalid({ ...draft, buttons: [draft.buttons[0], draft.buttons[0]] }, "buttons");
  invalid({ ...draft, buttons: [{ ...draft.buttons[0], variable: "offer.code" }] }, "buttons");
  invalid({ ...draft, buttons: [{ ...draft.buttons[0], urlPrefix: "http://bad.example/" }] }, "buttons");
});
test("canonical hash ignores JSON object key insertion order", () => {
  assert.equal(stableJson({ b: 2, a: { z: 9, c: 4 } }), stableJson({ a: { c: 4, z: 9 }, b: 2 }));
  assert.equal(templateHash({ b: 2, a: 1 }), templateHash({ a: 1, b: 2 }));
});


test("inline composer round-trips AST nodes and inserts semantic tokens at cursor", () => {
  const draft = newMetaDraft();
  const text = formatEditorNodes(draft.body);
  assert.match(text, /\{\{customer\.firstName\}\}/);
  assert.deepEqual(parseEditorNodes(text, { variables: eligibleVariables(draft) }), draft.body);
  const insertion = insertEditorToken("Hello Alex", "shop.name", 6, 10);
  assert.equal(insertion.text, "Hello {{shop.name}}");
  assert.equal(insertion.caret, insertion.text.length);
  const nodes = parseEditorNodes(insertion.text, { variables: eligibleVariables(draft) });
  assert.deepEqual(nodes, [{ type: "text", value: "Hello " }, { type: "variable", name: "shop.name" }]);
});

test("inline composer never upgrades unknown or ineligible token text to AST variables", () => {
  const draft = newMetaDraft();
  const invalidOffer = parseEditorNodes("Hi {{offer.code}}", { variables: eligibleVariables(draft) });
  invalid({ ...draft, body: invalidOffer }, "body");
  const unknown = parseEditorNodes("Hi {{random.field}}", { variables: eligibleVariables(draft) });
  invalid({ ...draft, body: unknown }, "body");
  const response = parseEditorNodes("Before {{response.body}} after", { variables: [] , allowResponseSlot: true });
  assert.equal(response.filter((node) => node.type === "slot").length, 1);
  assert.equal(validateTemplateAst({ ...newWrapperDraft(), body: response }).ok, true);
});

test("draft preview remains visible while a button is invalid without creating a prepared projection", () => {
  const draft = newMetaDraft();
  draft.buttons = [{ type: "url", label: "Return to checkout", urlPrefix: "https://" }];
  assert.equal(validateTemplateAst(draft).ok, false);
  const preview = makeDraftExamplePreview(draft);
  assert.match(preview.body, /Alex.*Example Shop/);
  assert.match(preview.buttons[0].url, /valid HTTPS/);
  assert.equal(preview.buttons[0].label, "Return to checkout");
});

test("ShopBrand exposes every merchant-display content field as a semantic variable", () => {
  const expected = [
    "shopBrand.brandName", "shopBrand.logoUrl", "shopBrand.logoAltText",
    "shopBrand.logoWidth", "shopBrand.logoHeight", "shopBrand.squareLogoUrl",
    "shopBrand.squareLogoAltText", "shopBrand.coverImageUrl",
  ];
  assert.deepEqual(SHOP_BRAND_VARIABLES, expected);
  for (const field of expected) {
    const name = field as (typeof SHOP_BRAND_VARIABLES)[number];
    assert.equal(VARIABLE_REGISTRY[name].sourceField, `ShopBrand.${field.slice("shopBrand.".length)}`);
    assert.ok(VARIABLE_REGISTRY[name].sample.trim());
  }
  for (const draft of [newMetaDraft(), newWrapperDraft()]) {
    assert.deepEqual(eligibleVariables(draft).filter((v) => v.startsWith("shopBrand.")), expected);
    for (const name of expected) {
      const nodes = parseEditorNodes(`From {{${name}}}`, { variables: eligibleVariables(draft) });
      // The parser can produce response slots for wrappers; Meta bodies cannot contain them.
      const contentNodes = nodes.filter((node): node is ContentNode => node.type !== "slot");
      if (draft.family === "META_RECOVERY") {
        const candidate = { ...draft, body: contentNodes };
        assert.equal(validateTemplateAst(candidate).ok, true, name);
        assert.doesNotMatch(makeDraftExamplePreview(candidate).body, /\{\{shopBrand\./);
      } else {
        // Retain the mandatory response.body slot when testing a wrapper body.
        const candidate = { ...draft, body: [...draft.body, ...nodes] };
        assert.equal(validateTemplateAst(candidate).ok, true, name);
        assert.equal(validateTemplateAst({ ...draft, footer: contentNodes }).ok, true, name);
        assert.doesNotMatch(makeDraftExamplePreview(candidate).body, /\{\{shopBrand\./);
      }
    }
  }
});

test("Meta text header supports one brand variable, freezes its positional binding and previews an example", () => {
  const draft = newMetaDraft();
  draft.header = [
    { type: "text", value: "From " },
    { type: "variable", name: "shopBrand.brandName" },
  ];
  draft.body = [{ type: "text", value: "Visit " }, { type: "variable", name: "shopBrand.logoUrl" }];
  const prepared = compileTemplateAst(draft);
  assert.equal(prepared.family, "META_RECOVERY");
  if (prepared.family !== "META_RECOVERY") return;
  assert.deepEqual(prepared.parameterBindings.header, [{ position: 1, variable: "shopBrand.brandName" }]);
  assert.deepEqual(prepared.parameterBindings.body, [{ position: 1, variable: "shopBrand.logoUrl" }]);
  assert.deepEqual(prepared.components[0], {
    type: "HEADER", format: "TEXT", text: "From {{1}}", example: { header_text: ["Example Brand"] },
  });
  assert.match(makeExamplePreview(prepared).header, /From Example Brand/);
  assert.match(makeExamplePreview(prepared).body, /example.com\/brand\/logo.png/);
  invalid({ ...draft, header: [...draft.header, { type: "variable", name: "shopBrand.logoAltText" }] }, "header");
  invalid({ ...draft, header: [{ type: "variable", name: "shopBrand.coverImageUrl" }] }, "header");
  invalid({ ...draft, footer: [{ type: "variable", name: "shopBrand.brandName" }] }, "footer");
});

test("wrapper header body and footer accept ShopBrand variables as runtime tokens", () => {
  const draft = newWrapperDraft("AI");
  draft.header = [{ type: "variable", name: "shopBrand.brandName" }];
  draft.body = [{ type: "text", value: "Reply: " }, { type: "slot", name: "response.body" },
    { type: "text", value: " (" }, { type: "variable", name: "shopBrand.logoWidth" }, { type: "text", value: ")" }];
  draft.footer = [{ type: "variable", name: "shopBrand.logoAltText" }];
  const prepared = compileTemplateAst(draft);
  assert.equal(prepared.family, "MODA_CONVERSATION_WRAPPER");
  if (prepared.family !== "MODA_CONVERSATION_WRAPPER") return;
  assert.deepEqual(prepared.header, [{ kind: "variable", name: "shopBrand.brandName" }]);
  assert.deepEqual(prepared.footer, [{ kind: "variable", name: "shopBrand.logoAltText" }]);
  const preview = makeExamplePreview(prepared);
  assert.equal(preview.header, "Example Brand");
  assert.equal(preview.footer, "Example Brand logo");
  assert.match(preview.body, /240/);
  invalid({ ...draft, footer: [{ type: "variable", name: "shopBrand.secret" }] }, "footer");
});


test("pre-existing saved Meta projections without header bindings remain previewable", () => {
  const prepared = compileTemplateAst(newMetaDraft());
  assert.equal(prepared.family, "META_RECOVERY");
  if (prepared.family !== "META_RECOVERY") return;
  const oldProjection = { ...prepared, parameterBindings: {
    body: prepared.parameterBindings.body, buttons: prepared.parameterBindings.buttons,
  } };
  assert.match(makeExamplePreview(oldProjection).body, /Alex/);
});


test("taxonomy-backed shop category is a typed Meta body binding, never a shop-specific literal", () => {
  const draft = newMetaDraft();
  assert.ok(eligibleVariables(draft).includes("shop.categoryName"));
  assert.ok(!eligibleVariables(newWrapperDraft()).includes("shop.categoryName"));
  draft.body = [
    { type: "text", value: "We offer " },
    { type: "variable", name: "shop.categoryName" },
    { type: "text", value: ". Visit " },
    { type: "variable", name: "shop.name" },
    { type: "text", value: " again." },
  ];
  assert.equal(validateTemplateAst(draft).ok, true);
  const result = compileTemplateAst(draft);
  assert.equal(result.family, "META_RECOVERY");
  if (result.family !== "META_RECOVERY") return;
  assert.deepEqual(result.parameterBindings.body, [
    { position: 1, variable: "shop.categoryName" },
    { position: 2, variable: "shop.name" },
  ]);
  assert.equal((result.components[0] as { text: string }).text, "We offer {{1}}. Visit {{2}} again.");
  assert.match(makeExamplePreview(result).body, /outdoor clothing and accessories/);
  assert.equal(result.components[0].example && typeof result.components[0].example === "object", true);
  assert.equal(VARIABLE_REGISTRY["shop.categoryName"].sourceField, "CommerceShopProfile.activeCategory.displayName");
  invalid({ ...draft, header: [{ type: "variable", name: "shop.categoryName" }] }, "header");
  invalid({ ...newWrapperDraft(), body: [{ type: "slot", name: "response.body" },
    { type: "variable", name: "shop.categoryName" }] }, "body");
});
