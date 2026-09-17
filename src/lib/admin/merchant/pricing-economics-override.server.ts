import { createHash } from "node:crypto";
import type { MerchantPricingEconomicsPlan } from "./pricing-economics";

type FingerprintInput = {
  orderedPlanIds: string[];
  plansById: Record<string, MerchantPricingEconomicsPlan>;
  minimumUpgradePremiumBps: number;
  failureCodes: string[];
};

function canonicalPlan(plan: MerchantPricingEconomicsPlan) {
  return {
    shopifyPlanHandle: plan.shopifyPlanHandle.trim(),
    includedRecoveryCredits: plan.includedRecoveryCredits,
    recurringAmountMinor: plan.recurringAmountMinor,
    currency: plan.currency.trim().toUpperCase(),

    usageEvents: plan.usageEvents.map((event) => ({
      eventHandle: event.eventHandle.trim(),
      creditsGrantedPerUnit: event.creditsGrantedPerUnit,
      maximumUnitsPerBillingPeriod:
        event.maximumUnitsPerBillingPeriod,

      pricing:
        event.pricing.mode === "FIXED"
          ? {
              mode: "FIXED" as const,
              currency: event.pricing.currency
                .trim()
                .toUpperCase(),
              unitAmountMinor: event.pricing.unitAmountMinor,
            }
          : {
              mode: event.pricing.mode,
              currency: event.pricing.currency
                .trim()
                .toUpperCase(),
              tiers: event.pricing.tiers.map((tier) => ({
                upTo: tier.upTo,
                amountPerUnitMinor: tier.amountPerUnitMinor,
                flatAmountMinor: tier.flatAmountMinor,
              })),
            },
    })),
  };
}

export function createMerchantPricingEconomicsOverrideFingerprint({
  orderedPlanIds,
  plansById,
  minimumUpgradePremiumBps,
  failureCodes,
}: FingerprintInput): string {
  const plans = orderedPlanIds.map((id) => {
    const plan = plansById[id];

    if (!plan) {
      throw new Error(
        `Cannot create economics override fingerprint: missing plan ${id}.`,
      );
    }

    return canonicalPlan(plan);
  });

  const document = {
    version: 1,
    minimumUpgradePremiumBps,
    failureCodes: [...new Set(failureCodes)].sort(),
    plans,
  };

  return createHash("sha256")
    .update(JSON.stringify(document))
    .digest("hex");
}
