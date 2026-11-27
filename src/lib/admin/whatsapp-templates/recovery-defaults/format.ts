import { recoveryFormat, type RecoveryDefaultFormat } from "./contracts";
import type { ApprovedSource } from "../publishing/source";
import { reject } from "../publishing/validation";

/** Use the verified frozen projection, never a request-supplied format. */
export function verifiedDefaultFormat(
  source: ApprovedSource,
): RecoveryDefaultFormat {
  const format = recoveryFormat(source.headerKind);
  for (const locale of source.locales) {
    if ((locale.view.headerFormat === "IMAGE" ? "IMAGE" : "TEXT") !== format) {
      return reject(
        "CONTENT",
        `The ${locale.languageTag} registration does not match the default format.`,
      );
    }
    // A fallback must work without any merchant branding record or derivative.
    // Ordinary shop-specific publishing retains its existing explicit eligibility rules.
    if (
      format === "TEXT" &&
      (locale.brandFields.length || locale.view.bindings?.headerMediaRole)
    ) {
      return reject(
        "NOT_READY",
        `The TEXT fallback for ${locale.languageTag} must not require shopBrand variables or image media. Use shop.name instead.`,
      );
    }
  }
  return format;
}
