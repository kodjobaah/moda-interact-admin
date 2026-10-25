import { MODA_SUPPORTED_LANGUAGE_TAGS } from "@modainteract/moda-interact-shared/internationalization";

export function targetTranslationLanguages(tags: readonly string[] = MODA_SUPPORTED_LANGUAGE_TAGS): string[] {
  if (tags.length !== 20 || new Set(tags).size !== 20 || !tags.includes("en") ||
      tags.some((tag) => !/^[a-z]{2}(?:-[A-Za-z]{2,4})?$/.test(tag))) {
    throw new Error("The supported-language registry must contain English and nineteen unique target languages.");
  }
  return tags.filter((tag) => tag !== "en");
}
