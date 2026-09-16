import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("Admin exposes only the guarded manual settlement mutation", async () => {
  const source = await readFile(path.join(root, "src/lib/admin/recovery-credit-refund-settlement.ts"), "utf8");
  const actions = await readFile(path.join(root, "src/app/actions/recovery-credit-refunds.ts"), "utf8");
  const legacyLock = ["lockRecoveryCredit", "Refund"].join("");
  const legacyReject = ["rejectRecoveryCredit", "Refund"].join("");
  assert.equal(source.includes(legacyLock), false);
  assert.equal(source.includes(legacyReject), false);
  assert.match(source, /requirePlatformAdminMutation\(\)/);
  assert.match(source, /principal\.role !== "SUPER_ADMIN"/);
  assert.match(source, /Prisma\.TransactionIsolationLevel\.Serializable/);
  assert.match(source, /status !== RecoveryCreditRefundStatus\.PROVIDER_ACTION_REQUIRED/);
  assert.match(source, /automaticCorrectionUsageEventId !== null/);
  assert.match(source, /RecoveryCreditPurchaseStatus\.WITHDRAWN/);
  assert.match(source, /purchase\.reservedAmount !== 0/);
  assert.match(source, /finalCreditQuantity === null/);
  assert.match(source, /expectedProviderAmount === null/);
  assert.match(source, /status: RecoveryCreditRefundStatus\.NEEDS_ATTENTION/);
  assert.match(source, /status: RecoveryCreditRefundStatus\.COMPLETED/);
  assert.doesNotMatch(source, /UsageEvent\.create|refundCreate|shopify\.admin/);
  assert.equal(source.toLowerCase().includes(["mark", " complete"].join("")), false);
  const legacyLockAction = [legacyLock, "Action"].join("");
  const legacyRejectAction = [legacyReject, "Action"].join("");
  assert.equal(actions.includes(legacyLockAction), false);
  assert.equal(actions.includes(legacyRejectAction), false);
});

test("manual evidence preserves exact-once entitlement, audit, and system-message completion", async () => {
  const source = await readFile(path.join(root, "src/lib/admin/recovery-credit-refund-settlement.ts"), "utf8");
  assert.match(source, /providerAmount\.eq\(refund\.expectedProviderAmount\)/);
  assert.match(source, /providerCurrency !== refund\.expectedProviderCurrency/);
  assert.match(source, /status: RecoveryCreditPurchaseStatus\.REFUNDED/);
  assert.match(source, /refundingQuantity: \{ decrement: quantity \}/);
  assert.match(source, /grantedQuantity: \{ decrement: quantity \}/);
  assert.match(source, /BillingAuditAction\.RECOVERY_CREDIT_REFUND/);
  assert.match(source, /skipDuplicates: true/);
  assert.match(source, /BILLING_SYSTEM_MESSAGE_CODES\.REFUND_COMPLETED/);
  assert.doesNotMatch(source, /RecoveryCreditRefundStatus\.NEEDS_ATTENTION\]}/);
});