import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const action = readFileSync(resolve(root, "src/app/actions/tenant.ts"), "utf8");
const component = readFileSync(resolve(root, "src/components/admin/tenant-administration.tsx"), "utf8");
const clearComponent = readFileSync(resolve(root, "src/components/admin/tenant-recovery-policy-clear-form.tsx"), "utf8");
const data = readFileSync(resolve(root, "src/lib/admin/data.ts"), "utf8");

test("tenant recovery overrides are SUPER_ADMIN-only, complete, and audited", () => {
  assert.match(action, /requirePlatformAdminMutation/);
  assert.match(action, /SUPER_ADMIN access is required/);
  assert.match(action, /shopRecoveryPolicyOverrideAuditEvent\.create/);
  assert.match(action, /beforeValue/);
  assert.match(action, /afterValue/);
  assert.match(action, /updatedByPlatformAdminId/);
  assert.match(action, /getAll\('followUpEnabled'\)/);
  assert.match(action, /Recovery delay is required/);
  assert.match(action, /ensureDevelopmentPlatformAdmin\(transaction, principal\)/);
  assert.match(action, /transaction\.platformAdmin\.findUnique/);
  assert.match(action, /expiresAt/);
  assert.match(action, /ShopifyDiscountId/);
  assert.doesNotMatch(action, /shopSettings\.upsert/);
  assert.doesNotMatch(action, /recoveryDelayMinutes.*update/);
});

test("tenant UI shows merchant, override, effective, catalogue, and clear surfaces", () => {
  assert.match(component, /Merchant configured/);
  assert.match(component, /Admin override/);
  assert.match(component, /Effective/);
  assert.match(component, /lastSuccessfulSyncAt|Last successful sync/);
  assert.match(clearComponent, /Clear override/);
  assert.match(clearComponent, /window\.confirm/);
  assert.doesNotMatch(component, /<form[\s\S]*<form/);
  assert.match(component, /AI_BEST_APPLICABLE/);
  assert.match(data, /fixedSelectable/);
  assert.match(data, /lastSuccessfulSyncAt/);
  assert.match(data, /providerStatus: "ACTIVE"/);
  assert.match(data, /status === "CURRENT"/);
  assert.doesNotMatch(component, /providerSnapshot|accessToken|secret/);
});