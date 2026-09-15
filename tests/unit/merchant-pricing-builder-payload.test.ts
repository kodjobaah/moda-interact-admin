import assert from "node:assert/strict";
import test from "node:test";
import {
  MerchantPricingPayloadError,
  parseMerchantPricingBuilderPayload,
  parseMoneyToMinorUnits,
  projectMerchantPricingCatalogueOrder,
  resolveMerchantPricingPreviewPosition,
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
    recurringAmount: "0",
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
          fixedUnitAmount: "1.00",
          position: 99,
        },
        {
          adminLabel: "First",
          eventHandle: "first",
          creditsGrantedPerUnit: 1,
          maximumUnitsPerBillingPeriod: 3,
          pricingMode: "FIXED",
          fixedUnitAmount: "0.50",
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
      fixedUnitAmount: "0.01",
    },
    {
      adminLabel: "Two",
      eventHandle: "same",
      creditsGrantedPerUnit: 1,
      maximumUnitsPerBillingPeriod: 1,
      pricingMode: "FIXED",
      fixedUnitAmount: "0.01",
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
            fixedUnitAmount: "0.01",
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
              fixedUnitAmount: "0",
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

test("normalizes decimal usage prices and resolves explicit preview placement", () => {
  const parsed = parseMerchantPricingBuilderPayload(
    payload({
      recurringAmount: "35.5",
      usageEvents: [
        {
          adminLabel: "Meter",
          eventHandle: "meter",
          creditsGrantedPerUnit: 1,
          maximumUnitsPerBillingPeriod: 2,
          pricingMode: "GRADUATED",
          tiers: [
            { upTo: 1, amountPerUnit: "1.25", flatAmount: "0.5" },
            { upTo: null, amountPerUnit: "2", flatAmount: "1.00" },
          ],
        },
      ],
    }),
  );
  assert.equal(parsed.recurringAmountMinor, 3550);
  assert.deepEqual(parsed.usageEvents[0].tiers, [
    { upTo: 1, amountPerUnitMinor: 125, flatAmountMinor: 50 },
    { upTo: null, amountPerUnitMinor: 200, flatAmountMinor: 100 },
  ]);
  assert.throws(() =>
    parseMerchantPricingBuilderPayload(payload({ recurringAmount: "1e2" })),
  );
  assert.equal(
    resolveMerchantPricingPreviewPosition("BEFORE:first", ["first", "last"]),
    0,
  );
  assert.equal(
    resolveMerchantPricingPreviewPosition("AFTER:first", ["first", "last"]),
    1,
  );
  assert.equal(
    resolveMerchantPricingPreviewPosition("AFTER:missing", ["first", "last"]),
    null,
  );
});

test("projects the exact post-insert order for preview and server evaluation", () => {
  assert.deepEqual(
    projectMerchantPricingCatalogueOrder(
      ["A", "B", "C"],
      "NEW",
      resolveMerchantPricingPreviewPosition("BEFORE:A", ["A", "B", "C"])!,
    ),
    ["NEW", "A", "B", "C"],
  );
  assert.deepEqual(
    projectMerchantPricingCatalogueOrder(
      ["A", "B", "C"],
      "NEW",
      resolveMerchantPricingPreviewPosition("AFTER:A", ["A", "B", "C"])!,
    ),
    ["A", "NEW", "B", "C"],
  );
  assert.deepEqual(
    projectMerchantPricingCatalogueOrder(
      ["A", "B", "C"],
      "NEW",
      resolveMerchantPricingPreviewPosition("AFTER:C", ["A", "B", "C"])!,
    ),
    ["A", "B", "C", "NEW"],
  );
  assert.deepEqual(
    projectMerchantPricingCatalogueOrder(["A", "B", "C"], "B", 1, "B"),
    ["A", "B", "C"],
  );
});
