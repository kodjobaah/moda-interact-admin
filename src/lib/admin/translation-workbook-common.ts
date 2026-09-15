import {
  MERCHANT_PRICING_LOCALES,
  MERCHANT_PRICING_LOCALE_LABELS,
  type MerchantPricingLocale,
} from "./merchant-pricing-locales.ts";

export const TRANSLATION_WORKBOOK_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const TRANSLATION_WORKBOOK_MAX_BYTES = 2_097_152;

export type TranslationWorkbookLocale = {
  locale: MerchantPricingLocale;
  languageLabel: string;
};

export const TRANSLATION_WORKBOOK_LOCALES: readonly TranslationWorkbookLocale[] =
  MERCHANT_PRICING_LOCALES.map((locale) => ({
    locale,
    languageLabel: MERCHANT_PRICING_LOCALE_LABELS[locale],
  }));

export async function loadTranslationWorkbookExcelJS() {
  const module = await import("exceljs");
  return module.default ?? module;
}
