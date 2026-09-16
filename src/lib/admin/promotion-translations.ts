import { TRANSLATION_WORKBOOK_LOCALES } from "./translation-workbook-common.ts";

export type PromotionTranslationIssue = {
  code: string;
  path: string;
  locale?: string;
  message: string;
};

export type PromotionTranslationValue = {
  merchantTitle: string;
  merchantDescription: string;
};

export type PromotionTranslationPackage = {
  _meta: {
    schemaVersion: 1;
    campaignId: string;
    campaignInternalName: string;
    sourceLocale: "en";
    sourceMerchantTitle: string;
    sourceMerchantDescription: string;
  };
  translations: Record<string, PromotionTranslationValue>;
};

export type PromotionTranslationExpected = {
  campaignId: string;
  campaignInternalName: string;
  sourceMerchantTitle: string;
  sourceMerchantDescription: string;
  translations?: Array<{
    locale: string;
    merchantTitle: string;
    merchantDescription: string;
  }>;
};

export type PromotionTranslationParseResult = {
  valid: boolean;
  completeCount: number;
  issues: PromotionTranslationIssue[];
  package?: PromotionTranslationPackage;
};

const ROOT_KEYS = ["_meta", "translations"] as const;
const META_KEYS = [
  "schemaVersion",
  "campaignId",
  "campaignInternalName",
  "sourceLocale",
  "sourceMerchantTitle",
  "sourceMerchantDescription",
] as const;
const LOCALE_KEYS = ["merchantTitle", "merchantDescription"] as const;

const normalize = (value: string) => value.trim();
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const hasExactKeys = (value: object, expected: readonly string[]) => {
  const actual = Object.keys(value);
  return (
    actual.length === expected.length &&
    expected.every((key) => actual.includes(key))
  );
};
const issue = (
  code: string,
  path: string,
  message: string,
  locale?: string,
): PromotionTranslationIssue => ({
  code,
  path,
  message,
  ...(locale ? { locale } : {}),
});

export function buildPromotionTranslationTemplate(
  expected: PromotionTranslationExpected,
): PromotionTranslationPackage {
  const previous = new Map(
    (expected.translations ?? []).map((value) => [value.locale, value]),
  );
  const translations: Record<string, PromotionTranslationValue> = {};
  for (const { locale } of TRANSLATION_WORKBOOK_LOCALES) {
    const stored = previous.get(locale);
    translations[locale] = {
      merchantTitle:
        locale === "en"
          ? normalize(expected.sourceMerchantTitle)
          : (stored?.merchantTitle ?? ""),
      merchantDescription:
        locale === "en"
          ? normalize(expected.sourceMerchantDescription)
          : (stored?.merchantDescription ?? ""),
    };
  }
  return {
    _meta: {
      schemaVersion: 1,
      campaignId: normalize(expected.campaignId),
      campaignInternalName: normalize(expected.campaignInternalName),
      sourceLocale: "en",
      sourceMerchantTitle: normalize(expected.sourceMerchantTitle),
      sourceMerchantDescription: normalize(expected.sourceMerchantDescription),
    },
    translations,
  };
}

export function parseCompletedPromotionTranslationPackage(
  rawJsonText: string,
  expected: PromotionTranslationExpected,
): PromotionTranslationParseResult {
  const issues: PromotionTranslationIssue[] = [];
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
        issue("INVALID_JSON", "$", "The package root must be an object."),
      ],
    };
  }
  if (!hasExactKeys(parsed, ROOT_KEYS))
    issues.push(
      issue(
        "INVALID_JSON",
        "$",
        "The package must contain exactly _meta and translations.",
      ),
    );
  const meta = parsed._meta;
  if (!isRecord(meta) || !hasExactKeys(meta, META_KEYS)) {
    issues.push(
      issue(
        "INVALID_JSON",
        "$._meta",
        "Metadata must contain exactly the required fields.",
      ),
    );
  } else {
    if (meta.schemaVersion !== 1)
      issues.push(
        issue(
          "UNSUPPORTED_SCHEMA_VERSION",
          "$._meta.schemaVersion",
          "schemaVersion must be 1.",
        ),
      );
    if (meta.campaignId !== normalize(expected.campaignId))
      issues.push(
        issue(
          "CAMPAIGN_ID_MISMATCH",
          "$._meta.campaignId",
          "Campaign id does not match the current draft.",
        ),
      );
    if (meta.campaignInternalName !== normalize(expected.campaignInternalName))
      issues.push(
        issue(
          "CAMPAIGN_NAME_MISMATCH",
          "$._meta.campaignInternalName",
          "Campaign name does not match the current draft.",
        ),
      );
    if (meta.sourceLocale !== "en")
      issues.push(
        issue(
          "INVALID_JSON",
          "$._meta.sourceLocale",
          "sourceLocale must be en.",
        ),
      );
    if (
      meta.sourceMerchantTitle !== normalize(expected.sourceMerchantTitle) ||
      meta.sourceMerchantDescription !==
        normalize(expected.sourceMerchantDescription)
    ) {
      issues.push(
        issue(
          "ENGLISH_SOURCE_MISMATCH",
          "$._meta",
          "English source content does not match the current draft.",
        ),
      );
    }
  }
  const translations = parsed.translations;
  const completeLocales = new Set<string>();
  if (!isRecord(translations)) {
    issues.push(
      issue(
        "INVALID_JSON",
        "$.translations",
        "translations must be an object.",
      ),
    );
  } else {
    for (const { locale } of TRANSLATION_WORKBOOK_LOCALES) {
      if (!(locale in translations))
        issues.push(
          issue(
            "MISSING_LOCALE",
            `$.translations.${locale}`,
            "Required locale is missing.",
            locale,
          ),
        );
    }
    for (const locale of Object.keys(translations)) {
      if (
        !TRANSLATION_WORKBOOK_LOCALES.some((entry) => entry.locale === locale)
      )
        issues.push(
          issue(
            "UNEXPECTED_LOCALE",
            `$.translations.${locale}`,
            "Locale is not supported.",
            locale,
          ),
        );
    }
    for (const { locale } of TRANSLATION_WORKBOOK_LOCALES) {
      const value = translations[locale];
      const before = issues.length;
      if (!isRecord(value) || !hasExactKeys(value, LOCALE_KEYS)) {
        issues.push(
          issue(
            "INVALID_JSON",
            `$.translations.${locale}`,
            "Locale must contain exactly merchantTitle and merchantDescription.",
            locale,
          ),
        );
        continue;
      }
      for (const key of LOCALE_KEYS) {
        const content = value[key];
        if (typeof content !== "string" || !normalize(content))
          issues.push(
            issue(
              key === "merchantTitle" ? "TITLE_EMPTY" : "DESCRIPTION_EMPTY",
              `$.translations.${locale}.${key}`,
              `${key} must not be empty.`,
              locale,
            ),
          );
        else if (
          normalize(content).length > (key === "merchantTitle" ? 255 : 10000)
        )
          issues.push(
            issue(
              key === "merchantTitle"
                ? "TITLE_TOO_LONG"
                : "DESCRIPTION_TOO_LONG",
              `$.translations.${locale}.${key}`,
              `${key} is too long.`,
              locale,
            ),
          );
      }
      if (
        locale === "en" &&
        (normalize(String(value.merchantTitle ?? "")) !==
          normalize(expected.sourceMerchantTitle) ||
          normalize(String(value.merchantDescription ?? "")) !==
            normalize(expected.sourceMerchantDescription))
      ) {
        issues.push(
          issue(
            "ENGLISH_SOURCE_MISMATCH",
            `$.translations.en`,
            "English source content does not match the current draft.",
            locale,
          ),
        );
      }
      if (issues.length === before) completeLocales.add(locale);
    }
  }
  if (issues.length)
    return { valid: false, completeCount: completeLocales.size, issues };
  return {
    valid: true,
    completeCount: completeLocales.size,
    issues: [],
    package: parsed as PromotionTranslationPackage,
  };
}
