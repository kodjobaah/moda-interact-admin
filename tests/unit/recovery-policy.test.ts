import assert from "node:assert/strict";
import test from "node:test";
import {
  effectiveRecoveryPolicy,
  parseRecoveryPolicySnapshot,
} from "../../src/lib/admin/recovery-policy.ts";

const merchant = {
  recoveryDelayMinutes: 30,
  recoveryOfferMode: "NONE" as const,
  fixedShopifyDiscountId: null,
  followUpEnabled: false,
  followUpDelayMinutes: null,
};

test("effective policy uses an active complete override", () => {
  const override = parseRecoveryPolicySnapshot({
    recoveryDelayMinutes: 90,
    recoveryOfferMode: "AI_BEST_APPLICABLE",
    fixedShopifyDiscountId: null,
    followUpEnabled: true,
    followUpDelayMinutes: 120,
  });
  assert.deepEqual(
    effectiveRecoveryPolicy(merchant, override, null),
    { ...override, source: "ADMIN_OVERRIDE" },
  );
});

test("expired override restores merchant policy without deleting history", () => {
  const override = parseRecoveryPolicySnapshot({
    recoveryDelayMinutes: 90,
    recoveryOfferMode: "AI_BEST_APPLICABLE",
    fixedShopifyDiscountId: null,
    followUpEnabled: false,
    followUpDelayMinutes: null,
  });
  assert.deepEqual(
    effectiveRecoveryPolicy(
      merchant,
      override,
      new Date("2026-09-15T00:00:00.000Z"),
      new Date("2026-09-16T00:00:00.000Z"),
    ),
    { ...merchant, source: "MERCHANT" },
  );
});

test("Shared cross-field validation remains authoritative", () => {
  assert.throws(() => parseRecoveryPolicySnapshot({
    ...merchant,
    recoveryOfferMode: "FIXED",
  }));
  assert.throws(() => parseRecoveryPolicySnapshot({
    ...merchant,
    followUpEnabled: true,
  }));
});