import assert from "node:assert/strict";
import test from "node:test";
import {
  MerchantPricingPayloadError,
  parseMerchantPricingBuilderPayload,
  parseMoneyToMinorUnits,
} from "../../src/lib/admin/merchant-pricing-builder-payload.ts";

function payload(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    id: null,
    shopifyPlanHandle: "starter",
    name: "Starter",
    planKind: "FREE",
    isActive: true,
    featured: false,
    includedRecoveryCredits: 0,
    allowancePeriod: "LIFETIME",
    billingPeriod: "EVERY_30_DAYS",
    currency: "USD",
    recurringAmountMinor: 0,
    placement: "ONLY",
    englishDescription: "A plan",
    reason: "initial catalogue",
    usageEvents: [],
    ...overrides,
  });
}

test("parses valid money and rejects ambiguous money forms", () => {
  assert.equal(parseMoneyToMinorUnits("35"), 3500);
  assert.equal(parseMoneyToMinorUnits("35.5"), 3550);
  assert.equal(parseMoneyToMinorUnits("35.50"), 3550);
  for (const value of ["-1", "1e2", "1,000", "1.234"])
    assert.throws(() => parseMoneyToMinorUnits(value));
});

test("derives allowance period and preserves UI event order without browser positions", () => {
  const parsed = parseMerchantPricingBuilderPayload(
    payload({
      planKind: "PAID_METERED",
      allowancePeriod: "EVERY_30_DAYS",
      usageEvents: [
        {
          adminLabel: "Second",
          eventHandle: "second",
          creditsGrantedPerUnit: 2,
          maximumUnitsPerBillingPeriod: 3,
          pricingMode: "FIXED",
          fixedUnitAmountMinor: 100,
          position: 99,
        },
        {
          adminLabel: "First",
          eventHandle: "first",
          creditsGrantedPerUnit: 1,
          maximumUnitsPerBillingPeriod: 3,
          pricingMode: "FIXED",
          fixedUnitAmountMinor: 50,
          position: 0,
        },
      ],
    }),
  );
  assert.equal(parsed.allowancePeriod, "EVERY_30_DAYS");
  assert.deepEqual(
    parsed.usageEvents.map((event) => event.eventHandle),
    ["second", "first"],
  );
  assert.equal("position" in parsed.usageEvents[0], false);
});

test("rejects duplicate events, too many events, invalid tiers, unbounded zero-cost usage, and operational fields", () => {
  const duplicate = [
    {
      adminLabel: "One",
      eventHandle: "same",
      creditsGrantedPerUnit: 1,
      maximumUnitsPerBillingPeriod: 1,
      pricingMode: "FIXED",
      fixedUnitAmountMinor: 1,
    },
    {
      adminLabel: "Two",
      eventHandle: "same",
      creditsGrantedPerUnit: 1,
      maximumUnitsPerBillingPeriod: 1,
      pricingMode: "FIXED",
      fixedUnitAmountMinor: 1,
    },
  ];
  assert.throws(
    () =>
      parseMerchantPricingBuilderPayload(payload({ usageEvents: duplicate })),
    MerchantPricingPayloadError,
  );
  assert.throws(
    () =>
      parseMerchantPricingBuilderPayload(
        payload({
          usageEvents: Array.from({ length: 6 }, (_, index) => ({
            adminLabel: String(index),
            eventHandle: String(index),
            creditsGrantedPerUnit: 1,
            maximumUnitsPerBillingPeriod: 1,
            pricingMode: "FIXED",
            fixedUnitAmountMinor: 1,
          })),
        }),
      ),
    MerchantPricingPayloadError,
  );
  assert.throws(
    () =>
      parseMerchantPricingBuilderPayload(
        payload({
          usageEvents: [
            {
              adminLabel: "Free",
              eventHandle: "free",
              creditsGrantedPerUnit: 1,
              maximumUnitsPerBillingPeriod: null,
              pricingMode: "FIXED",
              fixedUnitAmountMinor: 0,
            },
          ],
        }),
      ),
    MerchantPricingPayloadError,
  );
  assert.throws(
    () =>
      parseMerchantPricingBuilderPayload(
        payload({ shopifyUsageEventHandle: "forbidden" }),
      ),
    MerchantPricingPayloadError,
  );
});
