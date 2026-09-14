import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("refund triage is an authorized bounded read model", async () => {
  const source = await readFile(path.join(root, "src/lib/admin/recovery-credit-refunds.ts"), "utf8");
  assert.match(source, /requirePlatformAdminRead\(\)/);
  assert.match(source, /prisma\.recoveryCreditRefund\.count\(\{ where \}\)/);
  assert.match(source, /skip: \(page - 1\) \* pageSize/);
  assert.match(source, /take: pageSize/);
  assert.match(source, /MAX_PAGE_SIZE = 50/);
  assert.match(source, /pageSize \?\? RECOVERY_CREDIT_REFUND_PAGE_SIZE/);
  assert.match(source, /status: RecoveryCreditRefundStatus\.REQUESTED/);
  assert.match(source, /reservedAmount: 0/);
  assert.match(source, /reservedAmount: \{ gt: 0 \}/);
  assert.match(source, /currentAmount: \{ gt: 0 \}/);
  assert.match(source, /purchasedReservations:/);
  assert.match(source, /status === "NEEDS_ATTENTION"/);
  assert.match(source, /status: RecoveryCreditRefundStatus\.NEEDS_ATTENTION/);
  assert.match(
    source,
    /in: \[\s*RecoveryCreditPurchaseStatus\.REQUESTED,\s*RecoveryCreditPurchaseStatus\.ACTIVE,\s*RecoveryCreditPurchaseStatus\.COMPLETED,\s*RecoveryCreditPurchaseStatus\.REFUNDED,\s*\]/s,
  );
  assert.match(source, /currentAmount: \{ lte: 0 \}/);
  assert.match(source, /reservedAmount: 0/);
  assert.match(source, /take: 20/);
  assert.match(source, /refunds:/);
  assert.match(source, /reason: true, finalCreditQuantity: true/);
  assert.doesNotMatch(source, /update\(|create\(|delete\(|creditsRequested|creditsApproved|percentage/);
});

test("refund triage UI preserves merchant-created requests and exact-lot authority", async () => {
  const [component, page] = await Promise.all([
    readFile(path.join(root, "src/components/admin/recovery-credit-refunds.tsx"), "utf8"),
    readFile(path.join(root, "src/app/(protected)/billing/page.tsx"), "utf8"),
  ]);
  assert.match(page, /getRecoveryCreditRefunds/);
  assert.match(page, /getRecoveryCreditRefundDetail/);
  assert.match(component, /WAITING_FOR_RESERVATIONS/);
  assert.match(component, /READY_FOR_PROVIDER_ACTION/);
  assert.match(component, /must not start yet/);
  assert.match(component, /Final credit quantity will be locked/);
  assert.match(component, /Current amount at request/);
  assert.match(component, /Current purchase amount/);
  assert.match(component, /Billing period/);
  assert.match(component, /Usage quantity before/);
  assert.match(component, /Usage cost after/);
  assert.match(component, /Support context message/);
  assert.match(component, /provider amount not recorded/);
  assert.match(component, /current plan or top-up price is evidence only and is not refund authority/i);
  assert.match(component, /does not calculate, approve, or settle/);
  assert.doesNotMatch(component, /type="number"|type="money"|percentage|creditsRequested|creditsApproved/);
});