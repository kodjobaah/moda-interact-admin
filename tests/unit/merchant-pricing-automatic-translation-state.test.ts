import assert from "node:assert/strict";
import test from "node:test";
import {
  merchantPricingAutomaticTranslationCanPersistDraft,
  merchantPricingAutomaticTranslationReady,
  merchantPricingAutomaticTranslationSourceKey,
  merchantPricingAutomaticTranslationTerminal,
} from "../../src/components/admin/merchant/merchant-pricing-plan-builder/merchant-pricing-automatic-translation-state.ts";

const first = {
  contentKey: "11111111-1111-4111-8111-111111111111",
  title: "Fast",
  description: "Fast recovery",
};
const second = {
  contentKey: "22222222-2222-4222-8222-222222222222",
  title: "Helpful",
  description: "Helpful conversations",
};

test("automatic translation source identity is trim-normalized and highlight-order invariant", () => {
  const left = merchantPricingAutomaticTranslationSourceKey({
    shopifyPlanHandle: " starter ",
    englishDescription: " Recover baskets ",
    highlights: [first, second],
  });
  const right = merchantPricingAutomaticTranslationSourceKey({
    shopifyPlanHandle: "starter",
    englishDescription: "Recover baskets",
    highlights: [second, first],
  });
  assert.equal(left, right);
  assert.notEqual(
    left,
    merchantPricingAutomaticTranslationSourceKey({
      shopifyPlanHandle: "starter",
      englishDescription: "Recover baskets",
      highlights: [{ ...first, title: "Faster" }, second],
    }),
  );
});

test("only complete READY_TO_APPLY work reports translation readiness", () => {
  const ready = {
    runId: "run-1",
    status: "READY_TO_APPLY" as const,
    modelDisplayName: "Automatic",
    completeLocaleCount: 20,
    localeCount: 20,
    pendingItemCount: 0,
    failedItemCount: 0,
    failureCode: null,
  };
  assert.equal(merchantPricingAutomaticTranslationReady(ready), true);
  assert.equal(
    merchantPricingAutomaticTranslationReady({ ...ready, status: "PROCESSING" }),
    false,
  );
  assert.equal(
    merchantPricingAutomaticTranslationReady({ ...ready, completeLocaleCount: 19 }),
    false,
  );
  assert.equal(
    merchantPricingAutomaticTranslationReady({ ...ready, pendingItemCount: 1 }),
    false,
  );
});

test("polling terminal states stop at ready, applied, failed, or stale", () => {
  const base = {
    runId: "run-1",
    modelDisplayName: "Automatic",
    completeLocaleCount: 0,
    localeCount: 20,
    pendingItemCount: 19,
    failedItemCount: 0,
    failureCode: null,
  };
  assert.equal(merchantPricingAutomaticTranslationTerminal({ ...base, status: "PENDING" }), false);
  assert.equal(merchantPricingAutomaticTranslationTerminal({ ...base, status: "PROCESSING" }), false);
  for (const status of ["READY_TO_APPLY", "APPLIED", "FAILED", "STALE"] as const) {
    assert.equal(merchantPricingAutomaticTranslationTerminal({ ...base, status }), true);
  }
});

test("durable draft saving accepts active, ready-to-apply, and failed runs but not stale/applied runs", () => {
  const base = {
    runId: "run-1",
    modelDisplayName: "Automatic",
    completeLocaleCount: 1,
    localeCount: 20,
    pendingItemCount: 19,
    failedItemCount: 0,
    failureCode: null,
  };
  for (const status of ["PENDING", "PROCESSING", "READY_TO_APPLY", "FAILED"] as const) {
    assert.equal(
      merchantPricingAutomaticTranslationCanPersistDraft({ ...base, status }),
      true,
    );
  }
  for (const status of ["STALE", "APPLIED"] as const) {
    assert.equal(
      merchantPricingAutomaticTranslationCanPersistDraft({ ...base, status }),
      false,
    );
  }
});
