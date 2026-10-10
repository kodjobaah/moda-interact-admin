import assert from "node:assert/strict";
import test from "node:test";
import { MERCHANT_PRICING_LOCALES } from "../../src/lib/admin/merchant-pricing-locales.ts";
import {
  assertMerchantPricingLocaleRegistryMatchesShared,
  buildMerchantPricingTranslationItemSeeds,
  canonicalMerchantPricingTranslationSource,
  merchantPricingTranslationSourceHash,
} from "../../src/lib/admin/merchant/merchant-pricing-automatic-translations.ts";

const firstKey = "11111111-1111-4111-8111-111111111111";
const secondKey = "22222222-2222-4222-8222-222222222222";

function source(highlights = [
  { contentKey: firstKey, title: "Fast", description: "Fast recovery" },
  { contentKey: secondKey, title: "Helpful", description: "Helpful conversations" },
]) {
  return canonicalMerchantPricingTranslationSource({
    shopifyPlanHandle: " starter ",
    englishDescription: " Recover baskets ",
    highlights,
  });
}

function previous() {
  return {
    englishDescription: "Recover baskets",
    translations: MERCHANT_PRICING_LOCALES.map((locale) => ({
      locale,
      merchantDescription: `${locale}-plan`,
    })),
    highlights: [firstKey, secondKey].map((contentKey) => ({
      contentKey,
      englishTitle: contentKey === firstKey ? "Fast" : "Helpful",
      englishDescription:
        contentKey === firstKey ? "Fast recovery" : "Helpful conversations",
      translations: MERCHANT_PRICING_LOCALES.map((locale) => ({
        locale,
        title: `${locale}-${contentKey}-title`,
        description: `${locale}-${contentKey}-description`,
      })),
    })),
  };
}

test("Merchant Pricing locales exactly match the Shared supported-language registry", () => {
  assert.doesNotThrow(() => assertMerchantPricingLocaleRegistryMatchesShared());
});

test("canonical source trims content and is invariant to highlight reorder", () => {
  const left = source();
  const right = source([...left.highlights].reverse());
  assert.equal(left.shopifyPlanHandle, "starter");
  assert.equal(left.englishDescription, "Recover baskets");
  assert.deepEqual(
    left.highlights.map(({ contentKey }) => contentKey),
    [firstKey, secondKey],
  );
  assert.equal(
    merchantPricingTranslationSourceHash(left),
    merchantPricingTranslationSourceHash(right),
  );
});

test("canonical source hash changes when translatable content changes", () => {
  const before = source();
  const after = source([
    { ...before.highlights[0], title: "Faster" },
    before.highlights[1],
  ]);
  assert.notEqual(
    merchantPricingTranslationSourceHash(before),
    merchantPricingTranslationSourceHash(after),
  );
});

test("new plans stage English immediately and only non-English fields as pending", () => {
  const current = source([source().highlights[0]]);
  const seeds = buildMerchantPricingTranslationItemSeeds({
    source: current,
    now: new Date("2026-10-10T10:00:00.000Z"),
  });
  assert.equal(seeds.length, MERCHANT_PRICING_LOCALES.length * 3);
  assert.equal(seeds.filter(({ status }) => status === "AVAILABLE").length, 3);
  assert.equal(
    seeds.filter(({ status }) => status === "PENDING").length,
    (MERCHANT_PRICING_LOCALES.length - 1) * 3,
  );
  assert.ok(
    seeds
      .filter(({ targetLanguageTag }) => targetLanguageTag === "en")
      .every(({ translatedText }) => Boolean(translatedText)),
  );
});

test("edits retain unchanged fields independently and translate only a changed field", () => {
  const current = source([
    {
      contentKey: firstKey,
      title: "Faster",
      description: "Fast recovery",
    },
    source().highlights[1],
  ]);
  const seeds = buildMerchantPricingTranslationItemSeeds({
    source: current,
    previous: previous(),
    now: new Date("2026-10-10T10:00:00.000Z"),
  });
  const changedTitle = seeds.filter(
    ({ sourceContentKey, sourceField }) =>
      sourceContentKey === firstKey && sourceField === "TITLE",
  );
  assert.equal(changedTitle.filter(({ status }) => status === "AVAILABLE").length, 1);
  assert.equal(
    changedTitle.filter(({ status }) => status === "PENDING").length,
    MERCHANT_PRICING_LOCALES.length - 1,
  );
  assert.ok(
    seeds
      .filter(
        ({ sourceContentKey, sourceField }) =>
          !(sourceContentKey === firstKey && sourceField === "TITLE"),
      )
      .every(({ status }) => status === "AVAILABLE"),
  );
});

test("reorder-only edits retain every persisted translation", () => {
  const current = source([...source().highlights].reverse());
  const seeds = buildMerchantPricingTranslationItemSeeds({
    source: current,
    previous: previous(),
    now: new Date("2026-10-10T10:00:00.000Z"),
  });
  assert.ok(seeds.every(({ status }) => status === "AVAILABLE"));
});

test("retention fails closed when persisted locale coverage is incomplete", () => {
  const stored = previous();
  stored.translations = stored.translations.filter(({ locale }) => locale !== "fr");
  assert.throws(
    () =>
      buildMerchantPricingTranslationItemSeeds({
        source: source(),
        previous: stored,
        now: new Date("2026-10-10T10:00:00.000Z"),
      }),
    /exact supported locale set/,
  );
});
