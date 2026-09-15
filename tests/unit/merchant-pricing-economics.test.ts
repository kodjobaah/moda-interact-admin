import assert from "node:assert/strict";
import test from "node:test";

import {
  assertMerchantPricingPortfolioPass,
  evaluateMerchantPricingPair,
  evaluateMerchantPricingPortfolio,
  findCheapestMerchantUsageCombination,
  type MerchantPricingEconomicsPlan,
  type MerchantPricingUsageOffer,
} from "../../src/lib/admin/merchant-pricing-economics.ts";
import { validateSinglePackShopifyEconomics } from "../../src/lib/admin/upgrade-economics-guardrail.ts";

function fixed(
  eventHandle: string,
  creditsGrantedPerUnit: number,
  unitAmountMinor: number,
  maximumUnitsPerBillingPeriod: number | null = null,
  currency = "GBP",
): MerchantPricingUsageOffer {
  return {
    eventHandle,
    creditsGrantedPerUnit,
    maximumUnitsPerBillingPeriod,
    pricing: { mode: "FIXED", currency, unitAmountMinor },
  };
}

function tiered(
  eventHandle: string,
  mode: "GRADUATED" | "VOLUME",
  tiers: MerchantPricingUsageOffer["pricing"] extends infer Pricing
    ? Pricing extends { tiers: infer T }
      ? T
      : never
    : never,
  creditsGrantedPerUnit = 1,
  maximumUnitsPerBillingPeriod: number | null = null,
): MerchantPricingUsageOffer {
  return {
    eventHandle,
    creditsGrantedPerUnit,
    maximumUnitsPerBillingPeriod,
    pricing: { mode, currency: "GBP", tiers } as MerchantPricingUsageOffer["pricing"],
  };
}

function plan(
  id: string,
  includedRecoveryCredits: number,
  recurringAmountMinor: number,
  usageEvents: MerchantPricingUsageOffer[] = [],
): MerchantPricingEconomicsPlan {
  return {
    id,
    shopifyPlanHandle: id,
    name: id,
    includedRecoveryCredits,
    recurringAmountMinor,
    currency: "GBP",
    usageEvents,
  };
}

test("0 meters returns PASS NO_TOPUPS_AVAILABLE", () => {
  const result = evaluateMerchantPricingPair(plan("free", 0, 0), plan("starter", 10, 1000));
  assert.deepEqual([result.status, result.code], ["PASS", "NO_TOPUPS_AVAILABLE"]);
});

test("one FIXED meter reproduces simple unit arithmetic", () => {
  const result = findCheapestMerchantUsageCombination([fixed("pack", 3, 100)], 6);
  assert.equal(result.status, "PASS");
  assert.equal(result.totalCostMinor, 200);
  assert.deepEqual(result.summary, [{ eventHandle: "pack", quantity: 2, creditsGranted: 6, costMinor: 200 }]);
});

test("two FIXED meters choose a cheaper mixed combination", () => {
  const result = findCheapestMerchantUsageCombination([
    fixed("expensive", 5, 100),
    fixed("cheap", 3, 60),
  ], 8);
  assert.equal(result.totalCostMinor, 160);
  assert.deepEqual(result.summary.map((row) => row.eventHandle), ["cheap", "expensive"]);
});

test("three meters can produce an optimum using more than one event", () => {
  const result = findCheapestMerchantUsageCombination([
    fixed("a", 4, 80),
    fixed("b", 3, 45),
    fixed("c", 2, 40),
  ], 7);
  assert.equal(result.totalCostMinor, 125);
  assert.deepEqual(result.summary.map((row) => row.eventHandle), ["a", "b"]);
});

test("GRADUATED pricing charges cumulative tiers", () => {
  const result = findCheapestMerchantUsageCombination([
    tiered("meter", "GRADUATED", [
      { upTo: 2, amountPerUnitMinor: 10, flatAmountMinor: 5 },
      { upTo: null, amountPerUnitMinor: 5, flatAmountMinor: 2 },
    ]),
  ], 3);
  assert.equal(result.totalCostMinor, 32);
});

test("VOLUME pricing considers a later tier entry above soloUnits", () => {
  const result = findCheapestMerchantUsageCombination([
    tiered("meter", "VOLUME", [
      { upTo: 2, amountPerUnitMinor: 100, flatAmountMinor: 0 },
      { upTo: null, amountPerUnitMinor: 10, flatAmountMinor: 0 },
    ]),
  ], 2);
  assert.equal(result.totalCostMinor, 30);
  assert.equal(result.summary[0].quantity, 3);
});

test("finite maximum units are respected", () => {
  const result = findCheapestMerchantUsageCombination([fixed("meter", 1, 10, 2)], 3);
  assert.equal(result.status, "UNVERIFIED");
  assert.equal(result.code, "INVALID_USAGE_PRICING");
});

test("zero-cost finite meters participate and can fail economics", () => {
  const result = evaluateMerchantPricingPair(
    plan("free", 0, 0, [fixed("meter", 1, 0, 1)]),
    plan("starter", 1, 100),
  );
  assert.deepEqual([result.status, result.code], ["FAIL", "TOPUPS_CHEAPER_THAN_UPGRADE"]);
});

test("zero-cost unbounded meters are unverified", () => {
  const result = findCheapestMerchantUsageCombination([fixed("meter", 1, 0)], 1);
  assert.deepEqual([result.status, result.code], ["UNVERIFIED", "UNBOUNDED_ZERO_COST_USAGE_EVENT"]);
});

test("paid early VOLUME tiers do not hide an unbounded free tier", () => {
  const result = findCheapestMerchantUsageCombination([
    tiered("meter", "VOLUME", [
      { upTo: 2, amountPerUnitMinor: 100, flatAmountMinor: 0 },
      { upTo: null, amountPerUnitMinor: 0, flatAmountMinor: 0 },
    ]),
  ], 1);
  assert.deepEqual([result.status, result.code], ["UNVERIFIED", "UNBOUNDED_ZERO_COST_USAGE_EVENT"]);
});

test("padded event handles are invalid rather than normalized", () => {
  const result = findCheapestMerchantUsageCombination([fixed(" meter", 1, 1)], 1);
  assert.equal(result.code, "INVALID_USAGE_EVENT");
});

test("duplicate event handles are invalid", () => {
  const result = findCheapestMerchantUsageCombination([fixed("meter", 1, 1), fixed("meter", 2, 1)], 1);
  assert.equal(result.code, "INVALID_USAGE_EVENT");
});

test("six usage events are invalid", () => {
  const result = findCheapestMerchantUsageCombination(Array.from({ length: 6 }, (_, index) => fixed(`meter-${index}`, 1, 1)), 1);
  assert.equal(result.code, "INVALID_USAGE_EVENT");
});

test("seven pricing tiers are invalid", () => {
  const tiers = Array.from({ length: 7 }, (_, index) => ({
    upTo: index === 6 ? null : index + 1,
    amountPerUnitMinor: 1,
    flatAmountMinor: 0,
  }));
  const result = findCheapestMerchantUsageCombination([tiered("meter", "VOLUME", tiers)], 1);
  assert.equal(result.code, "INVALID_USAGE_PRICING");
});

test("currency mismatch is unverified", () => {
  const lower = plan("lower", 0, 100, [fixed("meter", 1, 10, null, "USD")]);
  const higher = plan("higher", 1, 200);
  assert.equal(evaluateMerchantPricingPair(lower, higher).code, "CURRENCY_MISMATCH");
});

test("search limit returns the exact bounded code", () => {
  const result = findCheapestMerchantUsageCombination([fixed("meter", 1, 1)], 100_001);
  assert.equal(result.code, "ECONOMICS_SEARCH_LIMIT_EXCEEDED");
});

test("an unbounded VOLUME boundary above the candidate limit is rejected", () => {
  const result = findCheapestMerchantUsageCombination([
    tiered("meter", "VOLUME", [
      { upTo: 100_001, amountPerUnitMinor: 100, flatAmountMinor: 0 },
      { upTo: null, amountPerUnitMinor: 1, flatAmountMinor: 0 },
    ]),
  ], 1);
  assert.equal(result.code, "ECONOMICS_SEARCH_LIMIT_EXCEEDED");
});

test("reversing input event order does not change the result", () => {
  const events = [fixed("b", 2, 20), fixed("a", 1, 10)];
  const first = findCheapestMerchantUsageCombination(events, 3);
  const second = findCheapestMerchantUsageCombination([...events].reverse(), 3);
  assert.deepEqual(second, first);
});

test("tie-breaking is deterministic for mixed-case and punctuation handles", () => {
  const events = [fixed("a-", 1, 10), fixed("A_", 1, 10)];
  const result = findCheapestMerchantUsageCombination(events, 1);
  assert.equal(result.summary[0].eventHandle, "A_");
});

test("four plans produce six portfolio pairs in nested-loop order", () => {
  const plans = Object.fromEntries([plan("p0", 0, 0), plan("p1", 1, 100), plan("p2", 2, 200), plan("p3", 3, 300)].map((entry) => [entry.id, entry]));
  const results = evaluateMerchantPricingPortfolio({ orderedPlanIds: ["p0", "p1", "p2", "p3"], plansById: plans });
  assert.deepEqual(results.map((entry) => `${entry.lowerPlanId}->${entry.higherPlanId}`), ["p0->p1", "p0->p2", "p0->p3", "p1->p2", "p1->p3", "p2->p3"]);
});

test("a non-adjacent pair can fail while adjacent pairs pass and assertion blocks", () => {
  const plans = Object.fromEntries([
    plan("p0", 0, 0, [tiered("meter", "VOLUME", [{ upTo: 1, amountPerUnitMinor: 200, flatAmountMinor: 0 }, { upTo: null, amountPerUnitMinor: 0, flatAmountMinor: 150 }])]),
    plan("p1", 1, 100),
    plan("p2", 2, 200),
  ].map((entry) => [entry.id, entry]));
  const results = evaluateMerchantPricingPortfolio({ orderedPlanIds: ["p0", "p1", "p2"], plansById: plans });
  assert.equal(results[0].status, "PASS");
  assert.equal(results[1].status, "FAIL");
  assert.equal(results[2].status, "PASS");
  assert.throws(() => assertMerchantPricingPortfolioPass(results), /p0->p2/);
});

test("non-increasing allowance is blocking", () => {
  const result = evaluateMerchantPricingPair(plan("lower", 10, 100), plan("higher", 10, 200));
  assert.equal(result.code, "NON_INCREASING_ALLOWANCE");
});

test("invalid ordered plan ids return INVALID_PORTFOLIO_ORDER", () => {
  const result = evaluateMerchantPricingPortfolio({ orderedPlanIds: ["missing"], plansById: {} });
  assert.equal(result[0].code, "INVALID_PORTFOLIO_ORDER");
});

test("existing single-pack economics remains unchanged", () => {
  const result = validateSinglePackShopifyEconomics({
    currentPlan: { id: "free", name: "Free", monthlyPriceMinor: 0, monthlyIncludedConversations: 0, currency: "GBP" },
    nextPlan: { id: "starter", name: "Starter", monthlyPriceMinor: 1000, monthlyIncludedConversations: 5, currency: "GBP" },
    topUpsEnabled: false,
    recoveryCreditsPerPack: null,
    usagePricing: null,
  });
  assert.deepEqual([result.status, result.code], ["PASS", "NO_TOPUPS_AVAILABLE"]);
});