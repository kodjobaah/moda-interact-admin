import assert from "node:assert/strict";
import { test } from "node:test";
import { newMetaDraft } from "../../src/lib/admin/whatsapp-templates/authoring/draft-operations.ts";
import { validateTemplateAst } from "../../src/lib/admin/whatsapp-templates/authoring/validation.ts";
import { compileTemplateAst } from "../../src/lib/admin/whatsapp-templates/authoring/compiler.ts";
import { makeExamplePreview } from "../../src/lib/admin/whatsapp-templates/authoring/preview.ts";
import { templateHash } from "../../src/lib/admin/whatsapp-templates/authoring/identifiers.ts";
import { frozenLocaleSnapshot, imageHeaderRegistrationBindings } from "../../src/lib/admin/whatsapp-templates/meta/snapshot.ts";
import { MetaSubmissionError } from "../../src/lib/admin/whatsapp-templates/meta/contracts.ts";
import { SHOP_BRAND_MEDIA_ROLES } from "../../src/lib/admin/whatsapp-templates/media/readiness.ts";

const HASH = "a".repeat(64);
const DEF_ID = `wtdef_${HASH}`;
const en = { id: "locale-en", definitionId: DEF_ID, languageTag: "en", providerLanguageCode: "en", status: "SOURCE_SAVED",
  reviewedAt: null, reviewedByAdminId: null };

test("each IMAGE header role compiles through the existing authoring compiler, never to a source URL", () => {
  for (const shopBrandMediaRole of SHOP_BRAND_MEDIA_ROLES) {
    const draft = { ...newMetaDraft(), shopBrandMediaRole };
    assert.equal(validateTemplateAst(draft).ok, true);
    const prepared = compileTemplateAst(draft);
    assert.equal(prepared.family, "META_RECOVERY");
    if (prepared.family !== "META_RECOVERY") continue;
    assert.deepEqual(prepared.components[0], { type: "HEADER", format: "IMAGE" });
    assert.deepEqual(prepared.parameterBindings, { schemaVersion: 1, headerMediaRole: shopBrandMediaRole,
      header: [], body: [{ position: 1, variable: "customer.firstName" }, { position: 2, variable: "shop.name" }], buttons: [] });
    const registrationBindings = imageHeaderRegistrationBindings(prepared);
    assert.deepEqual(registrationBindings, prepared.parameterBindings);
    assert.equal(templateHash({ ...prepared, parameterBindings: registrationBindings }), templateHash(prepared));
    const forged = { ...registrationBindings, headerMediaRole: "COVER_IMAGE" };
    if (shopBrandMediaRole !== "COVER_IMAGE") assert.notEqual(
      templateHash({ ...prepared, parameterBindings: forged }), templateHash(prepared));
    assert.equal(makeExamplePreview(prepared).headerMediaRole, shopBrandMediaRole);
    assert.ok(!JSON.stringify(prepared).includes("original.png"));
    assert.ok(!JSON.stringify(prepared).includes("header_handle"));
  }
});

test("IMAGE headers reject mixed text/variables, invented roles and wrapper changes", () => {
  const draft = newMetaDraft();
  assert.equal(validateTemplateAst({ ...draft, shopBrandMediaRole: "VIDEO" }).ok, false);
  assert.equal(validateTemplateAst({ ...draft, shopBrandMediaRole: "LOGO", header: [{ type: "text", value: "Hello" }] }).ok, false);
  assert.equal(validateTemplateAst({ ...draft, shopBrandMediaRole: "LOGO", header: [{ type: "variable", name: "shop.name" }] }).ok, false);
  const text = compileTemplateAst({ ...draft, header: [{ type: "text", value: "Hi" }] });
  assert.equal(text.family, "META_RECOVERY");
  if (text.family === "META_RECOVERY") assert.equal(text.components[0].format, "TEXT");
});

test("CHECKOUT_PRODUCT IMAGE headers compile only for a promotion target and freeze their role", () => {
  const draft = newMetaDraft("INITIAL", "CODE_OFFER");
  draft.promotionTarget = "CHECKOUT";
  draft.shopBrandMediaRole = "CHECKOUT_PRODUCT";
  draft.body = [{ type: "variable", name: "checkout.itemsSummary" },
    { type: "variable", name: "offer.description" }, { type: "variable", name: "offer.code" }];
  draft.buttons = [{ type: "url", label: "Resume checkout", urlPrefix: "https://shop.example/checkout?url=", variable: "checkout.url" }];

  assert.equal(validateTemplateAst(draft).ok, true);
  const prepared = compileTemplateAst(draft);
  assert.equal(prepared.family, "META_RECOVERY");
  if (prepared.family !== "META_RECOVERY") return;
  assert.deepEqual(prepared.components[0], { type: "HEADER", format: "IMAGE" });
  assert.equal(prepared.parameterBindings.headerMediaRole, "CHECKOUT_PRODUCT");
  assert.equal(makeExamplePreview(prepared).headerMediaRole, "CHECKOUT_PRODUCT");
  assert.deepEqual(prepared.components[0], { type: "HEADER", format: "IMAGE" });
  assert.ok(!JSON.stringify(prepared.components[0]).includes("header_handle"));
  assert.ok(!JSON.stringify(prepared.components[0]).includes("url"));
  assert.equal(validateTemplateAst({ ...draft, promotionTarget: undefined }).ok, false);
});

test("content hash captures role, and frozen IMAGE intent needs no sample handle", () => {
  const digests = new Set<string>();
  for (const shopBrandMediaRole of SHOP_BRAND_MEDIA_ROLES) {
    const draft = { ...newMetaDraft(), shopBrandMediaRole };
    const prepared = compileTemplateAst(draft);
    const contentHash = templateHash(prepared);
    digests.add(contentHash);
    const definition = { id: DEF_ID, kind: "META_RECOVERY", purpose: "INITIAL", offerType: "NO_OFFER",
      providerTemplateName: "moda_example_media", category: "MARKETING", sourceHash: templateHash(draft), sourceLanguageTag: "en", status: "SAVED" };
    const locale = { ...en, localeAst: { schemaVersion: 1, authoring: draft, prepared }, contentHash };
    const snapshot = frozenLocaleSnapshot(locale, definition);
    assert.deepEqual(snapshot.components[0], { type: "HEADER", format: "IMAGE" });
    assert.ok(!JSON.stringify(snapshot).includes("header_handle"));
    assert.ok(!JSON.stringify(snapshot).includes("https://"));
    const altered = structuredClone(locale);
    (altered.localeAst.prepared as any).parameterBindings.headerMediaRole = "LOGO";
    if (shopBrandMediaRole !== "LOGO") assert.throws(() => frozenLocaleSnapshot(altered, definition), /Frozen content digest/);
  }
  assert.equal(digests.size, 3);
});

test("frozen IMAGE intent rejects injected sample handles and URLs", () => {
  const draft = { ...newMetaDraft(), shopBrandMediaRole: "LOGO" as const };
  const prepared = compileTemplateAst(draft);
  assert.equal(prepared.family, "META_RECOVERY");
  if (prepared.family !== "META_RECOVERY") return;
  const definition = { id: DEF_ID, kind: "META_RECOVERY", purpose: "INITIAL", offerType: "NO_OFFER",
    providerTemplateName: "moda_example_media", category: "MARKETING", sourceHash: templateHash(draft), sourceLanguageTag: "en", status: "SAVED" };
  for (const example of [{ header_handle: ["untrusted-handle"] }, { url: "https://untrusted.example/image.jpg" }]) {
    const locale = { ...en, localeAst: { schemaVersion: 1, authoring: draft,
      prepared: { ...structuredClone(prepared), components: [{ ...prepared.components[0], example }] } },
      contentHash: templateHash({ ...prepared, components: [{ ...prepared.components[0], example }] }) };
    assert.throws(() => frozenLocaleSnapshot(locale, definition), (err: unknown) =>
      err instanceof MetaSubmissionError && err.reasonCode === "IMAGE_SAMPLE_UNTRUSTED");
  }
});
