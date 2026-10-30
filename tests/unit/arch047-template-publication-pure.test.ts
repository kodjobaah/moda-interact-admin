import assert from "node:assert/strict";
import { test } from "node:test";
import { makeTemplateView, parseScope, classify, brandAvailability, equivalentRegistration,
  LANGUAGES, PublicationError, parseBindings } from "../../src/lib/admin/whatsapp-templates/publishing/validation.ts";
import { approvedSource } from "../../src/lib/admin/whatsapp-templates/publishing/source.ts";
import { readShopImpacts } from "../../src/lib/admin/whatsapp-templates/publishing/impact.ts";
import { computePreview, languageComparison } from "../../src/lib/admin/whatsapp-templates/publishing/preview.ts";
import { definitionFixture, fixtureDatabase, shopFixture, WABA, DEFINITION_ID } from "../fixtures/arch047-publication.fixture.ts";
import { getConfigurationEnvironment } from "../../src/lib/admin/platform-configuration/environment.ts";
import { ConfigurationError } from "../../src/lib/admin/platform-configuration/errors.ts";
import { assignmentAuditOperationId } from "../../src/lib/admin/whatsapp-templates/publishing/audit.ts";

const issueCode = (code: string) => (e: unknown) => e instanceof PublicationError && e.code === code;

test("20 immutable reviewed + approved Meta locales are the only valid source", async () => {
  const fixture = fixtureDatabase();
  const approved = await approvedSource(fixture.db as any, DEFINITION_ID, WABA);
  assert.equal(approved.locales.length, 20);
  assert.equal(approved.purpose, "INITIAL_NO_OFFER");
  assert.deepEqual(approved.brandFields, ["shopBrand.brandName"]);
  assert.deepEqual(approved.locales.map((v) => v.languageTag), LANGUAGES);
  fixture.definition.locales[0].metaRegistrations[0].providerStatus = "PENDING";
  await assert.rejects(approvedSource(fixture.db as any, DEFINITION_ID, WABA), issueCode("NOT_READY"));
});

test("approval is insufficient if frozen bindings, provider WABA or reviewed content drift", async () => {
  const definition = definitionFixture();
  const reg = definition.locales[1].metaRegistrations[0];
  reg.parameterBindingsSnapshot.body = [{ position: 1, variable: "offer.code" }];
  assert.equal(equivalentRegistration(reg, definition.locales[1]), false);
  await assert.rejects(approvedSource(fixtureDatabase({ definition }).db as any, DEFINITION_ID, WABA), issueCode("NOT_READY"));
  const another = definitionFixture();
  another.locales[0].metaRegistrations[0].wabaId = "9999999999";
  await assert.rejects(approvedSource(fixtureDatabase({ definition: another }).db as any, DEFINITION_ID, WABA), issueCode("NOT_READY"));
  const third = definitionFixture();
  third.locales[4].metaRegistrations[0].driftDetectedAt = new Date() as any;
  await assert.rejects(approvedSource(fixtureDatabase({ definition: third }).db as any, DEFINITION_ID, WABA), issueCode("NOT_READY"));
});

test("all eligible scope creates a frozen 100-shop, 2,000-target preview and only ten shop rows", async () => {
  const shops = Array.from({ length: 100 }, (_, i) => shopFixture(i + 1));
  shops.push(shopFixture(101, "WOOCOMMERCE", "ACTIVE", "REVOKED"));
  shops.push(shopFixture(102, "SHOPIFY", "SUSPENDED"));
  const fixture = fixtureDatabase({ shops });
  const issuedAt = "2026-10-25T15:30:00.000Z";
  const state = await computePreview(fixture.db as any, DEFINITION_ID, { mode: "all" }, WABA, issuedAt, 1);
  assert.equal(state.shopIds.length, 100); assert.equal(state.excludedCount, 2);
  assert.equal(state.pageItems.length, 10); assert.equal(state.hasNext, true);
  assert.equal(state.impactCounts.new, 2000);
  assert.equal(Object.keys(state.shopDigests).length, 100);
  const page2 = await computePreview(fixture.db as any, DEFINITION_ID, { mode: "all" }, WABA, issuedAt, 2);
  assert.equal(page2.previewFingerprint, state.previewFingerprint);
  assert.notDeepEqual(page2.pageItems.map((s) => s.shopId), state.pageItems.map((s) => s.shopId));
  const late = fixture.shops;
  late.push(shopFixture(103));
  const changed = await computePreview(fixture.db as any, DEFINITION_ID, { mode: "all" }, WABA, issuedAt, 1);
  assert.notEqual(changed.previewFingerprint, state.previewFingerprint, "new shops require new confirmation");
});

test("brand-status preview is per shop, flags configured, missing and not verifiable without copying values", async () => {
  const fixture = fixtureDatabase({ brands: [{ shopId: "shop_0001", brandName: "Shop One Secret Brand" },
    { shopId: "shop_0002", brandName: null }] });
  const state = await computePreview(fixture.db as any, DEFINITION_ID, { mode: "all" }, WABA, "2026-10-25T15:30:00.000Z");
  const first = state.pageItems.find((s) => s.shopId === "shop_0001")!;
  const second = state.pageItems.find((s) => s.shopId === "shop_0002")!;
  assert.deepEqual(first.brand, [{ key: "shopBrand.brandName", availability: "configured" }]);
  assert.deepEqual(second.brand, [{ key: "shopBrand.brandName", availability: "missing" }]);
  assert.doesNotMatch(JSON.stringify(state.pageItems), /Shop One Secret Brand/);
  assert.deepEqual(brandAvailability(["shopBrand.brandName"], null, false),
    [{ key: "shopBrand.brandName", availability: "unverifiable" }]);
});

test("legacy override produces honest missing-history comparison and rejects cross-scope drilldown", async () => {
  const fixture = fixtureDatabase({ variants: [{
    id: "legacy1", shopId: "shop_0001", providerAccountId: WABA, purpose: "INITIAL_NO_OFFER", languageTag: "en",
    status: "APPROVED", enabled: true, providerTemplateName: "external_legacy", providerTemplateId: "44",
    providerLanguageCode: "en", metaRegistrationId: null, updatedAt: new Date(), metaRegistration: null,
  }] });
  const compare = await languageComparison(fixture.db as any, DEFINITION_ID, { mode: "one", shopId: "shop_0001" }, WABA, "shop_0001", "en");
  assert.equal(compare.impact, "override"); assert.equal(compare.previous.provenance, "legacy");
  assert.match(compare.previous.label, /not preserved/i);
  assert.ok(compare.proposed.bindings?.header[0].variable === "shopBrand.brandName");
  await assert.rejects(languageComparison(fixture.db as any, DEFINITION_ID, { mode: "one", shopId: "shop_0001" }, WABA, "shop_0002", "en"), issueCode("FORBIDDEN"));
  assert.equal(classify([{ metaRegistrationId: "registration_2" }, { metaRegistrationId: null }], "registration_2"), "conflict");
});

test("selection rejects untrusted shop IDs and unbounded arrays", () => {
  assert.deepEqual(parseScope({ mode: "selected", shopIds: ["shop_b", "shop_a"] }),
    { mode: "selected", shopIds: ["shop_a", "shop_b"] });
  assert.throws(() => parseScope({ mode: "one", shopId: "shop_a", wabaId: "injected" }), issueCode("INPUT"));
  assert.throws(() => parseScope({ mode: "selected", shopIds: Array.from({ length: 201 }, (_, i) => `shop${i}`) }), issueCode("INPUT"));
});

test("missing ShopBrand row and failed shop-specific lookup remain warnings, not eligibility exclusions", async () => {
  const fixture = fixtureDatabase({ brands: [{ shopId: "shop_0001", brandName: "Private Merchant One" }] });
  const source = await approvedSource(fixture.db as any, DEFINITION_ID, WABA);
  assert.deepEqual(source.brandFields, ["shopBrand.brandName"]);
  const original = fixture.db.shopBrand.findMany;
  fixture.db.shopBrand.findMany = async () => { throw Error("Sensitive vendor failure"); };
  const preview = await computePreview(fixture.db as any, DEFINITION_ID, { mode: "all" }, WABA, new Date().toISOString());
  assert.equal(preview.shopIds.length, 2);
  assert.deepEqual(preview.pageItems.map((row) => row.brand[0].availability), ["unverifiable", "unverifiable"]);
  assert.doesNotMatch(JSON.stringify(preview.pageItems), /Private Merchant One|Sensitive vendor failure/);
  fixture.db.shopBrand.findMany = original;
  const restored = await computePreview(fixture.db as any, DEFINITION_ID, { mode: "all" }, WABA, new Date().toISOString());
  assert.deepEqual(restored.pageItems.map((row) => row.brand[0].availability), ["configured", "missing"]);
});

test("two approved selectable variants for one purpose/language force an explicit conflict", async () => {
  const old = { shopId: "shop_0001", providerAccountId: WABA, purpose: "INITIAL_NO_OFFER",
    languageTag: "en", status: "APPROVED", enabled: true, metaRegistrationId: null,
    providerTemplateName: "legacy", providerLanguageCode: "en", providerTemplateId: "10",
    updatedAt: new Date(), metaRegistration: null };
  const fixture = fixtureDatabase({ variants: [{ ...old, id: "legacy_a" }, { ...old, id: "legacy_b" }] });
  const impact = await computePreview(fixture.db as any, DEFINITION_ID, { mode: "one", shopId: "shop_0001" },
    WABA, new Date().toISOString());
  assert.equal(impact.impactCounts.conflict, 1);
});

test("same-purpose assignments are selected by immutable target and header kind, and duplicate matches conflict", async () => {
  const purpose = "INITIAL_CODE_OFFER";
  const variant = (id: string, promotionTarget: string, headerKind: string) => ({
    id, shopId: "shop_0001", providerAccountId: WABA, purpose, languageTag: "en",
    providerTemplateName: id, providerLanguageCode: "en", providerTemplateId: id,
    status: "APPROVED", enabled: true, metaRegistrationId: id, updatedAt: new Date(),
    metaRegistration: {
      providerTemplateName: id, providerLanguageCode: "en", category: "MARKETING", providerStatus: "APPROVED",
      componentsSnapshot: [{ type: "HEADER", format: headerKind }, { type: "BODY", text: "variant" }],
      parameterBindingsSnapshot: { schemaVersion: 1, promotionTarget, header: [], body: [], buttons: [] },
    },
  });
  const checkout = variant("checkout_text", "CHECKOUT", "TEXT");
  const alternativeImage = variant("alternative_image", "ALTERNATIVE_PRODUCT", "IMAGE");
  const alternativeText = variant("alternative_text", "ALTERNATIVE_PRODUCT", "TEXT");
  const source = {
    purpose, offerType: "CODE_OFFER", promotionTarget: "ALTERNATIVE_PRODUCT", headerKind: "TEXT",
    wabaId: WABA, locales: [{ languageTag: "en", registrationId: "new", view: {}, brandFields: [] }], brandFields: [],
  } as any;
  const candidate = { ...shopFixture(1), wooStatus: null };
  const oneMatch = fixtureDatabase({ variants: [checkout, alternativeImage, alternativeText] });
  const impact = (await readShopImpacts(oneMatch.db as any, source, [candidate], false))[0];
  assert.equal(impact.public.counts.replaced, 1);
  assert.equal(impact.public.counts.conflict, 0);

  const duplicateMatch = fixtureDatabase({ variants: [checkout, alternativeImage, alternativeText,
    variant("alternative_text_duplicate", "ALTERNATIVE_PRODUCT", "TEXT")] });
  const ambiguous = (await readShopImpacts(duplicateMatch.db as any, source, [candidate], false))[0];
  assert.equal(ambiguous.variantsByLanguage.get("en")?.length, 2);
  assert.equal(ambiguous.public.counts.conflict, 1);
});

test("a linked registration with wrong persisted Meta identity is not treated as an unchanged assignment", async () => {
  const fixture = fixtureDatabase({ variants: [{
    id: "invalid_identity", shopId: "shop_0001", providerAccountId: WABA, purpose: "INITIAL_NO_OFFER",
    languageTag: "en", status: "APPROVED", enabled: true,
    metaRegistrationId: `registration_${LANGUAGES.indexOf("en")}`,
    providerTemplateName: "badly_renamed", providerLanguageCode: "en", providerTemplateId: String(1000 + LANGUAGES.indexOf("en")),
    updatedAt: new Date(), metaRegistration: null,
  }] });
  const impact = await computePreview(fixture.db as any, DEFINITION_ID,
    { mode: "one", shopId: "shop_0001" }, WABA, new Date().toISOString());
  assert.equal(impact.impactCounts.conflict, 1);
});

test("WooCommerce requires active installation; Shopify can remain eligible independently", async () => {
  const fixture = fixtureDatabase({ shops: [shopFixture(1), shopFixture(2, "WOOCOMMERCE", "ACTIVE", "REVOKED"),
    shopFixture(3, "WOOCOMMERCE", "ACTIVE", "ACTIVE"), shopFixture(4, "SHOPIFY", "SUSPENDED")] });
  const preview = await computePreview(fixture.db as any, DEFINITION_ID,
    { mode: "all" }, WABA, new Date().toISOString());
  assert.deepEqual(preview.shopIds, ["shop_0001", "shop_0003"]);
  assert.equal(preview.excludedCount, 2);
});

test("reviewed translation cannot silently replace or add semantic bindings while hashes still match", async () => {
  const definition = definitionFixture();
  const locale = definition.locales[LANGUAGES.indexOf("fr")];
  const reg = locale.metaRegistrations[0];
  const bindings = structuredClone(reg.parameterBindingsSnapshot);
  bindings.body[0].variable = "checkout.url";
  reg.parameterBindingsSnapshot = bindings;
  if (locale.localeAst.prepared.family !== "META_RECOVERY") throw Error("Expected Meta prepared fixture");
  locale.localeAst.prepared.parameterBindings = structuredClone(bindings);
  const { templateHash } = await import("../../src/lib/admin/whatsapp-templates/authoring/identifiers.ts");
  const changedHash = templateHash(locale.localeAst.prepared);
  locale.contentHash = changedHash; reg.submittedContentHash = changedHash; reg.lastObservedContentHash = changedHash;
  assert.equal(equivalentRegistration(reg, locale), true, "frozen snapshot itself is internally consistent");
  await assert.rejects(approvedSource(fixtureDatabase({ definition }).db as any, DEFINITION_ID, WABA), issueCode("CONTENT"));
});

// Sender WABA lookup must preserve the platform configuration security contract
// without importing the Admin-authenticated configuration service.
test("publication sender environment selection preserves production isolation", () => {
  const beforeEnvironment = process.env.DEPLOYMENT_ENVIRONMENT_NAME;
  const beforeNodeEnvironment = process.env.NODE_ENV;
  // Next/Node typings expose NODE_ENV as readonly; mutate only in this isolated test.
  const setNodeEnvironment = (value: string | undefined) => value === undefined
    ? Reflect.deleteProperty(process.env, "NODE_ENV")
    : Reflect.set(process.env, "NODE_ENV", value);
  try {
    setNodeEnvironment("test");
    process.env.DEPLOYMENT_ENVIRONMENT_NAME = "staging";
    assert.equal(getConfigurationEnvironment(), "staging");
    process.env.DEPLOYMENT_ENVIRONMENT_NAME = "unrecognised";
    assert.throws(() => getConfigurationEnvironment(),
      (error: unknown) => error instanceof ConfigurationError && error.code === "INVALID_INPUT");
    setNodeEnvironment("production");
    process.env.DEPLOYMENT_ENVIRONMENT_NAME = "development";
    assert.throws(() => getConfigurationEnvironment(),
      (error: unknown) => error instanceof ConfigurationError && error.code === "FORBIDDEN");
  } finally {
    if (beforeEnvironment === undefined) delete process.env.DEPLOYMENT_ENVIRONMENT_NAME;
    else process.env.DEPLOYMENT_ENVIRONMENT_NAME = beforeEnvironment;
    setNodeEnvironment(beforeNodeEnvironment);
  }
});


test("per-shop language audit keys are deterministic and unique to the publication target", () => {
  const publicationId = "publication_001";
  const first = assignmentAuditOperationId(publicationId, "shop_0001", "en");
  assert.equal(first, assignmentAuditOperationId(publicationId, "shop_0001", "en"));
  assert.match(first, /^arch047-assignment-[a-f0-9]{64}$/);
  assert.ok(first.length <= 128);
  assert.notEqual(first, publicationId);
  assert.equal(new Set([
    first,
    assignmentAuditOperationId(publicationId, "shop_0001", "fr"),
    assignmentAuditOperationId(publicationId, "shop_0002", "en"),
    assignmentAuditOperationId("publication_002", "shop_0001", "en"),
  ]).size, 4);
});


test("publication accepts the compiled taxonomy category parameter binding but refuses unknown keys", () => {
  const base = { schemaVersion: 1, header: [],
    body: [{ position: 1, variable: "shop.categoryName" }], buttons: [] };
  assert.deepEqual(parseBindings(base).body, base.body);
  assert.throws(() => parseBindings({ ...base, body: [{ position: 1, variable: "shop.categoryDescription" }] }), issueCode("CONTENT"));
});
