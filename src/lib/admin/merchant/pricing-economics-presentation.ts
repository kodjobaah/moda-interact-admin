import type {
  MerchantPricingEconomicsPlan,
  MerchantPricingPairResult,
} from "./pricing-economics";

export type MerchantPricingEconomicsPresentation = {
  title: string;
  description: string;
  guidance?: string;
};

type PresentationInput = {
  result: MerchantPricingPairResult;
  lowerPlan?: MerchantPricingEconomicsPlan;
  higherPlan?: MerchantPricingEconomicsPlan;
  minimumUpgradePremiumBps?: number;
};

function planName(
  plan: MerchantPricingEconomicsPlan | undefined,
  fallback: string,
): string {
  return plan?.name.trim() || fallback;
}

function formatMoney(
  minor: number | undefined,
  currency: string | undefined,
): string | null {
  if (
    minor === undefined ||
    !Number.isFinite(minor) ||
    !currency ||
    !/^[A-Z]{3}$/.test(currency)
  ) {
    return null;
  }

  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(minor / 100);
}

export function presentMerchantPricingEconomicsResult({
  result,
  lowerPlan,
  higherPlan,
  minimumUpgradePremiumBps,
}: PresentationInput): MerchantPricingEconomicsPresentation {
  const lowerName = planName(lowerPlan, "The lower plan");
  const higherName = planName(higherPlan, "The higher plan");

  switch (result.code) {
    case "NON_INCREASING_ALLOWANCE": {
      const lowerCredits = lowerPlan?.includedRecoveryCredits;
      const higherCredits = higherPlan?.includedRecoveryCredits;

      if (lowerCredits !== undefined && higherCredits !== undefined) {
        return {
          title: `${higherName} needs a larger included allowance`,
          description:
            `${higherName} includes ${higherCredits} recovery credits, ` +
            `while ${lowerName} includes ${lowerCredits}. ` +
            "A higher catalogue plan must include more recovery credits than the plan below it.",
          guidance:
            `Increase ${higherName} to at least ${lowerCredits + 1} recovery credits, ` +
            `or reduce ${lowerName}'s allowance.`,
        };
      }

      return {
        title: `${higherName} needs a larger included allowance`,
        description:
          "A higher catalogue plan must include more recovery credits than the plan below it.",
        guidance: `Increase ${higherName}'s included recovery credits.`,
      };
    }

    case "TOPUPS_CHEAPER_THAN_UPGRADE": {
      const stayAndTopUp = formatMoney(
        result.stayAndTopUpCostMinor,
        lowerPlan?.currency,
      );
      const upgrade = formatMoney(
        result.upgradeCostMinor,
        higherPlan?.currency,
      );

      return {
        title: `${higherName} is not cheaper than staying on ${lowerName}`,
        description:
          stayAndTopUp && upgrade
            ? `Staying on ${lowerName} and buying enough top-ups costs ${stayAndTopUp}, while ${higherName} costs ${upgrade}.`
            : `Staying on ${lowerName} and buying enough top-ups is as cheap as or cheaper than upgrading to ${higherName}.`,
        guidance:
          `Reduce ${higherName}'s recurring price, increase the cost of ${lowerName}'s top-ups, ` +
          "or adjust the included allowances so upgrading has a clear economic advantage.",
      };
    }

    case "UPGRADE_ADVANTAGE_TOO_SMALL": {
      const stayAndTopUp = formatMoney(
        result.stayAndTopUpCostMinor,
        lowerPlan?.currency,
      );
      const upgrade = formatMoney(
        result.upgradeCostMinor,
        higherPlan?.currency,
      );

      const minimumPercent =
        minimumUpgradePremiumBps === undefined
          ? null
          : minimumUpgradePremiumBps / 100;

      return {
        title: `${higherName}'s upgrade advantage is too small`,
        description:
          stayAndTopUp && upgrade
            ? `Staying on ${lowerName} and topping up costs ${stayAndTopUp}, while ${higherName} costs ${upgrade}.` +
              (minimumPercent !== null
                ? ` The configured policy requires stay + top-up to cost at least ${minimumPercent}% more than the higher plan.`
                : "")
            : `Upgrading to ${higherName} is cheaper, but not by enough to satisfy the configured portfolio policy.`,
        guidance:
          `Reduce ${higherName}'s recurring price, increase ${lowerName}'s top-up cost, ` +
          "or adjust the plan allowances.",
      };
    }

    case "UNBOUNDED_ZERO_COST_USAGE_EVENT":
      return {
        title: `${lowerName} has an unlimited free usage event`,
        description:
          "A usage event can grant recovery credits for free without any maximum number of uses.",
        guidance:
          "Set a price greater than zero or add a maximum number of uses per billing period.",
      };

    case "CURRENCY_MISMATCH":
      return {
        title: `${lowerName} and ${higherName} use incompatible currencies`,
        description:
          lowerPlan && higherPlan
            ? `${lowerName} uses ${lowerPlan.currency}, while ${higherName} uses ${higherPlan.currency}. Plans being compared must use the same currency.`
            : "The plans or their usage events do not use the same currency.",
        guidance:
          "Use the same currency for both plans and all of their usage-event pricing.",
      };

    case "MISSING_PLAN_PRICE":
      return {
        title: "A recurring plan price is missing or invalid",
        description:
          "The portfolio economics check cannot compare these plans without valid recurring pricing.",
        guidance: "Enter a valid non-negative recurring price for both plans.",
      };

    case "INVALID_USAGE_EVENT":
      return {
        title: "A usage event contains invalid values",
        description:
          "One of the plans contains usage-event data that cannot be used for the portfolio economics calculation.",
        guidance:
          "Check the usage-event handle, recovery credits, usage limit and pricing values.",
      };

    case "INVALID_USAGE_PRICING":
      return {
        title: "The top-up pricing cannot satisfy this comparison",
        description:
          `The configured usage pricing on ${lowerName} cannot produce a valid bounded top-up combination for the credits needed to reach ${higherName}.`,
        guidance:
          "Review the usage-event credit amounts, prices and maximum usage limits.",
      };

    case "ECONOMICS_SEARCH_LIMIT_EXCEEDED":
      return {
        title: "This pricing combination is too large to evaluate safely",
        description:
          "The portfolio economics calculation exceeded its supported numeric or search limits.",
        guidance:
          "Reduce unusually large credit quantities, usage limits or pricing values.",
      };

    case "INVALID_PORTFOLIO_ORDER":
      return {
        title: "The plan catalogue order is invalid",
        description:
          "The economics check found an invalid or duplicated plan relationship in the catalogue.",
        guidance:
          "Review the plan ordering and make sure each catalogue entry has a unique identity.",
      };

    case "NO_TOPUPS_AVAILABLE":
      return {
        title: `${higherName} has a clear upgrade path`,
        description: `${lowerName} has no usage top-up path that competes with upgrading.`,
      };

    case "PORTFOLIO_ECONOMICS_OK":
      return {
        title: `${higherName} has a valid upgrade advantage`,
        description: `The pricing relationship between ${lowerName} and ${higherName} satisfies the portfolio economics policy.`,
      };

    default:
      return {
        title: "The portfolio economics check needs attention",
        description: result.message,
      };
  }
}
