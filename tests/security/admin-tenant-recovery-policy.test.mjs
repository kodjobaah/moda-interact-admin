import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const action = readFileSync(resolve(root, "src/app/actions/tenant.ts"), "utf8");
const component = readFileSync(
  resolve(root, "src/components/admin/tenant-recovery-settings.tsx"),
  "utf8",
);
const clearComponent = readFileSync(
  resolve(root, "src/components/admin/tenant-recovery-policy-clear-form.tsx"),
  "utf8",
);
const data = readFileSync(resolve(root, "src/lib/admin/data.ts"), "utf8");
const catalogueRead = readFileSync(
  resolve(root, "src/lib/admin/discount-catalogue.ts"),
  "utf8",
);
const eligibility = readFileSync(
  resolve(root, "src/lib/admin/discount-eligibility.ts"),
  "utf8",
);
const overrideService = readFileSync(
  resolve(root, "src/lib/admin/recovery-policy-override.ts"),
  "utf8",
);

test("tenant recovery overrides are SUPER_ADMIN-only, complete, and audited", () => {
  assert.match(action, /requirePlatformAdminMutation/);
  assert.match(action, /SUPER_ADMIN access is required/);
  assert.match(action, /ensureDevelopmentPlatformAdmin\(transaction, principal\)/);
  assert.match(action, /transaction\.platformAdmin\.findUnique/);
  assert.match(action, /getAll\(["']followUpEnabled["']\)/);
  assert.match(action, /Recovery delay is required/);
  assert.match(action, /expiresAt/);
  assert.match(action, /ShopifyDiscountId/);
  assert.match(data, /platform: true/);
  assert.match(action, /saveTenantRecoveryPolicyOverride/);
  assert.match(overrideService, /isAdminDiscountAssignable/);
  assert.match(overrideService, /shopRecoveryPolicyOverrideAuditEvent\.create/);
  assert.match(overrideService, /beforeValue/);
  assert.match(overrideService, /afterValue/);
  assert.match(overrideService, /updatedByPlatformAdminId/);
  assert.match(overrideService, /id: input\.policy\.fixedShopifyDiscountId,[\s\S]*?shopId: input\.shopId/);
  assert.match(
    overrideService,
    /isolationLevel: Prisma\.TransactionIsolationLevel\.Serializable/,
  );
  assert.doesNotMatch(action, /shopSettings\.upsert/);
  assert.doesNotMatch(action, /recoveryDelayMinutes.*update/);
});

test("tenant UI shows merchant, override, effective, catalogue, and clear surfaces", () => {
  assert.match(component, /Merchant configured/);
  assert.match(component, /Admin override/);
  assert.match(component, /tenant\.effective|effectiveRecoveryPolicy/);
  assert.match(component, /lastSuccessfulSyncAt|Last successful sync/);
  assert.match(clearComponent, /Clear override/);
  assert.match(clearComponent, /window\.confirm/);
  assert.doesNotMatch(component, /<form[\s\S]*<form/);
  assert.match(component, /AI_BEST_APPLICABLE/);
  assert.match(data, /readAdminDiscountCatalogue/);
  assert.match(catalogueRead, /fixedSelectable/);
  assert.match(data, /lastSuccessfulSyncAt/);
  assert.match(eligibility, /providerStatus !== "ACTIVE"/);
  assert.match(eligibility, /catalogueStatus !== "CURRENT"/);
  assert.match(data, /platform: true/);
  assert.match(catalogueRead, /isAdminDiscountAssignable/);
  assert.match(eligibility, /lastSeenSyncGeneration !== catalogueGeneration/);
  assert.match(eligibility, /unavailableAt !== null/);
  assert.match(eligibility, /woo:coupon:/);
  assert.match(eligibility, /WooCoupon:/);
  assert.match(eligibility, /platform === "SHOPIFY"/);
  assert.match(component, /Merchant selection/);
  assert.match(component, /discount\.isAvailable \? "Selected" : "Not selected"/);
  assert.match(eligibility, /!discount\.shopifyDiscountNodeId\.startsWith\("woo:"\)/);
  assert.match(eligibility, /!discount\.providerType\.startsWith\("WooCoupon:"\)/);
  assert.doesNotMatch(component, /providerSnapshot|accessToken|secret/);
});
