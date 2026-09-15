import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMerchantPricingTranslationTemplate,
  parseCompletedMerchantPricingTranslationPackage,
} from "../../src/lib/admin/merchant-pricing-translations.ts";

const expected = {
  planHandle: "starter",
  planName: "Starter",
  englishDescription: "English description",
  highlights: [
    {
      contentKey: "550e8400-e29b-41d4-a716-446655440000",
      title: "Included capacity",
      description: "100 monthly recovery conversations.",
    },
  ],
};

function completePackage() {
  const template = buildMerchantPricingTranslationTemplate(expected);
  return {
    ...template,
    translations: Object.fromEntries(
      Object.keys(template.translations).map((locale) => [
        locale,
        {
          description:
            locale === "en"
              ? expected.englishDescription
              : `Description ${locale}`,
          highlights: {
            [expected.highlights[0].contentKey]: {
              title:
                locale === "en"
                  ? expected.highlights[0].title
                  : `Title ${locale}`,
              description:
                locale === "en"
                  ? expected.highlights[0].description
                  : `Highlight ${locale}`,
            },
          },
        },
      ]),
    ),
  };
}

test("generates the exact ordered 20-locale template", () => {
  const template = buildMerchantPricingTranslationTemplate(expected);
  assert.deepEqual(Object.keys(template), ["_meta", "translations"]);
  assert.deepEqual(Object.keys(template.translations), [
    "cs",
    "da",
    "de",
    "en",
    "es",
    "fi",
    "fr",
    "it",
    "ja",
    "ko",
    "nb",
    "nl",
    "pl",
    "pt-BR",
    "pt-PT",
    "sv",
    "th",
    "tr",
    "zh-Hans",
    "zh-Hant",
  ]);
  assert.equal(
    template.translations.en.description,
    expected.englishDescription,
  );
  assert.equal(
    Object.values(template.translations).filter(
      ({ description }) => description === "",
    ).length,
    19,
  );
  assert.equal(
    template.translations.en.highlights[expected.highlights[0].contentKey]
      .title,
    expected.highlights[0].title,
  );
});

test("retains unchanged translations by content key and blanks changed sources", () => {
  const previous = buildMerchantPricingTranslationTemplate(expected);
  for (const locale of Object.keys(previous.translations)) {
    previous.translations[locale as keyof typeof previous.translations] = {
      description: `Existing description ${locale}`,
      highlights: {
        [expected.highlights[0].contentKey]: {
          title: `Existing title ${locale}`,
          description: `Existing highlight ${locale}`,
        },
      },
    };
  }

  const retained = buildMerchantPricingTranslationTemplate({
    ...expected,
    highlights: [...expected.highlights].reverse(),
    previous: {
      englishDescription: expected.englishDescription,
      highlights: expected.highlights,
      translations: Object.entries(previous.translations).map(
        ([locale, value]) => ({
          locale,
          merchantDescription: value.description,
          highlights: Object.entries(value.highlights).map(
            ([contentKey, highlight]) => ({
              contentKey,
              ...highlight,
            }),
          ),
        }),
      ),
    },
  });
  assert.equal(retained.translations.fr.description, "Existing description fr");
  assert.equal(
    retained.translations.fr.highlights[expected.highlights[0].contentKey]
      .title,
    "Existing title fr",
  );

  const changed = buildMerchantPricingTranslationTemplate({
    ...expected,
    englishDescription: "Changed description",
    highlights: [{ ...expected.highlights[0], title: "Changed title" }],
    previous: {
      englishDescription: expected.englishDescription,
      highlights: expected.highlights,
      translations: Object.entries(previous.translations).map(
        ([locale, value]) => ({
          locale,
          merchantDescription: value.description,
          highlights: Object.entries(value.highlights).map(
            ([contentKey, highlight]) => ({
              contentKey,
              ...highlight,
            }),
          ),
        }),
      ),
    },
  });
  assert.equal(changed.translations.fr.description, "");
  assert.equal(
    changed.translations.fr.highlights[expected.highlights[0].contentKey].title,
    "",
  );
});

test("accepts a completed package and rejects aliases and structural mismatches", () => {
  const valid = parseCompletedMerchantPricingTranslationPackage(
    JSON.stringify(completePackage()),
    expected,
  );
  assert.equal(valid.valid, true);
  assert.equal(valid.completeCount, 20);

  const alias = completePackage() as Record<string, unknown>;
  const translations = { ...(alias.translations as Record<string, unknown>) };
  delete translations["pt-BR"];
  translations.pt_BR = { description: "Portuguese" };
  const aliasResult = parseCompletedMerchantPricingTranslationPackage(
    JSON.stringify({ ...alias, translations }),
    expected,
  );
  assert.ok(aliasResult.issues.some(({ code }) => code === "MISSING_LOCALE"));
  assert.ok(
    aliasResult.issues.some(({ code }) => code === "UNEXPECTED_LOCALE"),
  );
});

test("returns all bounded validation issues in canonical order", () => {
  const raw = JSON.stringify({
    _meta: {
      schemaVersion: 3,
      planHandle: "other",
      planName: "Other",
      sourceLocale: "en",
    },
    translations: {
      en: {
        description: "wrong",
        highlights: {
          [expected.highlights[0].contentKey]: {
            title: "Wrong title",
            description: "Wrong description",
          },
        },
      },
    },
    extra: true,
  });
  const result = parseCompletedMerchantPricingTranslationPackage(raw, expected);
  assert.equal(result.valid, false);
  assert.equal(result.issues[0].code, "INVALID_JSON");
  assert.ok(
    result.issues.some(({ code }) => code === "UNSUPPORTED_SCHEMA_VERSION"),
  );
  assert.ok(result.issues.some(({ code }) => code === "PLAN_HANDLE_MISMATCH"));
  assert.ok(result.issues.some(({ code }) => code === "MISSING_LOCALE"));
  assert.ok(
    result.issues.some(({ code }) => code === "ENGLISH_SOURCE_MISMATCH"),
  );
});

test("rejects malformed JSON, blank descriptions, and descriptions over 2000 characters", () => {
  assert.equal(
    parseCompletedMerchantPricingTranslationPackage("{", expected).issues[0]
      .code,
    "INVALID_JSON",
  );
  const value = completePackage();
  value.translations.fr.description = " ";
  value.translations.de.description = "x".repeat(2001);
  const result = parseCompletedMerchantPricingTranslationPackage(
    JSON.stringify(value),
    expected,
  );
  assert.ok(
    result.issues.some(
      ({ code, locale }) => code === "DESCRIPTION_EMPTY" && locale === "fr",
    ),
  );
  assert.ok(
    result.issues.some(
      ({ code, locale }) => code === "DESCRIPTION_TOO_LONG" && locale === "de",
    ),
  );
});
