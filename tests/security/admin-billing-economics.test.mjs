import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { test } from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const action = readFileSync(resolve(root, "src/app/actions/billing-economics.ts"), "utf8");
const validation = readFileSync(resolve(root, "src/lib/admin/billing-economics-validation.ts"), "utf8");
const policyValidation = readFileSync(resolve(root, "src/lib/admin/billing-control-validation.ts"), "utf8");
const controls = readFileSync(resolve(root, "src/components/admin/billing-controls.tsx"), "utf8");
const policyAction = readFileSync(resolve(root, "src/app/actions/billing-controls.ts"), "utf8");

test("economics mutations are SUPER_ADMIN-only and use durable plan ids", () => {
  assert.match(action, /requirePlatformAdminMutation/);
  assert.match(action, /principal\.role !== "SUPER_ADMIN"/);
  assert.match(action, /billingPlan\.findUnique/);
  assert.match(action, /billingUpgradeEconomicsEdge\.create/);
  assert.match(action, /billingEconomicsSnapshot\.create/);
});

test("policy threshold is bounded and persisted through the existing policy action", () => {
  assert.match(policyValidation, /minimumUpgradePremiumBps/);
  assert.match(policyValidation, /10_000/);
  assert.match(policyAction, /minimumUpgradePremiumBps: values\.minimumUpgradePremiumBps/);
  assert.match(controls, /name="minimumUpgradePremiumBps"/);
});

test("edge and snapshot actions enforce drift, append-only evidence, and safe pricing input", () => {
  assert.match(action, /lowerPlanId === values\.higherPlanId/);
  assert.match(action, /lowerEdge\?\.active \|\| higherEdge\?\.active/);
  assert.match(action, /higherAllowance <= lowerAllowance/);
  assert.match(action, /Shopify plan handle does not match/);
  assert.match(action, /Recovery-credit pack size does not match/);
  assert.match(action, /billingEconomicsSnapshot\.create/);
  assert.doesNotMatch(action, /appSubscriptionCreate|appPurchaseOneTimeCreate|shopify.*mutation/i);
  assert.doesNotMatch(action, /token|secret|password|accessToken/i);
  assert.match(validation, /Only the final usage pricing tier may be open-ended/);
  assert.match(validation, /unsupported fields/);
});

test("the UI labels snapshots as verified evidence and exposes exact edge controls", () => {
  assert.match(controls, /Verified Shopify App Pricing economics used by Moda&apos;s Admin guardrail/);
  assert.match(controls, /Shopify remains the charging authority/);
  assert.match(controls, /mutateUpgradeEdgeAction/);
  assert.match(controls, /recordEconomicsSnapshotAction/);
});
