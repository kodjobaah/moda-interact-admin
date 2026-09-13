import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const action = fs.readFileSync(path.join(root, "src/app/actions/promotions.ts"), "utf8");
const validation = fs.readFileSync(path.join(root, "src/lib/admin/promotion-validation.ts"), "utf8");
const page = fs.readFileSync(path.join(root, "src/app/(protected)/promotions/page.tsx"), "utf8");

test("promotion mutations are SUPER_ADMIN-only and use the platform admin guard", () => {
  assert.match(action, /requirePlatformAdminMutation/);
  assert.match(action, /principal\.role !== "SUPER_ADMIN"/);
  assert.match(page, /requirePlatformAdminPage/);
});

test("campaign validation enforces all three exclusive target shapes", () => {
  assert.match(validation, /scope === "GLOBAL" && !targetPlanId && !targetShopId/);
  assert.match(validation, /scope === "PLAN" && Boolean\(targetPlanId\) && !targetShopId/);
  assert.match(validation, /scope === "SHOP" && !targetPlanId && Boolean\(targetShopId\)/);
  assert.match(action, /billingPlan\.findUnique/);
  assert.match(action, /shop\.findUnique/);
});

test("activation re-reads drafts, writes ACTIVATED evidence, and freezes terms", () => {
  assert.match(action, /status !== PromotionCampaignStatus\.DRAFT/);
  assert.match(action, /kind: PromotionCampaignEventType\.ACTIVATED/);
  assert.match(action, /Activated campaign terms are immutable/);
  assert.match(action, /version: \{ increment: 1 \}/);
});

test("campaign activation never grants merchant credits or mutates selection capacity", () => {
  assert.doesNotMatch(action, /promotionalCreditGrant\.(create|createMany|upsert)/);
  assert.doesNotMatch(action, /merchantPromotionSelection\.(create|createMany|upsert)/);
  assert.doesNotMatch(action, /entitlementCounter\.(update|upsert|create)/);
  assert.doesNotMatch(action, /appEvent|shopify/i);
});

test("campaign history records creation and the UI exposes draft editing only", () => {
  assert.match(action, /kind: PromotionCampaignEventType\.CREATED/);
  assert.match(page, /campaign\.status === "DRAFT"/);
  assert.match(page, /Create optional merchant offers/);
});