import {
  MERCHANT_PRICING_LOCALES,
  type MerchantPricingLocale,
} from "../merchant-pricing-locales.ts";

export type MerchantPricingTranslationIssue = {
  code: string;
  path: string;
  locale?: string;
  message: string;
};
export type MerchantPricingTranslationHighlight = {
  title: string;
  description: string;
};
export type MerchantPricingTranslationHighlightSource = {
  contentKey: string;
  title: string;
  description: string;
};
export type MerchantPricingStoredTranslation = {
  locale: string;
  merchantDescription: string;
  highlights: MerchantPricingTranslationHighlightSource[];
};
export type MerchantPricingTranslationPackage = {
  _meta: {
    schemaVersion: 2;
    planHandle: string;
    planName: string;
    sourceLocale: "en";
  };
  translations: Record<
    MerchantPricingLocale,
    {
      description: string;
      highlights: Record<string, MerchantPricingTranslationHighlight>;
    }
  >;
};
export type MerchantPricingTranslationParseResult = {
  valid: boolean;
  completeCount: number;
  issues: MerchantPricingTranslationIssue[];
  package?: MerchantPricingTranslationPackage;
};
export type MerchantPricingTranslationExpected = {
  planHandle: string;
  planName: string;
  englishDescription: string;
  highlights?: MerchantPricingTranslationHighlightSource[];
};
type TemplateOptions = MerchantPricingTranslationExpected & {
  previous?: {
    englishDescription: string;
    highlights: MerchantPricingTranslationHighlightSource[];
    translations: MerchantPricingStoredTranslation[];
  };
};

const ROOT_KEYS = ["_meta", "translations"] as const;
const META_KEYS = [
  "schemaVersion",
  "planHandle",
  "planName",
  "sourceLocale",
] as const;
const LOCALE_KEYS = ["description", "highlights"] as const;
const normalized = (value: string) => value.trim();
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const keys = (value: object) => Object.keys(value);
const hasExactKeys = (value: object, expected: readonly string[]) =>
  keys(value).length === expected.length &&
  expected.every((key) => keys(value).includes(key));
const makeIssue = (
  code: string,
  path: string,
  message: string,
  locale?: string,
): MerchantPricingTranslationIssue => ({
  code,
  path,
  ...(locale ? { locale } : {}),
  message,
});

export function buildMerchantPricingTranslationTemplate({
  planHandle,
  planName,
  englishDescription,
  highlights,
  previous,
}: TemplateOptions): MerchantPricingTranslationPackage {
  highlights ??= [];
  const previousByLocale = new Map(
    (previous?.translations ?? []).map((translation) => [
      translation.locale,
      translation,
    ]),
  );
  const previousSources = new Map(
    (previous?.highlights ?? []).map((highlight) => [
      highlight.contentKey,
      highlight,
    ]),
  );
  const descriptionUnchanged =
    previous !== undefined &&
    normalized(previous.englishDescription) === normalized(englishDescription);
  const translations = {} as MerchantPricingTranslationPackage["translations"];
  for (const locale of MERCHANT_PRICING_LOCALES) {
    const stored = previousByLocale.get(locale);
    translations[locale] = {
      description:
        descriptionUnchanged && stored
          ? stored.merchantDescription
          : locale === "en"
            ? normalized(englishDescription)
            : "",
      highlights: Object.fromEntries(
        highlights.map((highlight) => {
          const oldSource = previousSources.get(highlight.contentKey);
          const unchanged =
            oldSource !== undefined &&
            normalized(oldSource.title) === normalized(highlight.title) &&
            normalized(oldSource.description) ===
              normalized(highlight.description);
          const oldValue = stored?.highlights.find(
            (candidate) => candidate.contentKey === highlight.contentKey,
          );
          return [
            highlight.contentKey,
            unchanged && oldValue
              ? { title: oldValue.title, description: oldValue.description }
              : {
                  title: locale === "en" ? normalized(highlight.title) : "",
                  description:
                    locale === "en" ? normalized(highlight.description) : "",
                },
          ];
        }),
      ),
    };
  }
  return {
    _meta: {
      schemaVersion: 2,
      planHandle: normalized(planHandle),
      planName: normalized(planName),
      sourceLocale: "en",
    },
    translations,
  };
}

export function parseCompletedMerchantPricingTranslationPackage(
  rawJsonText: string,
  expected: MerchantPricingTranslationExpected,
): MerchantPricingTranslationParseResult {
  const expectedHighlights = expected.highlights ?? [];
  const issues: MerchantPricingTranslationIssue[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJsonText);
  } catch {
    return {
      valid: false,
      completeCount: 0,
      issues: [
        makeIssue(
          "INVALID_JSON",
          "$",
          "The translation package is not valid JSON.",
        ),
      ],
    };
  }
  if (!isRecord(parsed))
    return {
      valid: false,
      completeCount: 0,
      issues: [
        makeIssue(
          "INVALID_JSON",
          "$",
          "The translation package root must be an object.",
        ),
      ],
    };
  if (!hasExactKeys(parsed, ROOT_KEYS))
    issues.push(
      makeIssue(
        "INVALID_JSON",
        "$",
        "The package must contain exactly _meta and translations.",
      ),
    );
  const meta = parsed._meta;
  if (!isRecord(meta) || !hasExactKeys(meta, META_KEYS))
    issues.push(
      makeIssue(
        "INVALID_JSON",
        "$._meta",
        "Metadata must contain exactly the required fields.",
      ),
    );
  else {
    if (meta.schemaVersion !== 2)
      issues.push(
        makeIssue(
          "UNSUPPORTED_SCHEMA_VERSION",
          "$._meta.schemaVersion",
          "schemaVersion must be 2.",
        ),
      );

    if (meta.sourceLocale !== "en")
      issues.push(
        makeIssue(
          "INVALID_JSON",
          "$._meta.sourceLocale",
          "sourceLocale must be en.",
        ),
      );
  }
  const translations = parsed.translations;
  const expectedKeys = new Set(
    expectedHighlights.map((highlight) => highlight.contentKey),
  );
  const completeLocales = new Set<string>();
  if (!isRecord(translations))
    issues.push(
      makeIssue(
        "INVALID_JSON",
        "$.translations",
        "translations must be an object.",
      ),
    );
  else {
    for (const locale of MERCHANT_PRICING_LOCALES)
      if (!(locale in translations))
        issues.push(
          makeIssue(
            "MISSING_LOCALE",
            `$.translations.${locale}`,
            "Required locale is missing.",
            locale,
          ),
        );
    for (const locale of keys(translations))
      if (!MERCHANT_PRICING_LOCALES.includes(locale as MerchantPricingLocale))
        issues.push(
          makeIssue(
            "UNEXPECTED_LOCALE",
            `$.translations.${locale}`,
            "Locale is not supported.",
            locale,
          ),
        );
    for (const locale of MERCHANT_PRICING_LOCALES) {
      const value = translations[locale];
      const before = issues.length;
      if (!isRecord(value) || !hasExactKeys(value, LOCALE_KEYS)) {
        issues.push(
          makeIssue(
            "INVALID_JSON",
            `$.translations.${locale}`,
            "Locale must contain exactly description and highlights.",
            locale,
          ),
        );
        continue;
      }
      const description = value.description;
      if (typeof description !== "string" || !normalized(description))
        issues.push(
          makeIssue(
            "DESCRIPTION_EMPTY",
            `$.translations.${locale}.description`,
            "Description must not be empty.",
            locale,
          ),
        );
      else if (normalized(description).length > 2000)
        issues.push(
          makeIssue(
            "DESCRIPTION_TOO_LONG",
            `$.translations.${locale}.description`,
            "Description must be at most 2000 characters.",
            locale,
          ),
        );
      if (
        locale === "en" &&
        normalized(String(description ?? "")) !==
          normalized(expected.englishDescription)
      )
        issues.push(
          makeIssue(
            "ENGLISH_SOURCE_MISMATCH",
            `$.translations.en.description`,
            "English description does not match the current draft.",
            locale,
          ),
        );
      const highlightValues = value.highlights;
      if (!isRecord(highlightValues)) {
        issues.push(
          makeIssue(
            "INVALID_JSON",
            `$.translations.${locale}.highlights`,
            "highlights must be an object.",
            locale,
          ),
        );
        continue;
      }
      for (const contentKey of expectedKeys)
        if (!(contentKey in highlightValues))
          issues.push(
            makeIssue(
              "MISSING_HIGHLIGHT",
              `$.translations.${locale}.highlights.${contentKey}`,
              "Highlight translation is missing.",
              locale,
            ),
          );
      for (const contentKey of keys(highlightValues))
        if (!expectedKeys.has(contentKey))
          issues.push(
            makeIssue(
              "UNEXPECTED_HIGHLIGHT",
              `$.translations.${locale}.highlights.${contentKey}`,
              "Highlight is not in the current draft.",
              locale,
            ),
          );
      for (const source of expectedHighlights) {
        const candidate = highlightValues[source.contentKey];
        if (
          !isRecord(candidate) ||
          !hasExactKeys(candidate, ["title", "description"])
        ) {
          issues.push(
            makeIssue(
              "INVALID_JSON",
              `$.translations.${locale}.highlights.${source.contentKey}`,
              "Highlight must contain exactly title and description.",
              locale,
            ),
          );
          continue;
        }
        const title = candidate.title;
        const descriptionValue = candidate.description;
        if (typeof title !== "string" || !normalized(title))
          issues.push(
            makeIssue(
              "HIGHLIGHT_TITLE_EMPTY",
              `$.translations.${locale}.highlights.${source.contentKey}.title`,
              "Highlight title must not be empty.",
              locale,
            ),
          );
        else if (normalized(title).length > 120)
          issues.push(
            makeIssue(
              "HIGHLIGHT_TITLE_TOO_LONG",
              `$.translations.${locale}.highlights.${source.contentKey}.title`,
              "Highlight title must be at most 120 characters.",
              locale,
            ),
          );
        if (
          typeof descriptionValue !== "string" ||
          !normalized(descriptionValue)
        )
          issues.push(
            makeIssue(
              "HIGHLIGHT_DESCRIPTION_EMPTY",
              `$.translations.${locale}.highlights.${source.contentKey}.description`,
              "Highlight description must not be empty.",
              locale,
            ),
          );
        else if (normalized(descriptionValue).length > 500)
          issues.push(
            makeIssue(
              "HIGHLIGHT_DESCRIPTION_TOO_LONG",
              `$.translations.${locale}.highlights.${source.contentKey}.description`,
              "Highlight description must be at most 500 characters.",
              locale,
            ),
          );
        if (
          locale === "en" &&
          (normalized(String(title ?? "")) !== normalized(source.title) ||
            normalized(String(descriptionValue ?? "")) !==
              normalized(source.description))
        )
          issues.push(
            makeIssue(
              "HIGHLIGHT_ENGLISH_SOURCE_MISMATCH",
              `$.translations.en.highlights.${source.contentKey}`,
              "English highlight content does not match the current draft.",
              locale,
            ),
          );
      }
      if (issues.length === before) completeLocales.add(locale);
    }
  }
  if (issues.length)
    return { valid: false, completeCount: completeLocales.size, issues };
  const parsedPackage = parsed as MerchantPricingTranslationPackage;

  return {
    valid: true,
    completeCount: completeLocales.size,
    issues: [],
    package: {
      ...parsedPackage,
      _meta: {
        ...parsedPackage._meta,
        planHandle: normalized(expected.planHandle),
        planName: normalized(expected.planName),
      },
    },
  };
}
