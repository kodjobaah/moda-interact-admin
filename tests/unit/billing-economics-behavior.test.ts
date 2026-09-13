import assert from "node:assert/strict";
import test from "node:test";
import {
  decideUpgradeEdgeMutation,
  parseEconomicsSnapshotForm,
} from "../../src/lib/admin/billing-economics-validation.ts";

function snapshotForm(values: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

const baseSnapshot = {
  billingPlanId: "plan-1",
  shopifyPlanHandleSnapshot: "starter",
  currency: "GBP",
  recoveryCreditPackEnabledSnapshot: "on",
  recoveryCreditsPerPackSnapshot: "10",
  shopifyRecoveryCreditPackEventHandleSnapshot: "pack-meter",
  usagePricingMode: "FIXED",
  usagePricingCurrency: "GBP",
  usageUnitAmountMinor: "250",
  verificationReason: "Partner Dashboard verification",
};

function edge(
  overrides: Partial<Parameters<typeof decideUpgradeEdgeMutation>[0]> = {},
) {
  return {
    lowerPlanId: "free",
    higherPlanId: "starter",
    lowerAllowance: 10,
    higherAllowance: 20,
    lowerEdge: null,
    higherEdge: null,
    ...overrides,
  };
}

test("upgrade edge behavior rejects self, non-increasing, and active branching edges", () => {
  assert.throws(() =>
    decideUpgradeEdgeMutation(edge({ higherPlanId: "free" })),
  );
  assert.throws(() => decideUpgradeEdgeMutation(edge({ higherAllowance: 10 })));
  assert.throws(() =>
    decideUpgradeEdgeMutation(
      edge({
        lowerEdge: {
          id: "edge-1",
          lowerPlanId: "free",
          higherPlanId: "starter",
          active: true,
        },
      }),
    ),
  );
  assert.throws(() =>
    decideUpgradeEdgeMutation(
      edge({
        higherEdge: {
          id: "edge-2",
          lowerPlanId: "free",
          higherPlanId: "starter",
          active: true,
        },
      }),
    ),
  );
});

test("upgrade edge behavior reactivates the exact inactive pair and rejects inactive conflicts", () => {
  const exact = {
    id: "edge-1",
    lowerPlanId: "free",
    higherPlanId: "starter",
    active: false,
  };
  assert.deepEqual(
    decideUpgradeEdgeMutation(edge({ lowerEdge: exact, higherEdge: exact })),
    { action: "reactivate", edge: exact },
  );
  assert.throws(() =>
    decideUpgradeEdgeMutation(
      edge({ lowerEdge: { ...exact, higherPlanId: "growth" } }),
    ),
  );
});

test("snapshot behavior accepts Prisma Int maximum and rejects overflow", () => {
  const accepted = parseEconomicsSnapshotForm(
    snapshotForm({
      ...baseSnapshot,
      monthlyRecurringAmountMinor: "2147483647",
      recoveryCreditsPerPackSnapshot: "2147483647",
    }),
  );
  assert.equal(accepted.monthlyRecurringAmountMinor, 2147483647);
  assert.equal(accepted.recoveryCreditsPerPackSnapshot, 2147483647);
  assert.throws(() =>
    parseEconomicsSnapshotForm(
      snapshotForm({
        ...baseSnapshot,
        monthlyRecurringAmountMinor: "2147483648",
      }),
    ),
  );
  assert.throws(() =>
    parseEconomicsSnapshotForm(
      snapshotForm({
        ...baseSnapshot,
        recoveryCreditsPerPackSnapshot: "2147483648",
      }),
    ),
  );
});
