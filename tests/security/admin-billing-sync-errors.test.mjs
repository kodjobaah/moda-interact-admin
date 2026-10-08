import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test } from "node:test";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relativePath) => readFile(path.join(repositoryRoot, relativePath), "utf8");

test("billing overview sync-error KPI opens an actionable queue", async () => {
  const [overview, page, tabs, component] = await Promise.all([
    read("src/components/admin/billing-overview.tsx"),
    read("src/app/(protected)/billing/page.tsx"),
    read("src/components/admin/billing-tabs.tsx"),
    read("src/components/admin/billing-sync-errors.tsx"),
  ]);

  assert.match(overview, /href="\/billing\?view=sync-errors"/);
  assert.match(overview, /Review and reconcile/);
  assert.match(page, /getBillingSyncErrors/);
  assert.match(page, /<BillingSyncErrors subscriptions=\{syncErrors\} params=\{params\}/);
  assert.match(tabs, /"sync-errors"/);
  assert.match(component, /lastSyncErrorCode/);
  assert.match(component, /nextReconcileAt/);
  assert.match(component, /Review tenant billing/);
});

test("sync-error reconciliation is privileged, durable, audited, and does not clear the error", async () => {
  const [action, reader] = await Promise.all([
    read("src/app/actions/billing-sync-errors.ts"),
    read("src/lib/admin/billing-sync-errors.ts"),
  ]);

  assert.match(action, /requirePlatformAdminMutation\(\)/);
  assert.match(action, /principal\.role !== "SUPER_ADMIN"/);
  assert.match(action, /SubscriptionProjectionStatus\.SYNC_ERROR/);
  assert.match(action, /canRequestBillingSyncReconciliation/);
  assert.match(reader, /PARTNER_API_ERROR/);
  assert.match(reader, /RETRYABLE_PROVIDER_SYNC_ERROR_CODES/);
  assert.match(action, /nextReconcileAt: requestedAt/);
  assert.match(action, /BillingAuditAction\.BILLING_CORRECTION_CREATED/);
  assert.match(action, /SubscriptionSyncReconciliationRequest/);
  assert.doesNotMatch(action, /status:\s*SubscriptionProjectionStatus\.(ACTIVE|TRIALING)/);
  assert.doesNotMatch(action, /lastSyncErrorCode:\s*null/);
  assert.match(reader, /requirePlatformAdminRead\(\)/);
  assert.match(reader, /status: SubscriptionProjectionStatus\.SYNC_ERROR/);
  assert.match(reader, /canRequestReconciliation/);
});
