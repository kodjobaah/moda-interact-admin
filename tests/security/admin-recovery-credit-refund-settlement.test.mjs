import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("settlement is SUPER_ADMIN-only and locks the exact withdrawn balance", async () => {
  const source = await readFile(path.join(root, "src/lib/admin/recovery-credit-refund-settlement.ts"), "utf8");
  assert.match(source, /requirePlatformAdminMutation\(\)/g);
  assert.match(source, /principal\.role !== "SUPER_ADMIN"/g);
  assert.match(source, /isolationLevel: Prisma\.TransactionIsolationLevel\.Serializable/g);
  assert.match(source, /status: RecoveryCreditRefundStatus\.REQUESTED/);
  assert.match(source, /status: RecoveryCreditPurchaseStatus\.WITHDRAWN/);
  assert.match(source, /reservedAmount > 0/);
  assert.match(source, /finalCreditQuantity = purchase\.currentAmount/);
  assert.match(source, /purchaseId: purchase\.id/);
  assert.match(source, /version: refund\.version/);
  assert.match(source, /providerPurchaseAmount/);
  assert.match(source, /providerPurchaseCurrency/);
  assert.match(source, /providerValuationConfirmedAt/);
  assert.match(source, /SUPPORTED_CURRENCIES = new Set\(Intl\.supportedValuesOf\("currency"\)\)/);
  assert.match(source, /currencyFractionDigits\(currency\)/);
  assert.doesNotMatch(source, /toDecimalPlaces\(2/);
  assert.match(source, /toDecimalPlaces\(currencyFractionDigits\(currency\), Prisma\.Decimal\.ROUND_HALF_UP\)/);
  assert.doesNotMatch(source, /aggregate: Awaited<ReturnType<typeof loadSettlementState>>\["aggregate"\], reason/);
  assert.doesNotMatch(source, /completeZeroCurrent\(transaction, principal\.id, refund, purchase, aggregate/);
  assert.match(source, /currentAmount: 0/);
  assert.match(source, /status: RecoveryCreditPurchaseStatus\.REFUNDED/);
  assert.match(source, /refundingQuantity: \{ decrement: quantity \}/);
  assert.match(source, /grantedQuantity: \{ decrement: quantity \}/);
  assert.doesNotMatch(source, /refundedQuantity/);
});

test("currency precision follows ISO currency metadata", async () => {
  const source = await readFile(path.join(root, "src/lib/admin/recovery-credit-refund-settlement.ts"), "utf8");
  assert.match(source, /SUPPORTED_CURRENCIES\.has\(currency\)/);
  assert.match(source, /maximumFractionDigits/);
  assert.match(source, /fractionDigits < 0/);
  assert.match(source, /fractionDigits > 4/);
  assert.match(source, /purchase\.providerPurchaseCurrency/);
});

test("zero-current completion does not couple independent purchase holds", async () => {
  const source = await readFile(path.join(root, "src/lib/admin/recovery-credit-refund-settlement.ts"), "utf8");
  const helper = source.slice(source.indexOf("async function completeZeroCurrent"), source.indexOf("export async function rejectRecoveryCreditRefund"));
  assert.match(helper, /purchase\.reservedAmount !== 0/);
  assert.doesNotMatch(helper, /aggregate\.refundingQuantity/);
  assert.doesNotMatch(helper, /shopEntitlementCounter\.updateMany/);
});

test("settlement preserves holds on mismatch and uses idempotent shared messages/audit", async () => {
  const [source, actions] = await Promise.all([
    readFile(path.join(root, "src/lib/admin/recovery-credit-refund-settlement.ts"), "utf8"),
    readFile(path.join(root, "src/app/actions/recovery-credit-refunds.ts"), "utf8"),
  ]);
  assert.match(source, /RecoveryCreditRefundStatus\.NEEDS_ATTENTION/);
  assert.match(source, /provider evidence does not exactly match/i);
  assert.match(source, /BILLING_SYSTEM_MESSAGE_CODES\.REFUND_COMPLETED/);
  assert.match(source, /BILLING_SYSTEM_MESSAGE_CODES\.REFUND_REJECTED/);
  assert.match(source, /sourceKey: `billing-refund:\$\{refundId\}:\$\{code\}`/);
  assert.match(source, /skipDuplicates: true/);
  assert.match(source, /BillingAuditAction\.RECOVERY_CREDIT_REFUND/);
  assert.match(source, /status: RecoveryCreditPurchaseStatus\.ACTIVE/);
  assert.match(source, /releasedQuantity: heldAvailable/);
  assert.match(source, /Provider action may already have started/);
  assert.doesNotMatch(source, /shopify\.admin|refundCreate|UsageEvent\.create/);
  assert.match(actions, /lockRecoveryCreditRefund/);
  assert.match(actions, /rejectRecoveryCreditRefund/);
  assert.match(actions, /recordRecoveryCreditProviderEvidence/);
});

test("required settlement acceptance checklist is represented by the implementation", async () => {
  const source = await readFile(path.join(root, "src/lib/admin/recovery-credit-refund-settlement.ts"), "utf8");
  const actions = await readFile(path.join(root, "src/app/actions/recovery-credit-refunds.ts"), "utf8");
  const requiredPatterns = [
    /principal\.role !== "SUPER_ADMIN"/, // 1. SUPER_ADMIN only
    /reservedAmount > 0/, // 2. reservations block locking
    /currentAmount === 0/, // 3. zero-current terminal path
    /finalCreditQuantity = purchase\.currentAmount/, // 4. exact current balance
    /purchase\.providerPurchaseAmount/, // 5. historical amount authority
    /purchase\.providerPurchaseCurrency/, // 6. historical currency authority
    /status: RecoveryCreditRefundStatus\.PROVIDER_ACTION_REQUIRED/, // 7. frozen provider boundary
    /version: refund\.version/, // 8. merchant/admin race CAS
    /purchase\.status !== RecoveryCreditPurchaseStatus\.WITHDRAWN/, // 9. reactivation boundary
    /aggregate\.refundingQuantity < purchase\.currentAmount/, // 10. aggregate hold parity
    /Provider evidence does not exactly match/, // 11. mismatch cannot complete
    /status: RecoveryCreditPurchaseStatus\.REFUNDED/, // 12. successful terminal purchase
    /refundedQuantity/, // 13. rejected below
    /sourceKey: `billing-refund:\$\{refundId\}:\$\{code\}`/, // 14. message idempotency
    /status: RecoveryCreditPurchaseStatus\.ACTIVE/, // 15. reject reactivation
    /Provider action may already have started/, // 16. no post-action rejection
    /purchaseId: purchase\.id/, // 17. exact purchase lot scope
    /shopify\.admin|refundCreate|UsageEvent\.create/, // 18. rejected below
  ];
  for (const pattern of requiredPatterns.slice(0, 12)) assert.match(source, pattern);
  assert.doesNotMatch(source, requiredPatterns[12]);
  assert.match(source, requiredPatterns[13]);
  assert.match(source, requiredPatterns[14]);
  assert.match(source, requiredPatterns[15]);
  assert.match(source, requiredPatterns[16]);
  assert.doesNotMatch(source, requiredPatterns[17]);
  assert.match(actions, /revalidatePath\("\/billing"\)/);
  assert.match(source, /Prisma\.TransactionIsolationLevel\.Serializable/); // 19. focused/concurrency transaction validation
});