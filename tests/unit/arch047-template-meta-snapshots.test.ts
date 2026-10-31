import assert from "node:assert/strict";
import { test } from "node:test";
import { compileTemplateAst } from "../../src/lib/admin/whatsapp-templates/authoring/compiler.ts";
import { newMetaDraft } from "../../src/lib/admin/whatsapp-templates/authoring/draft-operations.ts";
import { templateHash } from "../../src/lib/admin/whatsapp-templates/authoring/identifiers.ts";
import { makeMetaSubmissionPlan } from "../../src/lib/admin/whatsapp-templates/meta/snapshot.ts";
import { META_LANGUAGES } from "../../src/lib/admin/whatsapp-templates/meta/languages.ts";
import { fixture, localizedInitialCopy } from "../helpers/arch047-template-meta-fixture.ts";

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
    { type: "variable", name: "offer.description" }, { type: "variable", name: "offer.code" },
    { type: "text", value: ".\n\nFrom " }, { type: "variable", name: "shop.name" },
    { type: "text", value: ". Need help with this basket? Use WhatsApp's Reply option on this message, then type your question or send a voice note (up to 2 minutes)." }];
  image.buttons = [{ type: "url", label: "Resume checkout", urlPrefix: "https://shop.example/checkout?url=", variable: "checkout.url" }];
  f.definition.offerType = "CODE_OFFER";
  f.definition.providerTemplateName = "moda_initial_code_offer_checkout_image";
  f.definition.sourceHash = templateHash(image);
  for (const locale of f.locales) {
    const authoring = localizedInitialCopy(image, locale.languageTag);
    const prepared = compileTemplateAst(authoring);
    locale.localeAst = { schemaVersion: 1, authoring, prepared };
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
  const drifted = localizedInitialCopy({ ...structuredClone(image), shopBrandMediaRole: "LOGO" as const }, "fr");
  const driftedPrepared = compileTemplateAst(drifted);
  french.localeAst = { schemaVersion: 1, authoring: drifted, prepared: driftedPrepared };
  french.contentHash = templateHash(driftedPrepared);
  assert.throws(() => f.plan(), /header format or media role/);
});

test("offer.codes freezes as one bounded body parameter and changes immutable approval identity", () => {
  const f = fixture();
  const single = newMetaDraft("INITIAL", "CODE_OFFER");
  single.promotionTarget = "CHECKOUT";
  single.body = [
    { type: "text", value: "Your basket " }, { type: "variable", name: "checkout.itemsSummary" },
    { type: "text", value: " may qualify for " }, { type: "variable", name: "offer.description" },
    { type: "text", value: " with code " }, { type: "variable", name: "offer.code" },
    { type: "text", value: ".\n\nFrom " }, { type: "variable", name: "shop.name" },
    { type: "text", value: ". Need help with this basket? Use WhatsApp's Reply option on this message, then type your question or send a voice note (up to 2 minutes)." },
  ];
  const multi = structuredClone(single);
  multi.body = multi.body.map((node) => node.type === "variable" && node.name === "offer.code"
    ? { ...node, name: "offer.codes" as const } : node);
  multi.body = multi.body.map((node) => node.type === "text" && node.value.includes(" with code ")
    ? { ...node, value: ". Possible codes " } : node);
  multi.body = multi.body.map((node) => node.type === "text" && node.value === ".\n\nFrom "
    ? { ...node, value: ", subject to checkout eligibility.\n\nFrom " } : node);
  const singlePrepared = compileTemplateAst(single);
  const multiPrepared = compileTemplateAst(multi);
  assert.notEqual(templateHash(single), templateHash(multi));
  assert.notEqual(templateHash(singlePrepared), templateHash(multiPrepared));
  if (multiPrepared.family !== "META_RECOVERY") throw new Error("Expected Meta projection.");
  assert.deepEqual(multiPrepared.parameterBindings.body.map(({ variable }) => variable),
    ["checkout.itemsSummary", "offer.description", "offer.codes", "shop.name"]);
  const multiPlan = makeMetaSubmissionPlan({
    definition: { id: f.definition.id, kind: "META_RECOVERY", purpose: "INITIAL", offerType: "CODE_OFFER",
      providerTemplateName: "moda_initial_code_offer_multi_codes", category: "MARKETING",
      sourceHash: templateHash(multi), sourceLanguageTag: "en", status: "SAVED" },
    locales: f.locales.map((locale) => {
      const authoring = localizedInitialCopy(multi, locale.languageTag);
      const prepared = compileTemplateAst(authoring);
      return { ...locale, localeAst: { schemaVersion: 1, authoring, prepared }, contentHash: templateHash(prepared) };
    }), trustedWabaId: "123456789012",
  });
  assert.ok(multiPlan.digest);
  assert.ok(multiPlan.locales.every((locale) => locale.bindings.body.some((binding) => binding.variable === "offer.codes")));
  assert.ok(multiPlan.locales.every((locale) => locale.components.some((component) => component.type === "BODY" &&
    String(component.text).includes("{{3}}"))));
});

test("the immutable header, translated body positions and URL binding are preserved", () => {
  const plan = fixture().plan();
  const english = plan.locales.find((l) => l.languageTag === "en")!;
  const french = plan.locales.find((l) => l.languageTag === "fr")!;
  assert.deepEqual(english.bindings.header, [{ position: 1, variable: "shopBrand.brandName" }]);
  assert.deepEqual(english.bindings.body, [{ position: 1, variable: "customer.firstName" },
    { position: 2, variable: "shopBrand.logoAltText" }, { position: 3, variable: "shop.name" }]);
  assert.deepEqual(french.bindings.body, [{ position: 1, variable: "shopBrand.logoAltText" },
    { position: 2, variable: "customer.firstName" }, { position: 3, variable: "shop.name" }]);
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
    { type: "variable", name: "offer.description" }, { type: "variable", name: "offer.code" },
    { type: "text", value: ".\n\nFrom " }, { type: "variable", name: "shop.name" },
    { type: "text", value: ". Need help with this basket? Use WhatsApp's Reply option on this message, then type your question or send a voice note (up to 2 minutes)." }];
  checkout.buttons = [{ type: "url", label: "Resume checkout", urlPrefix: "https://shop.example/checkout?url=", variable: "checkout.url" }];
  f.definition.offerType = "CODE_OFFER";
  f.definition.providerTemplateName = "moda_initial_code_offer_target_test";
  f.definition.sourceHash = templateHash(checkout);
  for (const locale of f.locales) {
    const authoring = localizedInitialCopy(checkout, locale.languageTag);
    const prepared = compileTemplateAst(authoring);
    locale.localeAst = { schemaVersion: 1, authoring, prepared };
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
    { type: "text", value: ". This offer does not apply to your abandoned basket: " },
    { type: "variable", name: "promotion.productUrl" },
    { type: "text", value: ".\n\nFrom " }, { type: "variable", name: "shop.name" },
    { type: "text", value: ". Need help with this offer or your basket? Use WhatsApp's Reply option on this message, then type your question or send a voice note (up to 2 minutes)." }];
  alternative.buttons = checkout.buttons;
  const localizedAlternative = localizedInitialCopy(alternative, "fr");
  const alternativePrepared = compileTemplateAst(localizedAlternative);
  french.localeAst = { schemaVersion: 1, authoring: localizedAlternative, prepared: alternativePrepared };
  french.contentHash = templateHash(alternativePrepared);
  assert.throws(() => f.plan(), /promotion target, header format or media role/);
});

test("registration snapshots preserve both independently indexed alternative CTA bindings", () => {
  const f = fixture();
  const alternative = newMetaDraft("INITIAL", "AUTOMATIC_OFFER");
  alternative.promotionTarget = "ALTERNATIVE_PRODUCT";
  alternative.body = [{ type: "text", value: "A different product " }, { type: "variable", name: "promotion.productName" },
    { type: "text", value: " has " }, { type: "variable", name: "promotion.offerDescription" },
    { type: "text", value: ". This offer does not apply to your abandoned basket: " }, { type: "variable", name: "promotion.productUrl" },
    { type: "text", value: ".\n\nFrom " }, { type: "variable", name: "shop.name" },
    { type: "text", value: ". Need help with this offer or your basket? Use WhatsApp's Reply option on this message, then type your question or send a voice note (up to 2 minutes)." }];
  alternative.buttons = [
    { type: "url", label: "Resume checkout", urlPrefix: "https://shop.example/redirect?checkout=", variable: "checkout.url" },
    { type: "url", label: "View offer", urlPrefix: "https://shop.example/redirect?product=", variable: "promotion.productUrl" },
  ];
  f.definition.offerType = "AUTOMATIC_OFFER";
  f.definition.sourceHash = templateHash(alternative);
  for (const locale of f.locales) {
    const authoring = localizedInitialCopy(alternative, locale.languageTag);
    const prepared = compileTemplateAst(authoring);
    locale.localeAst = { schemaVersion: 1, authoring, prepared };
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


test("localized initial Reply copy must match the reviewed locale and promotion target", () => {
  const f = fixture();
  const french = f.locales.find((locale) => locale.languageTag === "fr")!;
  const record = french.localeAst as any;
  record.authoring.body[record.authoring.body.length - 1].value = ". Envoyez-nous un message pour obtenir de l’aide.";
  record.prepared = compileTemplateAst(record.authoring);
  french.contentHash = templateHash(record.prepared);
  assert.throws(() => f.plan(), /Initial recovery semantics are incomplete for fr/);
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
