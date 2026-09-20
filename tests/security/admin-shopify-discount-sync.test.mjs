import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const action = readFileSync(resolve(root, "src/app/actions/tenant.ts"), "utf8");
const queue = readFileSync(resolve(root, "src/lib/admin/shopify-discount-sync.ts"), "utf8");
const recovery = readFileSync(resolve(root, "src/components/admin/tenant-recovery-settings.tsx"), "utf8");
const syncForm = readFileSync(resolve(root, "src/components/admin/tenant-discount-catalogue-sync-form.tsx"), "utf8");
const runtime = readFileSync(resolve(root, "src/components/admin/background-runtime-controls.tsx"), "utf8");
const data = readFileSync(resolve(root, "src/lib/admin/data.ts"), "utf8");

test("manual Shopify discount sync is SUPER_ADMIN-only, audited, and queue-backed", () => {
  assert.match(action, /requestTenantShopifyDiscountSyncAction/);
  assert.match(action, /runProtectedTenantAction\(formData, requireSuperAdmin/);
  assert.match(action, /admin\.tenant\.shopify_discount_sync_requested/);
  assert.match(action, /admin\.tenant\.shopify_discount_sync_request_failed/);
  assert.match(queue, /reason: "ADMIN_REQUESTED"/);
  assert.match(queue, /SHOPIFY_DISCOUNT_SYNC\.queueName/);
  assert.match(queue, /SHOPIFY_DISCOUNT_SYNC\.jobName/);
  assert.match(queue, /createShopifyDiscountSyncJobId/);
  assert.match(queue, /attempts: 3/);
  assert.match(queue, /removeOnComplete: true/);
  assert.doesNotMatch(queue, /accessToken|SHOPIFY_API_SECRET|providerSnapshot/);
});

test("tenant recovery UI exposes catalogue lifecycle, counts, queue link, and manual sync", () => {
  assert.match(recovery, /Shopify discount catalogue/);
  assert.match(recovery, /Known discounts/);
  assert.match(recovery, /Running now/);
  assert.match(recovery, /Fixed selectable/);
  assert.match(syncForm, /Sync now/);
  assert.match(syncForm, /Retry sync/);
  assert.match(syncForm, /useFormStatus/);
  assert.match(syncForm, /disabled=\{pending\}/);
  assert.match(syncForm, /dataset\.submitting/);
  assert.match(syncForm, /Queueing…/);
  assert.match(recovery, /\/observability\/queues/);
  assert.match(data, /syncRequestedAt/);
  assert.match(data, /syncStartedAt/);
  assert.match(data, /lastErrorCode/);
  assert.match(data, /knownDiscountCount/);
});

test("background runtime explains event-driven discount sync without pretending it is mutable", () => {
  assert.match(runtime, /Shopify discount catalogue synchronisation/);
  assert.match(runtime, /Event driven/);
  assert.match(runtime, /shopify-discount-sync/);
  assert.match(runtime, /reconcile-shopify-discounts/);
  assert.match(runtime, /moda-recovery-worker/);
  assert.match(runtime, /Consumer concurrency/);
  assert.match(runtime, /Admin requested/);
});
