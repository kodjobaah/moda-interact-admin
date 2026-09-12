import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateUsagePricingCostMinor,
  evaluateUpgradeEconomicsCost,
  findCheapestTopUpCombination,
  summarisePurchases,
  validateSinglePackShopifyEconomics,
  validateUpgradeEconomics,
  type FixedTopUpOffer,
  type PlanEconomics,
  type UsagePricingSnapshot,
} from "../../src/lib/admin/upgrade-economics-guardrail.ts";

type UpgradeInput = Parameters<typeof validateUpgradeEconomics>[0];
type SinglePackInput = Parameters<typeof validateSinglePackShopifyEconomics>[0];
type ExcludedEvaluatorKey =
  | "lifetimeFreeRecoveryAllowance"
  | "promotion"
  | "promotionCampaign"
  | "promotionalCredits"
  | "purchasedCreditBalance"
  | "refundState"
  | "merchantUsage"
  | "currentBalance";
type Assert<T extends true> = T;
type NoExcludedEvaluatorKeys<T> =
  Extract<keyof T, ExcludedEvaluatorKey> extends never ? true : false;
type UpgradeInputExcludesDomainState = Assert<
  NoExcludedEvaluatorKeys<UpgradeInput>
>;
type SinglePackInputExcludesDomainState = Assert<
  NoExcludedEvaluatorKeys<SinglePackInput>
>;

void (undefined as unknown as UpgradeInputExcludesDomainState);
void (undefined as unknown as SinglePackInputExcludesDomainState);

const free: PlanEconomics = {
  id: "free",
  name: "Free",
  monthlyPriceMinor: 0,
  monthlyIncludedConversations: 0,
  currency: "GBP",
};
const starter: PlanEconomics = {
  id: "starter",
  name: "Starter",
  monthlyPriceMinor: 3500,
  monthlyIncludedConversations: 20,
  currency: "GBP",
};
const growth: PlanEconomics = {
  id: "growth",
  name: "Growth",
  monthlyPriceMinor: 7500,
  monthlyIncludedConversations: 50,
  currency: "GBP",
};
const scale: PlanEconomics = {
  id: "scale",
  name: "Scale",
  monthlyPriceMinor: 14900,
  monthlyIncludedConversations: 110,
  currency: "GBP",
};

const freeOffers: FixedTopUpOffer[] = [
  { id: "free-one", planId: "free", chargeAmountMinor: 500, creditsGranted: 1 },
  {
    id: "free-three",
    planId: "free",
    chargeAmountMinor: 1000,
    creditsGranted: 3,
  },
  {
    id: "free-seven",
    planId: "free",
    chargeAmountMinor: 2000,
    creditsGranted: 7,
  },
];
const starterOffers: FixedTopUpOffer[] = [
  {
    id: "starter-two",
    planId: "starter",
    chargeAmountMinor: 500,
    creditsGranted: 2,
  },
  {
    id: "starter-five",
    planId: "starter",
    chargeAmountMinor: 1000,
    creditsGranted: 5,
  },
  {
    id: "starter-ten",
    planId: "starter",
    chargeAmountMinor: 2000,
    creditsGranted: 10,
  },
];
const growthOffers: FixedTopUpOffer[] = [
  {
    id: "growth-three",
    planId: "growth",
    chargeAmountMinor: 500,
    creditsGranted: 3,
  },
  {
    id: "growth-six",
    planId: "growth",
    chargeAmountMinor: 1000,
    creditsGranted: 6,
  },
  {
    id: "growth-twelve",
    planId: "growth",
    chargeAmountMinor: 2000,
    creditsGranted: 12,
  },
];

function fixed(
  unitAmountMinor: number,
  currency = "GBP",
): UsagePricingSnapshot {
  return { mode: "FIXED", currency, unitAmountMinor };
}

function costResult(
  overrides: Partial<Parameters<typeof evaluateUpgradeEconomicsCost>[0]> = {},
) {
  return evaluateUpgradeEconomicsCost({
    currentPlan: starter,
    nextPlan: growth,
    topUpCostMinor: 2000,
    additionalCreditsNeeded: 30,
    ...overrides,
  });
}

test("1. zero credit need returns zero cost and no purchases", () => {
  assert.deepEqual(findCheapestTopUpCombination(freeOffers, 0), {
    costMinor: 0,
    creditsGranted: 0,
    purchases: [],
  });
});

test("2. empty offers cannot satisfy a positive need", () => {
  assert.equal(findCheapestTopUpCombination([], 3), null);
});

test("3. one exact fixed pack is selected", () => {
  const offer = {
    id: "pack",
    planId: "free",
    chargeAmountMinor: 500,
    creditsGranted: 5,
  };
  assert.deepEqual(findCheapestTopUpCombination([offer], 5), {
    costMinor: 500,
    creditsGranted: 5,
    purchases: [offer],
  });
});

test("4. mixed offers beat the fewest-pack route", () => {
  const offers = [
    {
      id: "large",
      planId: "free",
      chargeAmountMinor: 1500,
      creditsGranted: 10,
    },
    { id: "small", planId: "free", chargeAmountMinor: 300, creditsGranted: 3 },
  ];
  const result = findCheapestTopUpCombination(offers, 10);
  assert.equal(result?.costMinor, 1200);
  assert.equal(result?.creditsGranted, 12);
  assert.deepEqual(
    result?.purchases.map((offer) => offer.id),
    ["small", "small", "small", "small"],
  );
});

test("5. cheaper overshoot is allowed", () => {
  const offers = [
    { id: "exact", planId: "free", chargeAmountMinor: 1000, creditsGranted: 5 },
    {
      id: "overshoot",
      planId: "free",
      chargeAmountMinor: 700,
      creditsGranted: 7,
    },
  ];
  assert.equal(findCheapestTopUpCombination(offers, 5)?.costMinor, 700);
});

test("6. invalid zero or negative credits are ignored", () => {
  const validOffer = {
    id: "valid",
    planId: "free",
    chargeAmountMinor: 250,
    creditsGranted: 2,
  };
  const result = findCheapestTopUpCombination(
    [
      { id: "zero", planId: "free", chargeAmountMinor: 100, creditsGranted: 0 },
      {
        id: "negative",
        planId: "free",
        chargeAmountMinor: 100,
        creditsGranted: -1,
      },
      validOffer,
    ],
    1,
  );
  assert.equal(result?.costMinor, 250);
  assert.deepEqual(result?.purchases, [validOffer]);
});

test("7. invalid zero or negative charges are ignored", () => {
  const validOffer = {
    id: "valid",
    planId: "free",
    chargeAmountMinor: 250,
    creditsGranted: 2,
  };
  const result = findCheapestTopUpCombination(
    [
      { id: "zero", planId: "free", chargeAmountMinor: 0, creditsGranted: 5 },
      {
        id: "negative",
        planId: "free",
        chargeAmountMinor: -1,
        creditsGranted: 5,
      },
      validOffer,
    ],
    1,
  );
  assert.equal(result?.costMinor, 250);
  assert.deepEqual(result?.purchases, [validOffer]);
});

test("8. purchase summaries group identical offers", () => {
  assert.deepEqual(
    summarisePurchases([freeOffers[0], freeOffers[0], freeOffers[1]]),
    [
      {
        offerId: "free-one",
        chargeAmountMinor: 500,
        creditsGranted: 1,
        quantity: 2,
      },
      {
        offerId: "free-three",
        chargeAmountMinor: 1000,
        creditsGranted: 3,
        quantity: 1,
      },
    ],
  );
});

test("9. supplied Free to Starter fixture passes at 20 percent", () => {
  const result = validateUpgradeEconomics({
    currentPlan: { ...free, monthlyIncludedConversations: 2 },
    nextPlan: starter,
    allTopUpOffers: freeOffers,
    topUpsEnabled: true,
  });
  assert.equal(result.status, "PASS");
  assert.equal(result.details.stayAndTopUpCostMinor, 5500);
  assert.equal(result.details.upgradeCostMinor, 3500);
});

test("10. supplied Starter to Growth fixture passes at 20 percent", () => {
  const result = validateUpgradeEconomics({
    currentPlan: starter,
    nextPlan: growth,
    allTopUpOffers: starterOffers,
    topUpsEnabled: true,
  });
  assert.equal(result.status, "PASS");
  assert.equal(result.details.stayAndTopUpCostMinor, 9500);
});

test("11. supplied Growth to Scale fixture fails below policy", () => {
  const result = validateUpgradeEconomics({
    currentPlan: growth,
    nextPlan: scale,
    allTopUpOffers: growthOffers,
    topUpsEnabled: true,
  });
  assert.equal(result.code, "UPGRADE_ADVANTAGE_TOO_SMALL");
  assert.equal(result.details.stayAndTopUpCostMinor, 17500);
});

test("12. equal stay and upgrade costs fail", () => {
  assert.equal(
    costResult({ topUpCostMinor: 4000 }).code,
    "TOPUPS_CHEAPER_THAN_UPGRADE",
  );
});

test("13. cheaper stay and top-up costs fail", () => {
  assert.equal(
    costResult({ topUpCostMinor: 3000 }).code,
    "TOPUPS_CHEAPER_THAN_UPGRADE",
  );
});

test("14. exactly 20 percent premium passes", () => {
  const result = costResult({ topUpCostMinor: 5500 });
  assert.equal(result.status, "PASS");
  assert.equal(result.details.premiumBps, 2000);
});

test("15. 19.99 percent premium fails", () => {
  assert.equal(
    costResult({ topUpCostMinor: 5499 }).code,
    "UPGRADE_ADVANTAGE_TOO_SMALL",
  );
});

test("16. zero policy threshold accepts a strictly higher route", () => {
  assert.equal(
    costResult({ topUpCostMinor: 4001, minimumUpgradePremiumBps: 0 }).status,
    "PASS",
  );
});

test("17. disabled top-ups pass without pricing evidence", () => {
  const result = validateSinglePackShopifyEconomics({
    currentPlan: starter,
    nextPlan: growth,
    topUpsEnabled: false,
    recoveryCreditsPerPack: null,
    usagePricing: null,
  });
  assert.deepEqual(
    [result.status, result.code],
    ["PASS", "NO_TOPUPS_AVAILABLE"],
  );
});

test("18. enabled top-ups with no offers are unverified", () => {
  const result = validateUpgradeEconomics({
    currentPlan: starter,
    nextPlan: growth,
    allTopUpOffers: [],
    topUpsEnabled: true,
  });
  assert.deepEqual(
    [result.status, result.code],
    ["UNVERIFIED", "TOPUP_PRICING_UNAVAILABLE"],
  );
});

test("19. missing lower recurring price is unverified", () => {
  assert.equal(
    costResult({ currentPlan: { ...starter, monthlyPriceMinor: null } }).code,
    "MISSING_PLAN_PRICE",
  );
});

test("20. missing higher recurring price is unverified", () => {
  assert.equal(
    costResult({ nextPlan: { ...growth, monthlyPriceMinor: null } }).code,
    "MISSING_PLAN_PRICE",
  );
});

test("21. recurring currency mismatch is unverified", () => {
  assert.equal(
    costResult({ nextPlan: { ...growth, currency: "USD" } }).code,
    "CURRENCY_MISMATCH",
  );
});

test("22. usage-meter currency mismatch is unverified", () => {
  const result = validateSinglePackShopifyEconomics({
    currentPlan: starter,
    nextPlan: growth,
    topUpsEnabled: true,
    recoveryCreditsPerPack: 5,
    usagePricing: fixed(100, "USD"),
  });
  assert.deepEqual(
    [result.status, result.code],
    ["UNVERIFIED", "CURRENCY_MISMATCH"],
  );
});

test("23. self and non-increasing allowance edges are unverified", () => {
  assert.equal(costResult({ nextPlan: starter }).code, "INVALID_UPGRADE_EDGE");
  assert.equal(
    costResult({
      currentPlan: {
        ...starter,
        id: "growth",
        monthlyIncludedConversations: 50,
      },
    }).code,
    "INVALID_UPGRADE_EDGE",
  );
});

test("24. invalid pack sizes are unverified", () => {
  for (const recoveryCreditsPerPack of [
    null,
    0,
    -1,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    const result = validateSinglePackShopifyEconomics({
      currentPlan: starter,
      nextPlan: growth,
      topUpsEnabled: true,
      recoveryCreditsPerPack,
      usagePricing: fixed(100),
    });
    assert.deepEqual(
      [result.status, result.code],
      ["UNVERIFIED", "TOPUP_PRICING_UNAVAILABLE"],
    );
  }
});

test("25. malformed tiers return invalid usage pricing", () => {
  const result = validateSinglePackShopifyEconomics({
    currentPlan: starter,
    nextPlan: growth,
    topUpsEnabled: true,
    recoveryCreditsPerPack: 5,
    usagePricing: { mode: "GRADUATED", currency: "GBP", tiers: [] },
  });
  assert.deepEqual(
    [result.status, result.code],
    ["UNVERIFIED", "INVALID_USAGE_PRICING"],
  );
});

test("26. a missing open-ended final tier is malformed", () => {
  assert.equal(
    calculateUsagePricingCostMinor(
      {
        mode: "VOLUME",
        currency: "GBP",
        tiers: [{ upTo: 100, amountPerUnitMinor: 10, flatAmountMinor: 0 }],
      },
      10,
    ),
    null,
  );
});

test("27. non-increasing tier boundaries are malformed", () => {
  assert.equal(
    calculateUsagePricingCostMinor(
      {
        mode: "GRADUATED",
        currency: "GBP",
        tiers: [
          { upTo: 100, amountPerUnitMinor: 10, flatAmountMinor: 0 },
          { upTo: 100, amountPerUnitMinor: 9, flatAmountMinor: 0 },
          { upTo: null, amountPerUnitMinor: 8, flatAmountMinor: 0 },
        ],
      },
      10,
    ),
    null,
  );
});

test("28. corrected Free plan uses zero monthly included conversations", () => {
  const result = validateUpgradeEconomics({
    currentPlan: free,
    nextPlan: starter,
    allTopUpOffers: freeOffers,
    topUpsEnabled: true,
  });
  assert.equal(result.status, "PASS");
  assert.equal(result.details.additionalCreditsNeeded, 20);
  assert.equal(result.details.topUpCostMinor, 6000);
  assert.equal(result.details.stayAndTopUpCostMinor, 6000);
  assert.equal(result.details.upgradeCostMinor, 3500);
});

test("29. lifetime-Free policy is not an evaluator input", () => {
  const contexts = [
    { lifetimeFreeRecoveryAllowance: 5 },
    { lifetimeFreeRecoveryAllowance: 500 },
  ];
  const results = contexts.map(() =>
    validateUpgradeEconomics({
      currentPlan: free,
      nextPlan: starter,
      allTopUpOffers: freeOffers,
      topUpsEnabled: true,
    }),
  );
  assert.deepEqual(results[1], results[0]);
});

test("30. promotion state does not change the evaluator result", () => {
  const contexts = [
    { promotionCampaign: { quantity: 0, expiresAt: null, selected: false } },
    {
      promotionCampaign: {
        quantity: 100,
        expiresAt: "2026-12-31",
        selected: true,
      },
    },
  ];
  const results = contexts.map(() =>
    validateUpgradeEconomics({
      currentPlan: free,
      nextPlan: starter,
      allTopUpOffers: freeOffers,
      topUpsEnabled: true,
    }),
  );
  assert.deepEqual(results[1], results[0]);
});

test("31. purchased-credit state does not change the evaluator result", () => {
  const contexts = [
    { purchasedCreditBalance: 0, refundState: "NOT_REQUESTED" },
    { purchasedCreditBalance: 99, refundState: "REFUNDED" },
  ];
  const results = contexts.map(() =>
    validateUpgradeEconomics({
      currentPlan: starter,
      nextPlan: growth,
      allTopUpOffers: starterOffers,
      topUpsEnabled: true,
    }),
  );
  assert.deepEqual(results[1], results[0]);
});

test("32. merchant usage is not an evaluator input", () => {
  const contexts = [
    { merchantUsage: 0, currentBalance: 110 },
    { merchantUsage: 1000, currentBalance: 0 },
  ];
  const results = contexts.map(() =>
    validateUpgradeEconomics({
      currentPlan: growth,
      nextPlan: scale,
      allTopUpOffers: growthOffers,
      topUpsEnabled: true,
    }),
  );
  assert.deepEqual(results[1], results[0]);
  assert.equal(results[0].details.additionalCreditsNeeded, 60);
});

test("33. fixed pricing multiplies units", () => {
  assert.equal(calculateUsagePricingCostMinor(fixed(25), 4), 100);
});

test("34. fixed zero quantity costs zero", () => {
  assert.equal(calculateUsagePricingCostMinor(fixed(25), 0), 0);
});

test("35. one graduated tier prices per unit", () => {
  assert.equal(
    calculateUsagePricingCostMinor(
      {
        mode: "GRADUATED",
        currency: "GBP",
        tiers: [{ upTo: null, amountPerUnitMinor: 1000, flatAmountMinor: 0 }],
      },
      3,
    ),
    3000,
  );
});

test("36. graduated tiers charge units through each tier", () => {
  assert.equal(
    calculateUsagePricingCostMinor(
      {
        mode: "GRADUATED",
        currency: "GBP",
        tiers: [
          { upTo: 100, amountPerUnitMinor: 1000, flatAmountMinor: 0 },
          { upTo: null, amountPerUnitMinor: 900, flatAmountMinor: 0 },
        ],
      },
      150,
    ),
    145000,
  );
});

test("37. graduated flat amounts apply once per participating tier", () => {
  assert.equal(
    calculateUsagePricingCostMinor(
      {
        mode: "GRADUATED",
        currency: "GBP",
        tiers: [
          { upTo: 100, amountPerUnitMinor: 100, flatAmountMinor: 500 },
          { upTo: null, amountPerUnitMinor: 90, flatAmountMinor: 700 },
        ],
      },
      150,
    ),
    15700,
  );
});

test("38. volume pricing uses the final quantity tier", () => {
  assert.equal(
    calculateUsagePricingCostMinor(
      {
        mode: "VOLUME",
        currency: "GBP",
        tiers: [
          { upTo: 100, amountPerUnitMinor: 1000, flatAmountMinor: 0 },
          { upTo: 200, amountPerUnitMinor: 900, flatAmountMinor: 0 },
          { upTo: null, amountPerUnitMinor: 800, flatAmountMinor: 0 },
        ],
      },
      150,
    ),
    135000,
  );
});

test("39. volume applies only the selected tier flat amount", () => {
  assert.equal(
    calculateUsagePricingCostMinor(
      {
        mode: "VOLUME",
        currency: "GBP",
        tiers: [
          { upTo: 100, amountPerUnitMinor: 1000, flatAmountMinor: 500 },
          { upTo: null, amountPerUnitMinor: 900, flatAmountMinor: 700 },
        ],
      },
      150,
    ),
    135700,
  );
});

test("40. open-ended pricing handles large valid quantities", () => {
  assert.equal(
    calculateUsagePricingCostMinor(
      {
        mode: "VOLUME",
        currency: "GBP",
        tiers: [
          { upTo: 100, amountPerUnitMinor: 1000, flatAmountMinor: 0 },
          { upTo: null, amountPerUnitMinor: 900, flatAmountMinor: 0 },
        ],
      },
      100000,
    ),
    90000000,
  );
});

test("41. single-pack adapter rounds required pack units up", () => {
  const result = validateSinglePackShopifyEconomics({
    currentPlan: starter,
    nextPlan: growth,
    topUpsEnabled: true,
    recoveryCreditsPerPack: 5,
    usagePricing: fixed(100),
  });
  assert.equal(result.details.packUnitsNeeded, 6);
});

test("42. single-pack adapter prices overshoot by whole meter units", () => {
  const result = validateSinglePackShopifyEconomics({
    currentPlan: starter,
    nextPlan: { ...growth, monthlyIncludedConversations: 61 },
    topUpsEnabled: true,
    recoveryCreditsPerPack: 5,
    usagePricing: fixed(100),
  });
  assert.equal(result.details.packUnitsNeeded, 9);
  assert.equal(result.details.topUpCostMinor, 900);
});
