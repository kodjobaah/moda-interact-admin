import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readTenantOnboardingCompleted } from "../../src/lib/admin/tenant-onboarding.ts";

test("Shopify tenant onboarding reads the shared milestone with settings present", () => {
  const shop = {
    onboardingCompleted: true,
    settings: { onboardingCompleted: false },
  };
  assert.equal(
    readTenantOnboardingCompleted(shop),
    true,
  );
});

test("Woo tenant onboarding reads the shared milestone without Shopify settings", () => {
  assert.equal(readTenantOnboardingCompleted({ onboardingCompleted: false }), false);
  assert.equal(readTenantOnboardingCompleted({ onboardingCompleted: true }), true);
});

test("tenant detail selects and maps the shared Shop onboarding milestone", () => {
  const source = readFileSync(new URL("../../src/lib/admin/data.ts", import.meta.url), "utf8");
  const tenantDetail = source.slice(source.indexOf("export async function getTenantDetail"));

  assert.match(tenantDetail, /onboardingCompleted:\s*true/);
  assert.match(tenantDetail, /onboardingCompleted:\s*readTenantOnboardingCompleted\(row\)/);
  assert.doesNotMatch(tenantDetail, /settings\?\.onboardingCompleted/);
});