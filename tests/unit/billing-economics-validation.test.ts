import assert from "node:assert/strict";
import test from "node:test";
import { parseEconomicsSnapshotForm, parseUpgradeEdgeForm } from "../../src/lib/admin/billing-economics-validation.ts";

function snapshotForm(values: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

test("snapshot validation normalizes fixed usage pricing and bounded evidence", () => {
  const parsed = parseEconomicsSnapshotForm(snapshotForm({
    billingPlanId: "plan-1",
    shopifyPlanHandleSnapshot: "starter",
    monthlyRecurringAmountMinor: "3500",
    currency: "gbp",
    recoveryCreditPackEnabledSnapshot: "on",
    recoveryCreditsPerPackSnapshot: "10",
    shopifyRecoveryCreditPackEventHandleSnapshot: "pack-meter",
    usagePricingMode: "FIXED",
    usagePricingCurrency: "GBP",
    usageUnitAmountMinor: "250",
    verificationReason: "Partner Dashboard verification",
  }));
  assert.deepEqual(parsed.usagePricingSnapshot, { mode: "FIXED", currency: "GBP", unitAmountMinor: 250 });
  assert.equal(parsed.currency, "GBP");
});

test("snapshot validation rejects malformed tier sequences and unsupported fields", () => {
  const base = {
    billingPlanId: "plan-1",
    shopifyPlanHandleSnapshot: "starter",
    monthlyRecurringAmountMinor: "3500",
    currency: "GBP",
    recoveryCreditPackEnabledSnapshot: "on",
    recoveryCreditsPerPackSnapshot: "10",
    shopifyRecoveryCreditPackEventHandleSnapshot: "pack-meter",
    usagePricingMode: "GRADUATED",
    usagePricingCurrency: "GBP",
    verificationReason: "Partner Dashboard verification",
  };
  assert.throws(() => parseEconomicsSnapshotForm(snapshotForm({ ...base, usageTiersJson: JSON.stringify([{ upTo: 100, amountPerUnitMinor: 1, flatAmountMinor: 0 }, { upTo: 90, amountPerUnitMinor: 1, flatAmountMinor: 0 },]) })));
  assert.throws(() => parseEconomicsSnapshotForm(snapshotForm({ ...base, usageTiersJson: JSON.stringify([{ upTo: null, amountPerUnitMinor: 1, flatAmountMinor: 0, token: "secret" }]) })));
});

test("disabled packs reject pricing evidence and edge forms require both plans", () => {
  assert.throws(() => parseEconomicsSnapshotForm(snapshotForm({
    billingPlanId: "plan-1",
    shopifyPlanHandleSnapshot: "free",
    monthlyRecurringAmountMinor: "0",
    currency: "GBP",
    usagePricingMode: "FIXED",
    usagePricingCurrency: "GBP",
    usageUnitAmountMinor: "1",
    verificationReason: "No packs",
  })));
  assert.deepEqual(
    parseUpgradeEdgeForm(snapshotForm({ intent: "create", lowerPlanId: "plan-1", higherPlanId: "plan-1", reason: "edge review" })),
    { intent: "create", id: null, lowerPlanId: "plan-1", higherPlanId: "plan-1", reason: "edge review" },
  );
  assert.throws(() => parseUpgradeEdgeForm(snapshotForm({ intent: "create", lowerPlanId: "plan-1", reason: "missing higher plan" })));
});
