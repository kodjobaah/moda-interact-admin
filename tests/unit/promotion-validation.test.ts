import assert from "node:assert/strict";
import test from "node:test";

import {
  parsePromotionCampaignForm,
  validatePromotionTarget,
} from "../../src/lib/admin/promotion-validation.ts";

function form(values: Record<string, string>): FormData {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) result.set(key, value);
  return result;
}

const common = {
  intent: "create",
  name: "Spring recovery offer",
  quantity: "10",
  startsAt: "2026-10-01T09:00",
  expiresAt: "2026-10-31T09:00",
};

test("GLOBAL campaigns reject target ids", () => {
  assert.throws(
    () => validatePromotionTarget("GLOBAL", "plan-1", null),
    /target does not match/i,
  );
  assert.doesNotThrow(() => parsePromotionCampaignForm(form({ ...common, scope: "GLOBAL" })));
});

test("PLAN and SHOP campaigns require exactly one durable target", () => {
  assert.throws(
    () => parsePromotionCampaignForm(form({ ...common, scope: "PLAN" })),
    /target does not match/i,
  );
  assert.throws(
    () => parsePromotionCampaignForm(form({ ...common, scope: "SHOP", targetPlanId: "plan-1", targetShopId: "shop-1" })),
    /target does not match/i,
  );
  assert.doesNotThrow(() => parsePromotionCampaignForm(form({ ...common, scope: "SHOP", targetShopId: "shop-1" })));
});

test("quantity and campaign window are validated server-side", () => {
  assert.throws(
    () => parsePromotionCampaignForm(form({ ...common, scope: "GLOBAL", quantity: "0" })),
    /positive integer/i,
  );
  assert.throws(
    () => parsePromotionCampaignForm(form({ ...common, scope: "GLOBAL", expiresAt: "2026-09-01T09:00" })),
    /after the start/i,
  );
});