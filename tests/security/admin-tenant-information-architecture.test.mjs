import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (file) => readFile(path.join(root, file), "utf8");

test("tenant details separate overview, recovery settings, logs, and billing", async () => {
  const [page, table, panel] = await Promise.all([
    read("src/app/(protected)/page.tsx"),
    read("src/components/admin/tenant-table.tsx"),
    read("src/components/admin/tenant-detail-panel.tsx"),
  ]);

  assert.match(page, /rawTab === "recovery"/);
  assert.match(table, /"admin" \| "recovery" \| "logs" \| "billing"/);
  assert.match(panel, /tenant\.overview/);
  assert.match(panel, /tenant\.recoverySettings/);
  assert.match(panel, /TenantRecoverySettings/);
  assert.match(panel, /TenantBillingView/);
});

test("overview keeps mutations behind progressive disclosure", async () => {
  const overview = await read("src/components/admin/tenant-administration.tsx");

  assert.match(overview, /<details/);
  assert.match(overview, /tenant\.changeShopStatus/);
  assert.doesNotMatch(overview, /TenantBillingControls/);
  assert.doesNotMatch(overview, /upsertTenantRecoveryPolicyOverrideAction/);
});

test("recovery settings present effective state before the override editor", async () => {
  const recovery = await read("src/components/admin/tenant-recovery-settings.tsx");

  assert.match(recovery, /tenant\.effectiveRecoveryPolicy/);
  assert.match(recovery, /policy\.effective\.source/);
  assert.match(recovery, /Merchant configured/);
  assert.match(recovery, /Admin override/);
  assert.match(recovery, /<details/);
  assert.match(recovery, /upsertTenantRecoveryPolicyOverrideAction/);
  assert.match(recovery, /TenantRecoveryPolicyClearForm/);
});

test("shop billing controls live in Billing overview and hide the mutation form by default", async () => {
  const [billing, controls] = await Promise.all([
    read("src/components/admin/tenant-billing.tsx"),
    read("src/components/admin/billing-controls.tsx"),
  ]);

  assert.match(billing, /TenantBillingControls/);
  assert.match(billing, /billingView === "overview"/);
  assert.match(controls, /Edit shop billing controls/);
  assert.match(controls, /<details/);
  assert.match(controls, /allowanceTitle/);
});
