import type { MerchantPricingPairResult } from "./pricing-economics";

export const OVERRIDEABLE_ECONOMICS_CODES = [
  "TOPUPS_CHEAPER_THAN_UPGRADE",
  "UPGRADE_ADVANTAGE_TOO_SMALL",
] as const;

const OVERRIDEABLE_ECONOMICS_CODE_SET = new Set<string>(
  OVERRIDEABLE_ECONOMICS_CODES,
);

export type MerchantPricingEconomicsOverrideAssessment = {
  kind: "PASS" | "OVERRIDEABLE" | "HARD_FAIL";
  failureCodes: string[];
};

export function assessMerchantPricingEconomicsOverride(
  results: MerchantPricingPairResult[],
  invalid: boolean,
): MerchantPricingEconomicsOverrideAssessment {
  const failures = results.filter((result) => result.status !== "PASS");

  const failureCodes = [
    ...new Set(failures.map((result) => result.code)),
  ].sort();

  if (invalid) {
    return {
      kind: "HARD_FAIL",
      failureCodes,
    };
  }

  if (failures.length === 0) {
    return {
      kind: "PASS",
      failureCodes: [],
    };
  }

  const allFailuresOverrideable = failureCodes.every((code) =>
    OVERRIDEABLE_ECONOMICS_CODE_SET.has(code),
  );

  if (allFailuresOverrideable) {
    return {
      kind: "OVERRIDEABLE",
      failureCodes,
    };
  }

  return {
    kind: "HARD_FAIL",
    failureCodes,
  };
}
