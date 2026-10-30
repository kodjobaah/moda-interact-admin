import assert from "node:assert/strict";
import { test } from "node:test";
import { compileTemplateAst } from "../../src/lib/admin/whatsapp-templates/authoring/compiler.ts";
import { newMetaDraft } from "../../src/lib/admin/whatsapp-templates/authoring/draft-operations.ts";
import { templateHash } from "../../src/lib/admin/whatsapp-templates/authoring/identifiers.ts";
import { makeMetaSubmissionPlan } from "../../src/lib/admin/whatsapp-templates/meta/snapshot.ts";
import { META_LANGUAGES } from "../../src/lib/admin/whatsapp-templates/meta/languages.ts";
import { fixture } from "../helpers/arch047-template-meta-fixture.ts";

test("exactly twenty provider languages, including sanctioned Chinese and Portuguese variants", () => {
  const f = fixture(); const plan = f.plan();
  assert.equal(META_LANGUAGES.length, 20);
  assert.equal(plan.locales.length, 20);
  assert.equal(plan.locales.find((l) => l.languageTag === "zh-Hans")?.providerLanguageCode, "zh_CN");
  assert.equal(plan.locales.find((l) => l.languageTag === "zh-Hant")?.providerLanguageCode, "zh_TW");
  assert.equal(plan.locales.find((l) => l.languageTag === "pt-BR")?.providerLanguageCode, "pt_BR");
  assert.equal(plan.wabaId, "123456789012");
  assert.equal(plan.category, "MARKETING");
});

test("CHECKOUT_PRODUCT IMAGE plans are immutable, handle-free, and reject locale role drift", () => {
  const f = fixture();
  const image = newMetaDraft("INITIAL", "CODE_OFFER");
  image.promotionTarget = "CHECKOUT";
  image.shopBrandMediaRole = "CHECKOUT_PRODUCT";
  image.body = [{ type: "variable", name: "checkout.itemsSummary" },
    { type: "variable", name: "offer.description" }, { type: "variable", name: "offer.code" }];
  image.buttons = [{ type: "url", label: "Resume checkout", urlPrefix: "https://shop.example/checkout?url=", variable: "checkout.url" }];
  f.definition.offerType = "CODE_OFFER";
  f.definition.providerTemplateName = "moda_initial_code_offer_checkout_image";
  f.definition.sourceHash = templateHash(image);
  for (const locale of f.locales) {
    const prepared = compileTemplateAst(image);
    locale.localeAst = { schemaVersion: 1, authoring: structuredClone(image), prepared };
    locale.contentHash = templateHash(prepared);
  }

  const plan = f.plan();
  assert.deepEqual(f.plan(), plan);
  assert.equal(plan.locales.length, 20);
  assert.ok(plan.locales.every((locale) => locale.bindings.headerMediaRole === "CHECKOUT_PRODUCT" &&
    locale.bindings.promotionTarget === "CHECKOUT"));
  assert.ok(plan.locales.every((locale) => {
    const header = locale.components.find((component) => component.type === "HEADER");
    return header?.format === "IMAGE" && !("example" in header) && !JSON.stringify(header).includes("https://");
  }));
  assert.ok(!JSON.stringify(plan).includes("header_handle"));
  assert.ok(!JSON.stringify(plan).includes("whatsup-sample.jpeg"));

  const french = f.locales.find((locale) => locale.languageTag === "fr")!;
  const drifted = { ...structuredClone(image), shopBrandMediaRole: "LOGO" as const };
  const driftedPrepared = compileTemplateAst(drifted);
  french.localeAst = { schemaVersion: 1, authoring: drifted, prepared: driftedPrepared };
  french.contentHash = templateHash(driftedPrepared);
  assert.throws(() => f.plan(), /header format or media role/);
});

test("the immutable header, translated body positions and URL binding are preserved", () => {
  const plan = fixture().plan();
  const english = plan.locales.find((l) => l.languageTag === "en")!;
  const french = plan.locales.find((l) => l.languageTag === "fr")!;
  assert.deepEqual(english.bindings.header, [{ position: 1, variable: "shopBrand.brandName" }]);
  assert.deepEqual(english.bindings.body, [{ position: 1, variable: "customer.firstName" }, { position: 2, variable: "shopBrand.logoAltText" }]);
  assert.deepEqual(french.bindings.body, [{ position: 1, variable: "shopBrand.logoAltText" }, { position: 2, variable: "customer.firstName" }]);
  assert.deepEqual(french.bindings.buttons, [{ index: 0, subType: "url", variable: "checkout.url" }]);
  assert.equal((french.components.find((c) => c.type === "HEADER") as any).text, "Welcome {{1}}");
  assert.match(JSON.stringify(french.components), /avant/);
  assert.ok(!JSON.stringify(french.bindings).includes("Example Brand"));
});

test("promotion target is frozen in every locale approval and locale target drift is rejected", () => {
  const f = fixture();
  const checkout = newMetaDraft("INITIAL", "CODE_OFFER");
  checkout.promotionTarget = "CHECKOUT";
  checkout.body = [{ type: "variable", name: "checkout.itemsSummary" },
    { type: "variable", name: "offer.description" }, { type: "variable", name: "offer.code" }];
  checkout.buttons = [{ type: "url", label: "Resume checkout", urlPrefix: "https://shop.example/checkout?url=", variable: "checkout.url" }];
  f.definition.offerType = "CODE_OFFER";
  f.definition.providerTemplateName = "moda_initial_code_offer_target_test";
  f.definition.sourceHash = templateHash(checkout);
  for (const locale of f.locales) {
    const prepared = compileTemplateAst(checkout);
    locale.localeAst = { schemaVersion: 1, authoring: structuredClone(checkout), prepared };
    locale.contentHash = templateHash(prepared);
  }
  const plan = f.plan();
  assert.ok(plan.locales.every((locale) => locale.bindings.promotionTarget === "CHECKOUT"));

  const french = f.locales.find((locale) => locale.languageTag === "fr")!;
  const alternative = newMetaDraft("INITIAL", "CODE_OFFER");
  alternative.promotionTarget = "ALTERNATIVE_PRODUCT";
  alternative.body = [{ type: "text", value: "A different product " }, { type: "variable", name: "promotion.productName" },
    { type: "text", value: " has " }, { type: "variable", name: "promotion.offerDescription" },
    { type: "text", value: " with " }, { type: "variable", name: "promotion.code" },
    { type: "text", value: ". This offer does not apply to your abandoned basket. " },
    { type: "variable", name: "promotion.productUrl" }];
  alternative.buttons = checkout.buttons;
  const alternativePrepared = compileTemplateAst(alternative);
  french.localeAst = { schemaVersion: 1, authoring: alternative, prepared: alternativePrepared };
  french.contentHash = templateHash(alternativePrepared);
  assert.throws(() => f.plan(), /promotion target, header format or media role/);
});

test("registration snapshots preserve both independently indexed alternative CTA bindings", () => {
  const f = fixture();
  const alternative = newMetaDraft("INITIAL", "AUTOMATIC_OFFER");
  alternative.promotionTarget = "ALTERNATIVE_PRODUCT";
  alternative.body = [{ type: "text", value: "A different product " }, { type: "variable", name: "promotion.productName" },
    { type: "text", value: " has " }, { type: "variable", name: "promotion.offerDescription" },
    { type: "text", value: ". This offer does not apply to your abandoned basket: " }, { type: "variable", name: "promotion.productUrl" }];
  alternative.buttons = [
    { type: "url", label: "Resume checkout", urlPrefix: "https://shop.example/redirect?checkout=", variable: "checkout.url" },
    { type: "url", label: "View offer", urlPrefix: "https://shop.example/redirect?product=", variable: "promotion.productUrl" },
  ];
  f.definition.offerType = "AUTOMATIC_OFFER";
  f.definition.sourceHash = templateHash(alternative);
  for (const locale of f.locales) {
    const prepared = compileTemplateAst(alternative);
    locale.localeAst = { schemaVersion: 1, authoring: structuredClone(alternative), prepared };
    locale.contentHash = templateHash(prepared);
  }
  const plan = f.plan();
  for (const locale of plan.locales) {
    assert.deepEqual(locale.bindings.buttons, [
      { index: 0, subType: "url", variable: "checkout.url" },
      { index: 1, subType: "url", variable: "promotion.productUrl" },
    ]);
    const componentButtons = (locale.components.find((component) => component.type === "BUTTONS") as any).buttons;
    assert.equal(componentButtons[0].text, "Resume checkout");
    assert.equal(componentButtons[1].text, "View offer");
  }
});

test("partial, unreviewed, duplicate, forged and unsupported provider locale records fail closed", () => {
  const f = fixture(); f.locales.pop();
  assert.throws(() => f.plan(), /All 20 reviewed/);
  const f2 = fixture(); f2.locales[1].status = "TRANSLATING";
  assert.throws(() => f2.plan(), /Review/);
  const f3 = fixture(); f3.locales[1].providerLanguageCode = "untrusted_locale";
  assert.throws(() => f3.plan(), /Provider language does not match/);
  const f4 = fixture(); f4.locales[1].languageTag = "en";
  assert.throws(() => f4.plan(), /All 20 reviewed/);
  const f5 = fixture(); f5.definition.category = "UTILITY";
  assert.throws(() => f5.plan(), /Only immutable/);
});

test("stale compiled header/body/bindings or digests cannot be submitted", () => {
  const f = fixture();
  const locale = f.locales[1];
  const record = locale.localeAst as any;
  record.prepared.parameterBindings.body[0].variable = "shopBrand.brandName";
  locale.contentHash = templateHash(record.prepared); // attacker also updates the visible locale hash
  assert.throws(() => f.plan(), /Component\/variable mapping differs/);
  const next = fixture(); next.locales[1].contentHash = "f".repeat(64);
  assert.throws(() => next.plan(), /Frozen content digest/);
  const final = fixture(); (final.locales.find((l) => l.languageTag === "en")!.localeAst as any).authoring.body[0].value = "Modified source";
  assert.throws(() => final.plan(), /Component\/variable mapping differs/);
});

test("changing WABA or a locale changes the confirmation digest", () => {
  const f = fixture();
  const a = f.plan();
  const b = makeMetaSubmissionPlan({ definition: f.definition, locales: f.locales, trustedWabaId: "987654321000" });
  assert.notEqual(a.digest, b.digest);
  const translated = f.locales.find((l) => l.languageTag === "fr")!;
  translated.localeAst = structuredClone(translated.localeAst);
  (translated.localeAst as any).authoring.body[1].value = " ensuite ";
  const prepared = compileTemplateAst((translated.localeAst as any).authoring);
  (translated.localeAst as any).prepared = prepared;
  translated.contentHash = templateHash(prepared);
  assert.notEqual(f.plan().digest, a.digest);
});
