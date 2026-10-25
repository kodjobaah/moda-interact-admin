import type { MODA_SUPPORTED_LANGUAGE_TAGS } from "@modainteract/moda-interact-shared/internationalization";
import { MetaSubmissionError } from "./contracts";

type SupportedLanguageTag = (typeof MODA_SUPPORTED_LANGUAGE_TAGS)[number];

// Only supported Meta template-language identities are allowed. These are not
// freely interchangeable with storefront BCP-47 locale identifiers.
const PROVIDER_LANGUAGE = {
  "zh-Hans": "zh_CN", "zh-Hant": "zh_TW", cs: "cs", da: "da", nl: "nl", en: "en",
  fi: "fi", fr: "fr", de: "de", it: "it", ja: "ja", ko: "ko", nb: "nb",
  pl: "pl", "pt-BR": "pt_BR", "pt-PT": "pt_PT", es: "es", sv: "sv", th: "th", tr: "tr",
} as const satisfies Record<SupportedLanguageTag, string>;

// The Meta-provider mapping defines the order. The Shared type guarantees
// exactly the platform's supported languages without importing its heavy ICU
// runtime into the standalone database/unit test process.
export const META_LANGUAGES = Object.freeze(Object.keys(PROVIDER_LANGUAGE)) as readonly SupportedLanguageTag[];

export function expectedProviderLanguageCode(tag: string): string {
  if (!Object.hasOwn(PROVIDER_LANGUAGE, tag)) {
    throw new MetaSubmissionError("UNSUPPORTED_LOCALE", `Unsupported Meta template language: ${tag.slice(0, 24)}.`);
  }
  return PROVIDER_LANGUAGE[tag as keyof typeof PROVIDER_LANGUAGE];
}
