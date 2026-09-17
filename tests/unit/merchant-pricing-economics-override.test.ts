import assert from "node:assert/strict";
import test from "node:test";

import {
  assessMerchantPricingEconomicsOverride,
} from "../../src/lib/admin/merchant/pricing-economics-override.ts";
import { createMerchantPricingEconomicsOverrideFingerprint } from "../../src/lib/admin/merchant/pricing-economics-override.server.ts";
import type {
  MerchantPricingEconomicsPlan,
  MerchantPricingPairResult,
  MerchantPricingResultCode,
  MerchantPricingStatus,
} from "../../src/lib/admin/merchant/pricing-economics.ts";

function pair(
  status: MerchantPricingStatus,
  code: MerchantPricingResultCode,
): MerchantPricingPairResult {
  return {
    status,
    code,
    message: `${status}:${code}`,
    totalCostMinor: 0,
    actualCreditsGranted: 0,
    totalUnits: 0,
    summary: [],
    lowerPlanId: "lower",
    higherPlanId: "higher",
    additionalCreditsNeeded: 1,
  };
}

function plan(
  id: string,
  handle: string,
  credits: number,
  recurringAmountMinor: number,
  unitAmountMinor: number,
): MerchantPricingEconomicsPlan {
  return {
    id,
    shopifyPlanHandle: handle,
    name: handle,
    includedRecoveryCredits: credits,
    recurringAmountMinor,
    currency: "USD",
    usageEvents: [
      {
        eventHandle: `${handle}-top-up`,
        creditsGrantedPerUnit: 5,
        maximumUnitsPerBillingPeriod: 4,
        pricing: {
          mode: "FIXED",
          currency: "USD",
          unitAmountMinor,
        },
      },
    ],
  };
}

test("economics override policy allows only the two commercial policy failures", () => {
  assert.deepEqual(
    assessMerchantPricingEconomicsOverride([], false),
    { kind: "PASS", failureCodes: [] },
  );

  assert.deepEqual(
    assessMerchantPricingEconomicsOverride(
      [
        pair("FAIL", "TOPUPS_CHEAPER_THAN_UPGRADE"),
        pair("FAIL", "UPGRADE_ADVANTAGE_TOO_SMALL"),
      ],
      false,
    ),
    {
      kind: "OVERRIDEABLE",
      failureCodes: [
        "TOPUPS_CHEAPER_THAN_UPGRADE",
        "UPGRADE_ADVANTAGE_TOO_SMALL",
      ],
    },
  );

  assert.equal(
    assessMerchantPricingEconomicsOverride(
      [pair("UNVERIFIED", "UNBOUNDED_ZERO_COST_USAGE_EVENT")],
      false,
    ).kind,
    "HARD_FAIL",
  );

  assert.equal(
    assessMerchantPricingEconomicsOverride(
      [
        pair("FAIL", "TOPUPS_CHEAPER_THAN_UPGRADE"),
        pair("FAIL", "NON_INCREASING_ALLOWANCE"),
      ],
      false,
    ).kind,
    "HARD_FAIL",
  );

  assert.equal(
    assessMerchantPricingEconomicsOverride(
      [pair("FAIL", "TOPUPS_CHEAPER_THAN_UPGRADE")],
      true,
    ).kind,
    "HARD_FAIL",
  );
});

test("override fingerprint is stable across transient database ids", () => {
  const candidate = plan("candidate:growth", "growth", 50, 5000, 1000);
  const persisted = { ...candidate, id: "cm-real-growth-id" };
  const free = plan("free-id", "free", 0, 0, 1500);

  const first = createMerchantPricingEconomicsOverrideFingerprint({
    orderedPlanIds: [free.id, candidate.id],
    plansById: {
      [free.id]: free,
      [candidate.id]: candidate,
    },
    minimumUpgradePremiumBps: 2000,
    failureCodes: ["TOPUPS_CHEAPER_THAN_UPGRADE"],
  });

  const second = createMerchantPricingEconomicsOverrideFingerprint({
    orderedPlanIds: [free.id, persisted.id],
    plansById: {
      [free.id]: free,
      [persisted.id]: persisted,
    },
    minimumUpgradePremiumBps: 2000,
    failureCodes: ["TOPUPS_CHEAPER_THAN_UPGRADE"],
  });

  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{64}$/);
});

test("override fingerprint changes when economics-relevant portfolio state changes", () => {
  const free = plan("free-id", "free", 0, 0, 1500);
  const growth = plan("growth-id", "growth", 50, 5000, 1000);

  const fingerprint = (input: {
    free?: MerchantPricingEconomicsPlan;
    growth?: MerchantPricingEconomicsPlan;
    minimumUpgradePremiumBps?: number;
    failureCodes?: string[];
    reversed?: boolean;
  } = {}) => {
    const effectiveFree = input.free ?? free;
    const effectiveGrowth = input.growth ?? growth;
    const orderedPlanIds = input.reversed
      ? [effectiveGrowth.id, effectiveFree.id]
      : [effectiveFree.id, effectiveGrowth.id];

    return createMerchantPricingEconomicsOverrideFingerprint({
      orderedPlanIds,
      plansById: {
        [effectiveFree.id]: effectiveFree,
        [effectiveGrowth.id]: effectiveGrowth,
      },
      minimumUpgradePremiumBps: input.minimumUpgradePremiumBps ?? 2000,
      failureCodes:
        input.failureCodes ?? ["TOPUPS_CHEAPER_THAN_UPGRADE"],
    });
  };

  const baseline = fingerprint();
  assert.notEqual(
    baseline,
    fingerprint({
      growth: { ...growth, recurringAmountMinor: 5500 },
    }),
  );
  assert.notEqual(
    baseline,
    fingerprint({
      growth: {
        ...growth,
        usageEvents: [
          {
            ...growth.usageEvents[0],
            maximumUnitsPerBillingPeriod: 5,
          },
        ],
      },
    }),
  );
  assert.notEqual(baseline, fingerprint({ minimumUpgradePremiumBps: 2500 }));
  assert.notEqual(
    baseline,
    fingerprint({ failureCodes: ["UPGRADE_ADVANTAGE_TOO_SMALL"] }),
  );
  assert.notEqual(baseline, fingerprint({ reversed: true }));
});
