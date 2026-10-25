import { MERCHANT_PRICING_LOCALES } from "@/lib/admin/merchant-pricing-locales";

/** Explicit Moda BCP-47 -> Meta WhatsApp template language codes. Never guess a provider code. */
const META_CODES: Record<(typeof MERCHANT_PRICING_LOCALES)[number], string> = {
  "zh-Hans": "zh_CN", "zh-Hant": "zh_TW", cs: "cs", da: "da", nl: "nl", en: "en",
  fi: "fi", fr: "fr", de: "de", it: "it", ja: "ja", ko: "ko", nb: "nb",
  pl: "pl", "pt-BR": "pt_BR", "pt-PT": "pt_PT", es: "es", sv: "sv", th: "th", tr: "tr",
};
// Reuse Admin's existing 20-locale catalogue; no extra Shared export/version dependency.
export const REVIEW_LANGUAGES: readonly string[] = MERCHANT_PRICING_LOCALES;
export function providerLanguageCode(tag: string, family: "META_RECOVERY" | "MODA_CONVERSATION_WRAPPER"): string | null {
  if (!Object.hasOwn(META_CODES, tag)) throw new Error(`Unsupported Moda language: ${tag.slice(0, 25)}.`);
  return family === "META_RECOVERY" ? META_CODES[tag as keyof typeof META_CODES] : null;
}
