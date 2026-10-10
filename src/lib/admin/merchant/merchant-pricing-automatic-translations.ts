import { createHash } from "node:crypto";
import { MODA_SUPPORTED_LANGUAGE_TAGS } from "@modainteract/moda-interact-shared/internationalization";
import {
  MERCHANT_PRICING_LOCALES,
  type MerchantPricingLocale,
} from "../merchant-pricing-locales.ts";
import type { MerchantPricingTranslationHighlightSource } from "./pricing-translations.ts";

export const MERCHANT_PRICING_TRANSLATION_SOURCE_SCHEMA_VERSION = 1;
export const MERCHANT_PRICING_TRANSLATION_SOURCE_LANGUAGE_TAG = "en" as const;

const CANONICAL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type MerchantPricingAutomaticTranslationSourceInput = {
  shopifyPlanHandle: unknown;
  englishDescription: unknown;
  highlights: unknown;
};

export type MerchantPricingTranslationSourceSnapshot = {
  schemaVersion: 1;
  shopifyPlanHandle: string;
  englishDescription: string;
  highlights: MerchantPricingTranslationHighlightSource[];
};

export type MerchantPricingExistingTranslationState = {
  englishDescription: string;
  translations: Array<{
    locale: string;
    merchantDescription: string;
  }>;
  highlights: Array<{
    contentKey: string;
    englishTitle: string;
    englishDescription: string;
    translations: Array<{
      locale: string;
      title: string;
      description: string;
    }>;
  }>;
};

export type MerchantPricingTranslationItemSeed = {
  sourceEntityKind: "PLAN" | "HIGHLIGHT";
  sourceContentKey: string | null;
  sourceField: "TITLE" | "DESCRIPTION";
  sourceLanguageTag: "en";
  targetLanguageTag: MerchantPricingLocale;
  sourceText: string;
  translatedText: string | null;
  status: "PENDING" | "AVAILABLE";
  completedAt: Date | null;
};

function normalized(value: string): string {
  return value.trim();
}

function requiredString(
  value: unknown,
  label: string,
  maxLength: number,
): string {
  if (typeof value !== "string") {
    throw new Error(`${label} is invalid.`);
  }
  const result = normalized(value);
  if (!result || result.length > maxLength) {
    throw new Error(`${label} is invalid.`);
  }
  return result;
}

function parseHighlights(value: unknown): MerchantPricingTranslationHighlightSource[] {
  if (!Array.isArray(value)) {
    throw new Error("Merchant Pricing highlights are invalid.");
  }
  const seen = new Set<string>();
  return value.map((candidate, index) => {
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
      throw new Error(`Merchant Pricing highlight ${index + 1} is invalid.`);
    }
    const row = candidate as Record<string, unknown>;
    const contentKey = requiredString(
      row.contentKey,
      `Merchant Pricing highlight ${index + 1} content key`,
      64,
    );
    if (!CANONICAL_UUID.test(contentKey) || seen.has(contentKey.toLowerCase())) {
      throw new Error(`Merchant Pricing highlight ${index + 1} content key is invalid.`);
    }
    seen.add(contentKey.toLowerCase());
    return {
      contentKey,
      title: requiredString(
        row.title,
        `Merchant Pricing highlight ${index + 1} title`,
        120,
      ),
      description: requiredString(
        row.description,
        `Merchant Pricing highlight ${index + 1} description`,
        500,
      ),
    };
  });
}

export function canonicalMerchantPricingTranslationSource(
  input: MerchantPricingAutomaticTranslationSourceInput,
): MerchantPricingTranslationSourceSnapshot {
  const highlights = parseHighlights(input.highlights).sort((left, right) =>
    left.contentKey.localeCompare(right.contentKey),
  );
  return {
    schemaVersion: MERCHANT_PRICING_TRANSLATION_SOURCE_SCHEMA_VERSION,
    shopifyPlanHandle: requiredString(
      input.shopifyPlanHandle,
      "Shopify plan handle",
      255,
    ),
    englishDescription: requiredString(
      input.englishDescription,
      "Merchant Pricing English description",
      2000,
    ),
    highlights,
  };
}

export function parseMerchantPricingTranslationSourceSnapshot(
  value: unknown,
): MerchantPricingTranslationSourceSnapshot {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Merchant Pricing translation source snapshot is invalid.");
  }
  const row = value as Record<string, unknown>;
  if (row.schemaVersion !== MERCHANT_PRICING_TRANSLATION_SOURCE_SCHEMA_VERSION) {
    throw new Error("Merchant Pricing translation source snapshot version is invalid.");
  }
  return canonicalMerchantPricingTranslationSource({
    shopifyPlanHandle: row.shopifyPlanHandle,
    englishDescription: row.englishDescription,
    highlights: row.highlights,
  });
}

export function merchantPricingTranslationSourceHash(
  snapshot: MerchantPricingTranslationSourceSnapshot,
): string {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

export function assertMerchantPricingLocaleRegistryMatchesShared(): void {
  const merchantPricing = [...MERCHANT_PRICING_LOCALES].sort();
  const shared = [...MODA_SUPPORTED_LANGUAGE_TAGS].sort();
  if (
    merchantPricing.length !== shared.length ||
    merchantPricing.some((locale, index) => locale !== shared[index])
  ) {
    throw new Error(
      "Merchant Pricing locales do not match the platform supported-language registry.",
    );
  }
}

function exactLocaleMap<T extends { locale: string }>(
  rows: T[],
  label: string,
): Map<MerchantPricingLocale, T> {
  const result = new Map<MerchantPricingLocale, T>();
  for (const row of rows) {
    if (!MERCHANT_PRICING_LOCALES.includes(row.locale as MerchantPricingLocale)) {
      throw new Error(`${label} contains an unsupported locale.`);
    }
    const locale = row.locale as MerchantPricingLocale;
    if (result.has(locale)) {
      throw new Error(`${label} contains duplicate locale ${locale}.`);
    }
    result.set(locale, row);
  }
  if (
    result.size !== MERCHANT_PRICING_LOCALES.length ||
    MERCHANT_PRICING_LOCALES.some((locale) => !result.has(locale))
  ) {
    throw new Error(`${label} does not contain the exact supported locale set.`);
  }
  return result;
}

function retainedText(value: string, label: string): string {
  if (!normalized(value)) {
    throw new Error(`${label} is empty.`);
  }
  return value;
}

function seed(
  input: {
    entityKind: "PLAN" | "HIGHLIGHT";
    contentKey: string | null;
    field: "TITLE" | "DESCRIPTION";
    sourceText: string;
    retainedByLocale?: Map<MerchantPricingLocale, string>;
  },
  locale: MerchantPricingLocale,
  now: Date,
): MerchantPricingTranslationItemSeed {
  const retained = input.retainedByLocale?.get(locale);
  const immediatelyAvailable = locale === "en" || retained !== undefined;
  const translatedText = retained ?? (locale === "en" ? input.sourceText : null);
  return {
    sourceEntityKind: input.entityKind,
    sourceContentKey: input.contentKey,
    sourceField: input.field,
    sourceLanguageTag: MERCHANT_PRICING_TRANSLATION_SOURCE_LANGUAGE_TAG,
    targetLanguageTag: locale,
    sourceText: input.sourceText,
    translatedText,
    status: immediatelyAvailable ? "AVAILABLE" : "PENDING",
    completedAt: immediatelyAvailable ? now : null,
  };
}

export function buildMerchantPricingTranslationItemSeeds(input: {
  source: MerchantPricingTranslationSourceSnapshot;
  previous?: MerchantPricingExistingTranslationState;
  now: Date;
}): MerchantPricingTranslationItemSeed[] {
  assertMerchantPricingLocaleRegistryMatchesShared();
  const previous = input.previous;
  const previousDescriptions = previous
    ? exactLocaleMap(previous.translations, "Existing Merchant Pricing plan translations")
    : null;
  const previousHighlights = new Map(
    (previous?.highlights ?? []).map((highlight) => [
      highlight.contentKey,
      {
        ...highlight,
        translationsByLocale: exactLocaleMap(
          highlight.translations,
          `Existing Merchant Pricing highlight ${highlight.contentKey} translations`,
        ),
      },
    ]),
  );

  const descriptionUnchanged =
    previous !== undefined &&
    normalized(previous.englishDescription) === input.source.englishDescription;
  const descriptionRetention = descriptionUnchanged
    ? new Map(
        MERCHANT_PRICING_LOCALES.map((locale) => [
          locale,
          retainedText(
            previousDescriptions!.get(locale)!.merchantDescription,
            `Existing Merchant Pricing ${locale} description`,
          ),
        ]),
      )
    : undefined;

  const sources: Array<{
    entityKind: "PLAN" | "HIGHLIGHT";
    contentKey: string | null;
    field: "TITLE" | "DESCRIPTION";
    sourceText: string;
    retainedByLocale?: Map<MerchantPricingLocale, string>;
  }> = [
    {
      entityKind: "PLAN",
      contentKey: null,
      field: "DESCRIPTION",
      sourceText: input.source.englishDescription,
      retainedByLocale: descriptionRetention,
    },
  ];

  for (const highlight of input.source.highlights) {
    const old = previousHighlights.get(highlight.contentKey);
    const titleUnchanged =
      old !== undefined && normalized(old.englishTitle) === highlight.title;
    const descriptionUnchangedForHighlight =
      old !== undefined &&
      normalized(old.englishDescription) === highlight.description;
    sources.push(
      {
        entityKind: "HIGHLIGHT",
        contentKey: highlight.contentKey,
        field: "TITLE",
        sourceText: highlight.title,
        retainedByLocale: titleUnchanged
          ? new Map(
              MERCHANT_PRICING_LOCALES.map((locale) => [
                locale,
                retainedText(
                  old!.translationsByLocale.get(locale)!.title,
                  `Existing Merchant Pricing highlight ${highlight.contentKey} ${locale} title`,
                ),
              ]),
            )
          : undefined,
      },
      {
        entityKind: "HIGHLIGHT",
        contentKey: highlight.contentKey,
        field: "DESCRIPTION",
        sourceText: highlight.description,
        retainedByLocale: descriptionUnchangedForHighlight
          ? new Map(
              MERCHANT_PRICING_LOCALES.map((locale) => [
                locale,
                retainedText(
                  old!.translationsByLocale.get(locale)!.description,
                  `Existing Merchant Pricing highlight ${highlight.contentKey} ${locale} description`,
                ),
              ]),
            )
          : undefined,
      },
    );
  }

  return MERCHANT_PRICING_LOCALES.flatMap((locale) =>
    sources.map((source) => seed(source, locale, input.now)),
  );
}

export function merchantPricingTranslationExpectedItemsPerLocale(
  source: MerchantPricingTranslationSourceSnapshot,
): number {
  return 1 + source.highlights.length * 2;
}
