export const MAX_PORTFOLIO_ECONOMICS_CREDITS = 100_000;
export const MAX_METER_CANDIDATE_QUANTITY = 100_000;

export type MerchantPricingStatus = "PASS" | "FAIL" | "UNVERIFIED";

export type MerchantPricingResultCode =
  | "PORTFOLIO_ECONOMICS_OK"
  | "NO_TOPUPS_AVAILABLE"
  | "TOPUPS_CHEAPER_THAN_UPGRADE"
  | "UPGRADE_ADVANTAGE_TOO_SMALL"
  | "MISSING_PLAN_PRICE"
  | "CURRENCY_MISMATCH"
  | "INVALID_PORTFOLIO_ORDER"
  | "NON_INCREASING_ALLOWANCE"
  | "INVALID_USAGE_EVENT"
  | "INVALID_USAGE_PRICING"
  | "UNBOUNDED_ZERO_COST_USAGE_EVENT"
  | "ECONOMICS_SEARCH_LIMIT_EXCEEDED";

export type MerchantUsagePricing =
  | { mode: "FIXED"; currency: string; unitAmountMinor: number }
  | {
      mode: "GRADUATED" | "VOLUME";
      currency: string;
      tiers: Array<{
        upTo: number | null;
        amountPerUnitMinor: number;
        flatAmountMinor: number;
      }>;
    };

export type MerchantPricingUsageOffer = {
  eventHandle: string;
  creditsGrantedPerUnit: number;
  maximumUnitsPerBillingPeriod: number | null;
  pricing: MerchantUsagePricing;
};

export type MerchantPricingEconomicsPlan = {
  id: string;
  shopifyPlanHandle: string;
  name: string;
  includedRecoveryCredits: number;
  recurringAmountMinor: number;
  currency: string;
  usageEvents: MerchantPricingUsageOffer[];
};

export type MerchantPricingCombinationRow = {
  eventHandle: string;
  quantity: number;
  creditsGranted: number;
  costMinor: number;
};

export type MerchantPricingCombinationResult = {
  status: MerchantPricingStatus;
  code: MerchantPricingResultCode;
  message: string;
  totalCostMinor: number;
  actualCreditsGranted: number;
  totalUnits: number;
  summary: MerchantPricingCombinationRow[];
};

export type MerchantPricingPairResult = MerchantPricingCombinationResult & {
  lowerPlanId: string;
  higherPlanId: string;
  additionalCreditsNeeded: number;
  premiumBps?: number;
  requiredMinimumMinor?: number;
  upgradeCostMinor?: number;
  stayAndTopUpCostMinor?: number;
};

export type MerchantPricingPortfolioInput = {
  orderedPlanIds: string[];
  plansById: Record<string, MerchantPricingEconomicsPlan>;
  minimumUpgradePremiumBps?: number;
};

const DEFAULT_MINIMUM_PREMIUM_BPS = 2_000;
const CURRENCY = /^[A-Z]{3}$/;

function result(
  status: MerchantPricingStatus,
  code: MerchantPricingResultCode,
  message: string,
  overrides: Partial<MerchantPricingCombinationResult> = {},
): MerchantPricingCombinationResult {
  return {
    status,
    code,
    message,
    totalCostMinor: 0,
    actualCreditsGranted: 0,
    totalUnits: 0,
    summary: [],
    ...overrides,
  };
}

function isNonNegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function isCurrency(value: string): boolean {
  return CURRENCY.test(value);
}

function validatePricing(pricing: MerchantUsagePricing): MerchantPricingResultCode | null {
  if (!isCurrency(pricing.currency)) return "INVALID_USAGE_PRICING";

  if (pricing.mode === "FIXED") {
    return isNonNegativeSafeInteger(pricing.unitAmountMinor)
      ? null
      : "INVALID_USAGE_PRICING";
  }

  if (pricing.tiers.length < 1 || pricing.tiers.length > 6) {
    return "INVALID_USAGE_PRICING";
  }

  let previous = 0;
  for (const [index, tier] of pricing.tiers.entries()) {
    if (
      !isNonNegativeSafeInteger(tier.amountPerUnitMinor) ||
      !isNonNegativeSafeInteger(tier.flatAmountMinor)
    ) {
      return "INVALID_USAGE_PRICING";
    }
    if (tier.upTo !== null) {
      if (!isPositiveSafeInteger(tier.upTo) || tier.upTo <= previous) {
        return "INVALID_USAGE_PRICING";
      }
      previous = tier.upTo;
    } else if (index !== pricing.tiers.length - 1) {
      return "INVALID_USAGE_PRICING";
    }
  }

  return pricing.tiers[pricing.tiers.length - 1].upTo === null
    ? null
    : "INVALID_USAGE_PRICING";
}

function validateOffer(
  offer: MerchantPricingUsageOffer,
): MerchantPricingResultCode | null {
  if (
    !offer.eventHandle ||
    offer.eventHandle !== offer.eventHandle.trim() ||
    !isPositiveSafeInteger(offer.creditsGrantedPerUnit) ||
    (offer.maximumUnitsPerBillingPeriod !== null &&
      !isPositiveSafeInteger(offer.maximumUnitsPerBillingPeriod))
  ) {
    return "INVALID_USAGE_EVENT";
  }
  return validatePricing(offer.pricing);
}

function validateOffers(
  offers: MerchantPricingUsageOffer[],
): MerchantPricingResultCode | null {
  if (offers.length > 5) return "INVALID_USAGE_EVENT";
  const handles = new Set<string>();
  for (const offer of offers) {
    const code = validateOffer(offer);
    if (code) return code;
    const handle = offer.eventHandle;
    if (handles.has(handle)) return "INVALID_USAGE_EVENT";
    handles.add(handle);
    if (
      offer.maximumUnitsPerBillingPeriod === null &&
      isUnboundedZeroCostPricing(offer.pricing)
    ) {
      return "UNBOUNDED_ZERO_COST_USAGE_EVENT";
    }
  }
  return null;
}

function validatePlanEvidence(
  plan: MerchantPricingEconomicsPlan,
): MerchantPricingResultCode | null {
  if (!isNonNegativeSafeInteger(plan.recurringAmountMinor)) return "MISSING_PLAN_PRICE";
  if (!isNonNegativeSafeInteger(plan.includedRecoveryCredits)) return "INVALID_USAGE_EVENT";
  if (!isCurrency(plan.currency)) return "CURRENCY_MISMATCH";

  const validationCode = validateOffers(plan.usageEvents);
  if (validationCode) return validationCode;
  if (plan.usageEvents.some((offer) => offer.pricing.currency !== plan.currency)) {
    return "CURRENCY_MISMATCH";
  }
  return null;
}

function isUnboundedZeroCostPricing(pricing: MerchantUsagePricing): boolean {
  if (pricing.mode === "FIXED") return pricing.unitAmountMinor === 0;
  if (pricing.mode === "VOLUME") {
    const finalTier = pricing.tiers[pricing.tiers.length - 1];
    return finalTier.upTo === null && finalTier.amountPerUnitMinor === 0 && finalTier.flatAmountMinor === 0;
  }
  return pricing.tiers.every(
    (tier) => tier.amountPerUnitMinor === 0 && tier.flatAmountMinor === 0,
  );
}

function calculateCost(pricing: MerchantUsagePricing, quantity: number): number | null {
  if (!isNonNegativeSafeInteger(quantity)) return null;
  if (quantity === 0) return 0;

  if (pricing.mode === "FIXED") {
    const cost = pricing.unitAmountMinor * quantity;
    return Number.isSafeInteger(cost) ? cost : null;
  }

  if (pricing.mode === "VOLUME") {
    const tier = pricing.tiers.find(
      (candidate) => candidate.upTo === null || quantity <= candidate.upTo,
    );
    if (!tier) return null;
    const cost = tier.flatAmountMinor + tier.amountPerUnitMinor * quantity;
    return Number.isSafeInteger(cost) ? cost : null;
  }

  let cost = 0;
  let previousUpper = 0;
  let remaining = quantity;
  for (const tier of pricing.tiers) {
    if (remaining === 0) break;
    const capacity = tier.upTo === null ? remaining : tier.upTo - previousUpper;
    const units = Math.min(remaining, capacity);
    cost += tier.flatAmountMinor + tier.amountPerUnitMinor * units;
    if (!Number.isSafeInteger(cost)) return null;
    remaining -= units;
    if (tier.upTo !== null) previousUpper = tier.upTo;
  }
  return remaining === 0 ? cost : null;
}

function candidateQuantities(
  offer: MerchantPricingUsageOffer,
  creditsNeeded: number,
): number[] | MerchantPricingResultCode {
  const soloUnits = Math.ceil(creditsNeeded / offer.creditsGrantedPerUnit);
  const maximum = offer.maximumUnitsPerBillingPeriod;
  const boundedSolo = Math.min(soloUnits, maximum ?? soloUnits);
  if (boundedSolo > MAX_METER_CANDIDATE_QUANTITY) {
    return "ECONOMICS_SEARCH_LIMIT_EXCEEDED";
  }

  const values = new Set<number>([0]);
  for (let quantity = 1; quantity <= boundedSolo; quantity += 1) {
    values.add(quantity);
  }

  if (offer.pricing.mode === "VOLUME") {
    for (const tier of offer.pricing.tiers) {
      if (tier.upTo !== null && tier.upTo + 1 > soloUnits) {
        const laterTierEntry = tier.upTo + 1;
        if (maximum !== null && laterTierEntry > maximum) break;
        if (laterTierEntry > MAX_METER_CANDIDATE_QUANTITY) {
          return "ECONOMICS_SEARCH_LIMIT_EXCEEDED";
        }
        values.add(laterTierEntry);
      }
    }
    if (maximum !== null) {
      if (maximum > MAX_METER_CANDIDATE_QUANTITY) {
        return "ECONOMICS_SEARCH_LIMIT_EXCEEDED";
      }
      values.add(maximum);
    }
  }

  return [...values].sort((left, right) => left - right);
}

type CombinationPath = {
  totalCostMinor: number;
  actualCreditsGranted: number;
  totalUnits: number;
  summary: MerchantPricingCombinationRow[];
};

function summaryKey(summary: MerchantPricingCombinationRow[]): string {
  return summary.map((row) => `${row.eventHandle}:${row.quantity}`).join(",");
}

function compareEventHandles(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function isBetterPath(candidate: CombinationPath, existing: CombinationPath): boolean {
  if (candidate.totalCostMinor !== existing.totalCostMinor) {
    return candidate.totalCostMinor < existing.totalCostMinor;
  }
  if (candidate.totalUnits !== existing.totalUnits) {
    return candidate.totalUnits < existing.totalUnits;
  }
  const candidateOvershoot = candidate.actualCreditsGranted;
  const existingOvershoot = existing.actualCreditsGranted;
  if (candidateOvershoot !== existingOvershoot) {
    return candidateOvershoot < existingOvershoot;
  }
  return compareEventHandles(summaryKey(candidate.summary), summaryKey(existing.summary)) < 0;
}

export function findCheapestMerchantUsageCombination(
  usageEvents: MerchantPricingUsageOffer[],
  creditsNeeded: number,
): MerchantPricingCombinationResult {
  if (!isPositiveSafeInteger(creditsNeeded)) {
    if (creditsNeeded === 0) {
      return result("PASS", "NO_TOPUPS_AVAILABLE", "No top-ups are required.");
    }
    return result("UNVERIFIED", "INVALID_USAGE_EVENT", "Credits needed must be a positive safe integer.");
  }
  if (creditsNeeded > MAX_PORTFOLIO_ECONOMICS_CREDITS) {
    return result("UNVERIFIED", "ECONOMICS_SEARCH_LIMIT_EXCEEDED", "The economics search target exceeds the bounded limit.");
  }

  const validationCode = validateOffers(usageEvents);
  if (validationCode) {
    return result("UNVERIFIED", validationCode, "Usage pricing evidence is not valid for deterministic economics.");
  }

  const sortedOffers = [...usageEvents].sort((left, right) => compareEventHandles(left.eventHandle, right.eventHandle));
  const states = new Map<number, CombinationPath>([
    [0, { totalCostMinor: 0, actualCreditsGranted: 0, totalUnits: 0, summary: [] }],
  ]);

  for (const offer of sortedOffers) {
    const quantities = candidateQuantities(offer, creditsNeeded);
    if (!Array.isArray(quantities)) {
      return result("UNVERIFIED", quantities, "The economics search exceeds its bounded candidate limit.");
    }
    const nextStates = new Map(states);
    for (const path of states.values()) {
      for (const quantity of quantities) {
        const costMinor = calculateCost(offer.pricing, quantity);
        const creditsGranted = offer.creditsGrantedPerUnit * quantity;
        if (costMinor === null || !Number.isSafeInteger(creditsGranted)) {
          return result("UNVERIFIED", "ECONOMICS_SEARCH_LIMIT_EXCEEDED", "The economics calculation exceeds safe integer bounds.");
        }
        const summary = quantity === 0
          ? path.summary
          : [...path.summary, {
              eventHandle: offer.eventHandle,
              quantity,
              creditsGranted,
              costMinor,
            }];
        const candidate: CombinationPath = {
          totalCostMinor: path.totalCostMinor + costMinor,
          actualCreditsGranted: path.actualCreditsGranted + creditsGranted,
          totalUnits: path.totalUnits + quantity,
          summary,
        };
        if (!Number.isSafeInteger(candidate.totalCostMinor) || !Number.isSafeInteger(candidate.actualCreditsGranted)) {
          return result("UNVERIFIED", "ECONOMICS_SEARCH_LIMIT_EXCEEDED", "The economics calculation exceeds safe integer bounds.");
        }
        const stateKey = Math.min(creditsNeeded, candidate.actualCreditsGranted);
        const existing = nextStates.get(stateKey);
        if (!existing || isBetterPath(candidate, existing)) nextStates.set(stateKey, candidate);
      }
    }
    states.clear();
    for (const [key, value] of nextStates) states.set(key, value);
  }

  const best = states.get(creditsNeeded);
  if (!best) {
    return result("UNVERIFIED", "INVALID_USAGE_PRICING", "No bounded usage pricing combination can meet the requested credits.");
  }
  return result("PASS", "PORTFOLIO_ECONOMICS_OK", "A deterministic usage pricing combination satisfies the requested credits.", best);
}

function invalidPair(
  lowerPlanId: string,
  higherPlanId: string,
  additionalCreditsNeeded: number,
  code: MerchantPricingResultCode,
  message: string,
): MerchantPricingPairResult {
  return {
    ...result("UNVERIFIED", code, message),
    lowerPlanId,
    higherPlanId,
    additionalCreditsNeeded,
  };
}

export function evaluateMerchantPricingPair(
  lowerPlan: MerchantPricingEconomicsPlan,
  higherPlan: MerchantPricingEconomicsPlan,
  minimumUpgradePremiumBps = DEFAULT_MINIMUM_PREMIUM_BPS,
): MerchantPricingPairResult {
  const additionalCreditsNeeded = higherPlan.includedRecoveryCredits - lowerPlan.includedRecoveryCredits;
  const base = { lowerPlanId: lowerPlan.id, higherPlanId: higherPlan.id, additionalCreditsNeeded };
  if (lowerPlan.id === higherPlan.id) return invalidPair(lowerPlan.id, higherPlan.id, additionalCreditsNeeded, "INVALID_PORTFOLIO_ORDER", "Upgrade plans must have different identities.");
  if (!isNonNegativeSafeInteger(lowerPlan.recurringAmountMinor) || !isNonNegativeSafeInteger(higherPlan.recurringAmountMinor)) return invalidPair(lowerPlan.id, higherPlan.id, additionalCreditsNeeded, "MISSING_PLAN_PRICE", "Recurring plan pricing evidence is missing or invalid.");
  if (!isNonNegativeSafeInteger(lowerPlan.includedRecoveryCredits) || !isNonNegativeSafeInteger(higherPlan.includedRecoveryCredits)) return invalidPair(lowerPlan.id, higherPlan.id, additionalCreditsNeeded, "INVALID_USAGE_EVENT", "Included recovery credits must be non-negative safe integers.");
  if (!isCurrency(lowerPlan.currency) || !isCurrency(higherPlan.currency) || lowerPlan.currency !== higherPlan.currency) return invalidPair(lowerPlan.id, higherPlan.id, additionalCreditsNeeded, "CURRENCY_MISMATCH", "Plan currencies must be equal normalized ISO-style codes.");
  if (!isNonNegativeSafeInteger(minimumUpgradePremiumBps)) return invalidPair(lowerPlan.id, higherPlan.id, additionalCreditsNeeded, "INVALID_USAGE_EVENT", "The minimum upgrade premium is invalid.");
  if (!isPositiveSafeInteger(additionalCreditsNeeded)) return invalidPair(lowerPlan.id, higherPlan.id, additionalCreditsNeeded, "NON_INCREASING_ALLOWANCE", "The higher plan must provide more included recovery credits.");

  for (const [planToValidate, usageEvents] of [[lowerPlan, lowerPlan.usageEvents], [higherPlan, higherPlan.usageEvents]] as const) {
    const validationCode = validateOffers(usageEvents);
    if (validationCode) return invalidPair(lowerPlan.id, higherPlan.id, additionalCreditsNeeded, validationCode, "Usage pricing evidence is not valid for deterministic economics.");
    if (usageEvents.some((offer) => offer.pricing.currency !== planToValidate.currency)) {
      return invalidPair(lowerPlan.id, higherPlan.id, additionalCreditsNeeded, "CURRENCY_MISMATCH", "Usage pricing currency must match its plan currency.");
    }
  }

  if (lowerPlan.usageEvents.length === 0) {
    return { ...result("PASS", "NO_TOPUPS_AVAILABLE", "The lower plan has no usage top-up path."), ...base };
  }

  const combination = findCheapestMerchantUsageCombination(lowerPlan.usageEvents, additionalCreditsNeeded);
  if (combination.status !== "PASS") return { ...combination, ...base };

  const upgradeCostMinor = higherPlan.recurringAmountMinor;
  const stayAndTopUpCostMinor = lowerPlan.recurringAmountMinor + combination.totalCostMinor;
  if (!Number.isSafeInteger(stayAndTopUpCostMinor)) return invalidPair(lowerPlan.id, higherPlan.id, additionalCreditsNeeded, "ECONOMICS_SEARCH_LIMIT_EXCEEDED", "The upgrade comparison exceeds safe integer bounds.");
  const requiredMinimumMinor = Math.ceil(upgradeCostMinor * (10_000 + minimumUpgradePremiumBps) / 10_000);
  const premiumBps = upgradeCostMinor === 0 ? Number.POSITIVE_INFINITY : Math.round(((stayAndTopUpCostMinor - upgradeCostMinor) * 10_000) / upgradeCostMinor);
  const details = { ...base, totalCostMinor: combination.totalCostMinor, actualCreditsGranted: combination.actualCreditsGranted, totalUnits: combination.totalUnits, summary: combination.summary, upgradeCostMinor, stayAndTopUpCostMinor, requiredMinimumMinor, premiumBps };
  if (stayAndTopUpCostMinor <= upgradeCostMinor) return { ...details, status: "FAIL", code: "TOPUPS_CHEAPER_THAN_UPGRADE", message: "Top-ups are as cheap as or cheaper than the higher plan." };
  if (stayAndTopUpCostMinor < requiredMinimumMinor) return { ...details, status: "FAIL", code: "UPGRADE_ADVANTAGE_TOO_SMALL", message: "The upgrade premium is below the configured minimum." };
  return { ...details, status: "PASS", code: "PORTFOLIO_ECONOMICS_OK", message: "The higher plan retains the required economic advantage." };
}

export function evaluateMerchantPricingPortfolio({
  orderedPlanIds,
  plansById,
  minimumUpgradePremiumBps = DEFAULT_MINIMUM_PREMIUM_BPS,
}: MerchantPricingPortfolioInput): MerchantPricingPairResult[] {
  const ids = new Set(orderedPlanIds);
  if (ids.size !== orderedPlanIds.length || Object.keys(plansById).length !== orderedPlanIds.length || orderedPlanIds.some((id) => !plansById[id])) {
    return [invalidPair("", "", 0, "INVALID_PORTFOLIO_ORDER", "The supplied portfolio order does not resolve every plan exactly once.")];
  }
  for (const planId of orderedPlanIds) {
    const plan = plansById[planId];
    if (plan.id !== planId) {
      return [invalidPair(planId, plan.id, 0, "INVALID_PORTFOLIO_ORDER", "The portfolio map key must match the resolved plan identity.")];
    }
    const validationCode = validatePlanEvidence(plan);
    if (validationCode) {
      return [invalidPair(planId, planId, 0, validationCode, "Plan pricing evidence is not valid for deterministic economics.")];
    }
  }
  const results: MerchantPricingPairResult[] = [];
  for (let lowerIndex = 0; lowerIndex < orderedPlanIds.length - 1; lowerIndex += 1) {
    for (let higherIndex = lowerIndex + 1; higherIndex < orderedPlanIds.length; higherIndex += 1) {
      results.push(evaluateMerchantPricingPair(plansById[orderedPlanIds[lowerIndex]], plansById[orderedPlanIds[higherIndex]], minimumUpgradePremiumBps));
    }
  }
  return results;
}

export function assertMerchantPricingPortfolioPass(results: MerchantPricingPairResult[]): void {
  const failures = results.filter((entry) => entry.status !== "PASS");
  if (failures.length) {
    throw new Error(failures.map((entry) => `${entry.lowerPlanId}->${entry.higherPlanId}:${entry.code}`).join(", "));
  }
}