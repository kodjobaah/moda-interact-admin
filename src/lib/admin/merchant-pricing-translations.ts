import {
  MERCHANT_PRICING_LOCALES,
  type MerchantPricingLocale,
} from "./merchant-pricing-locales.ts";

export type MerchantPricingTranslationIssue = {
  code: string;
  path: string;
  locale?: string;
  message: string;
};

export type MerchantPricingTranslationPackage = {
  _meta: {
    schemaVersion: 1;
    planHandle: string;
    planName: string;
    sourceLocale: "en";
  };
  translations: Record<MerchantPricingLocale, { description: string }>;
};

export type MerchantPricingTranslationParseResult = {
  valid: boolean;
  completeCount: number;
  issues: MerchantPricingTranslationIssue[];
  package?: MerchantPricingTranslationPackage;
};

type ExpectedTranslation = {
  planHandle: string;
  planName: string;
  englishDescription: string;
};

const ROOT_KEYS = ["_meta", "translations"] as const;
const META_KEYS = [
  "schemaVersion",
  "planHandle",
  "planName",
  "sourceLocale",
] as const;
const LOCALE_KEYS = ["description"] as const;

function keys(value: object): string[] {
  return Object.keys(value);
}

function hasExactKeys(value: object, expected: readonly string[]): boolean {
  const actual = keys(value);
  return (
    actual.length === expected.length &&
    expected.every((key) => actual.includes(key))
  );
}

function issue(
  code: string,
  path: string,
  message: string,
  locale?: string,
): MerchantPricingTranslationIssue {
  return { code, path, ...(locale ? { locale } : {}), message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalized(value: string): string {
  return value.trim();
}

export function buildMerchantPricingTranslationTemplate({
  planHandle,
  planName,
  englishDescription,
}: ExpectedTranslation): MerchantPricingTranslationPackage {
  const translations = {} as Record<
    MerchantPricingLocale,
    { description: string }
  >;
  for (const locale of MERCHANT_PRICING_LOCALES) {
    translations[locale] = {
      description: locale === "en" ? normalized(englishDescription) : "",
    };
  }
  return {
    _meta: {
      schemaVersion: 1,
      planHandle: normalized(planHandle),
      planName: normalized(planName),
      sourceLocale: "en",
    },
    translations,
  };
}

export function parseCompletedMerchantPricingTranslationPackage(
  rawJsonText: string,
  expected: ExpectedTranslation,
): MerchantPricingTranslationParseResult {
  const issues: MerchantPricingTranslationIssue[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJsonText);
  } catch {
    return {
      valid: false,
      completeCount: 0,
      issues: [
        issue(
          "INVALID_JSON",
          "$",
          "The translation package is not valid JSON.",
        ),
      ],
    };
  }

  if (!isRecord(parsed)) {
    return {
      valid: false,
      completeCount: 0,
      issues: [
        issue(
          "INVALID_ROOT",
          "$",
          "The translation package root must be an object.",
        ),
      ],
    };
  }
  if (!hasExactKeys(parsed, ROOT_KEYS)) {
    for (const key of keys(parsed)) {
      if (!ROOT_KEYS.includes(key as (typeof ROOT_KEYS)[number])) {
        issues.push(
          issue("UNEXPECTED_ROOT_FIELD", `$.${key}`, "Unexpected root field."),
        );
      }
    }
    for (const key of ROOT_KEYS) {
      if (!(key in parsed))
        issues.push(
          issue("INVALID_ROOT", `$.${key}`, "Required root field is missing."),
        );
    }
  }

  const meta = parsed._meta;
  if (!isRecord(meta)) {
    issues.push(
      issue("INVALID_META", "$._meta", "The _meta field must be an object."),
    );
  } else {
    for (const key of keys(meta)) {
      if (!META_KEYS.includes(key as (typeof META_KEYS)[number])) {
        issues.push(
          issue("INVALID_META", `$._meta.${key}`, "Unexpected metadata field."),
        );
      }
    }
    if (!hasExactKeys(meta, META_KEYS)) {
      for (const key of META_KEYS) {
        if (!(key in meta))
          issues.push(
            issue(
              "INVALID_META",
              `$._meta.${key}`,
              "Required metadata field is missing.",
            ),
          );
      }
    }
    if (meta.schemaVersion !== 1)
      issues.push(
        issue(
          "UNSUPPORTED_SCHEMA_VERSION",
          "$._meta.schemaVersion",
          "schemaVersion must be 1.",
        ),
      );
    if (meta.planHandle !== normalized(expected.planHandle))
      issues.push(
        issue(
          "PLAN_HANDLE_MISMATCH",
          "$._meta.planHandle",
          "Plan handle does not match the current draft.",
        ),
      );
    if (meta.planName !== normalized(expected.planName))
      issues.push(
        issue(
          "PLAN_NAME_MISMATCH",
          "$._meta.planName",
          "Plan name does not match the current draft.",
        ),
      );
    if (meta.sourceLocale !== "en")
      issues.push(
        issue(
          "SOURCE_LOCALE_INVALID",
          "$._meta.sourceLocale",
          "sourceLocale must be en.",
        ),
      );
  }

  const translations = parsed.translations;
  const completeLocales = new Set<string>();
  if (!isRecord(translations)) {
    issues.push(
      issue(
        "INVALID_TRANSLATIONS_OBJECT",
        "$.translations",
        "translations must be an object.",
      ),
    );
  } else {
    for (const locale of MERCHANT_PRICING_LOCALES) {
      if (!(locale in translations)) {
        issues.push(
          issue(
            "MISSING_LOCALE",
            `$.translations.${locale}`,
            "Required locale is missing.",
            locale,
          ),
        );
      }
    }
    for (const locale of keys(translations)) {
      if (!MERCHANT_PRICING_LOCALES.includes(locale as MerchantPricingLocale)) {
        issues.push(
          issue(
            "UNEXPECTED_LOCALE",
            `$.translations.${locale}`,
            "Locale is not supported.",
            locale,
          ),
        );
      }
    }
    for (const locale of MERCHANT_PRICING_LOCALES) {
      const value = translations[locale];
      if (!isRecord(value)) {
        issues.push(
          issue(
            "INVALID_LOCALE_OBJECT",
            `$.translations.${locale}`,
            "Locale value must be an object.",
            locale,
          ),
        );
        continue;
      }
      if (!hasExactKeys(value, LOCALE_KEYS)) {
        for (const key of keys(value)) {
          if (!LOCALE_KEYS.includes(key as (typeof LOCALE_KEYS)[number])) {
            issues.push(
              issue(
                "UNEXPECTED_LOCALE_FIELD",
                `$.translations.${locale}.${key}`,
                "Unexpected locale field.",
                locale,
              ),
            );
          }
        }
      }
      const description = value.description;
      if (typeof description !== "string") {
        issues.push(
          issue(
            "DESCRIPTION_EMPTY",
            `$.translations.${locale}.description`,
            "Description must be a non-empty string.",
            locale,
          ),
        );
        continue;
      }
      const normalizedDescription = normalized(description);
      if (!normalizedDescription)
        issues.push(
          issue(
            "DESCRIPTION_EMPTY",
            `$.translations.${locale}.description`,
            "Description must not be empty.",
            locale,
          ),
        );
      if (normalizedDescription.length > 2000)
        issues.push(
          issue(
            "DESCRIPTION_TOO_LONG",
            `$.translations.${locale}.description`,
            "Description must be at most 2000 characters.",
            locale,
          ),
        );
      if (normalizedDescription) completeLocales.add(locale);
      if (
        locale === "en" &&
        normalizedDescription !== normalized(expected.englishDescription)
      ) {
        issues.push(
          issue(
            "ENGLISH_SOURCE_MISMATCH",
            `$.translations.${locale}.description`,
            "English description does not match the current draft.",
            locale,
          ),
        );
      }
    }
  }

  if (issues.length)
    return { valid: false, completeCount: completeLocales.size, issues };
  return {
    valid: true,
    completeCount: completeLocales.size,
    issues: [],
    package: parsed as MerchantPricingTranslationPackage,
  };
}
