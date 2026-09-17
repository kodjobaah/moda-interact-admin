import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("MerchantPricing economics overrides are server-authoritative, fingerprinted, and fail closed", async () => {
  const action = await source("src/app/actions/merchant-pricing-plan.ts");
  const policy = await source(
    "src/lib/admin/merchant/pricing-economics-override.ts",
  );
  const fingerprint = await source(
    "src/lib/admin/merchant/pricing-economics-override.server.ts",
  );

  assert.match(action, /economicsOverrideRequested/);
  assert.match(action, /economicsOverrideReason/);
  assert.match(action, /assessMerchantPricingEconomicsOverride/);
  assert.match(action, /createMerchantPricingEconomicsOverrideFingerprint/);
  assert.match(action, /assertDurableSuperAdmin/);
  assert.match(action, /durableAdmin\.role !== "SUPER_ADMIN"/);
  assert.match(action, /economicsOverrideFailureCodes/);
  assert.match(action, /economicsOverrideFingerprint/);
  assert.match(action, /persistedOverrideMatchesProjection/);
  assert.match(action, /requires a current economics override approval/);
  assert.match(action, /UPGRADE_ECONOMICS_EVALUATED/);
  assert.match(action, /auditEconomicsOverrideChange/);
  assert.match(action, /economicsOverrideSnapshot\(existing\)/);
  assert.match(action, /economicsOverrideSnapshot\(overrideUpdate\)/);

  assert.match(policy, /TOPUPS_CHEAPER_THAN_UPGRADE/);
  assert.match(policy, /UPGRADE_ADVANTAGE_TOO_SMALL/);
  assert.doesNotMatch(
    policy,
    /OVERRIDEABLE_ECONOMICS_CODES[\s\S]*NON_INCREASING_ALLOWANCE/,
  );

  assert.match(fingerprint, /createHash\("sha256"\)/);
  assert.match(fingerprint, /minimumUpgradePremiumBps/);
  assert.match(fingerprint, /failureCodes/);
  assert.match(fingerprint, /usageEvents/);
});

test("MerchantPricing schema carries durable economics override approval state", async () => {
  const schema = await source("database/prisma/schema.prisma");

  for (const field of [
    "economicsOverrideEnabled",
    "economicsOverrideReason",
    "economicsOverrideApprovedAt",
    "economicsOverrideApprovedByAdminId",
    "economicsOverrideFailureCodes",
    "economicsOverrideFingerprint",
  ]) {
    assert.match(schema, new RegExp(`\\b${field}\\b`));
  }
});
