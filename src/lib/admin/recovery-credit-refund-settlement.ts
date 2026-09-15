import {
  BillingAuditAction,
  EntitlementCounter,
  Prisma,
  RecoveryCreditPurchaseStatus,
  RecoveryCreditProviderActionKind,
  RecoveryCreditRefundStatus,
} from "@prisma/client";
import { BILLING_SYSTEM_MESSAGE_CODES } from "@modainteract/moda-interact-shared";
import { requirePlatformAdminMutation } from "@/lib/auth/platform-admin";
import { prisma } from "@/lib/prisma";

const MAX_REFERENCE_LENGTH = 512;
const MAX_REASON_LENGTH = 1000;
const CURRENCY = /^[A-Z]{3}$/;
const SUPPORTED_CURRENCIES = new Set(Intl.supportedValuesOf("currency"));
type Transaction = Prisma.TransactionClient;

function bounded(value: string, max: number, name: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) throw new Error(`${name} is invalid.`);
  return trimmed;
}

function currencyFractionDigits(currency: string): number {
  if (!CURRENCY.test(currency) || !SUPPORTED_CURRENCIES.has(currency)) {
    throw new Error("Provider currency is unsupported.");
  }
  const fractionDigits = new Intl.NumberFormat("en", {
    style: "currency",
    currency,
  }).resolvedOptions().maximumFractionDigits;
  if (fractionDigits === undefined || !Number.isInteger(fractionDigits) || fractionDigits < 0 || fractionDigits > 4) {
    throw new Error("Provider currency precision is unsupported.");
  }
  return fractionDigits;
}

function expectedAmount(
  amount: Prisma.Decimal,
  quantity: number,
  granted: number,
  currency: string,
): Prisma.Decimal {
  return amount
    .mul(quantity)
    .div(granted)
    .toDecimalPlaces(currencyFractionDigits(currency), Prisma.Decimal.ROUND_HALF_UP);
}

async function createSystemMessage(transaction: Transaction, shopId: string, refundId: string, code: string, body: string): Promise<void> {
  const thread = await transaction.merchantSupportThread.findUnique({ where: { shopId }, select: { id: true } });
  if (!thread) return;
  await transaction.merchantSupportMessage.createMany({
    data: [{ threadId: thread.id, kind: "SYSTEM", state: "AVAILABLE", originalBody: body, sourceLanguageTag: "en", displayLanguageTag: "en", systemCode: code, systemVersion: "1", sourceKey: `billing-refund:${refundId}:${code}`, availableAt: new Date() }],
    skipDuplicates: true,
  });
}

async function createAudit(transaction: Transaction, adminId: string, shopId: string, refundId: string, reason: string, beforeValue: Prisma.InputJsonValue, afterValue: Prisma.InputJsonValue): Promise<void> {
  const existing = await transaction.billingAuditEvent.findFirst({ where: { action: BillingAuditAction.RECOVERY_CREDIT_REFUND, relatedEntityId: refundId, reason }, select: { id: true } });
  if (!existing) await transaction.billingAuditEvent.create({ data: { action: BillingAuditAction.RECOVERY_CREDIT_REFUND, shopId, platformAdminId: adminId, reason, relatedEntityType: "RecoveryCreditRefund", relatedEntityId: refundId, beforeValue, afterValue } });
}

async function loadSettlementState(transaction: Transaction, refundId: string) {
  const refund = await transaction.recoveryCreditRefund.findUnique({ where: { id: refundId }, include: { purchase: true } });
  if (!refund || refund.shopId !== refund.purchase.shopId) throw new Error("Refund provenance is invalid.");
  const aggregate = await transaction.shopEntitlementCounter.findUnique({ where: { shopId_counter: { shopId: refund.shopId, counter: EntitlementCounter.PURCHASED_RECOVERY_CREDITS } } });
  if (!aggregate) throw new Error("Purchased-credit aggregate is missing.");
  return { refund, purchase: refund.purchase, aggregate };
}

function assertProvenance(purchase: Awaited<ReturnType<typeof loadSettlementState>>["purchase"]) {
  if (purchase.creditsGranted <= 0 || purchase.currentAmount <= 0 || purchase.currentAmount > purchase.creditsGranted || purchase.providerPurchaseAmount === null || !purchase.providerPurchaseCurrency || !CURRENCY.test(purchase.providerPurchaseCurrency) || !purchase.providerValuationConfirmedAt || !purchase.shopifyPlanHandleSnapshot || !purchase.shopifyEventHandleSnapshot || !purchase.providerSubscriptionIdSnapshot || !purchase.billingPeriodId || !purchase.usageEventId) throw new Error("Immutable purchase provenance is incomplete.");
}

export async function lockRecoveryCreditRefund(refundId: string, reason: string) {
  const principal = await requirePlatformAdminMutation();
  if (principal.role !== "SUPER_ADMIN") throw new Error("SUPER_ADMIN access is required.");
  const boundedReason = bounded(reason, MAX_REASON_LENGTH, "Reason");
  return prisma.$transaction(async (transaction) => {
    const { refund, purchase, aggregate } = await loadSettlementState(transaction, refundId);
    if (refund.status !== RecoveryCreditRefundStatus.REQUESTED) return { status: refund.status } as const;
    if (purchase.status !== RecoveryCreditPurchaseStatus.WITHDRAWN) throw new Error("Purchase is not withdrawn.");
    if (purchase.reservedAmount > 0) throw new Error("WAITING_FOR_RESERVATIONS");
    if (purchase.currentAmount === 0) return completeZeroCurrent(transaction, principal.id, refund, purchase, boundedReason);
    if (purchase.currentAmount < 0) throw new Error("Purchase balance is invalid.");
    assertProvenance(purchase);
    if (aggregate.grantedQuantity < 0 || aggregate.committedQuantity < 0 || aggregate.reservedQuantity < 0 || aggregate.refundingQuantity < purchase.currentAmount || aggregate.grantedQuantity < aggregate.committedQuantity + aggregate.reservedQuantity + aggregate.refundingQuantity) throw new Error("Aggregate purchased-credit parity is inconsistent.");
    const finalCreditQuantity = purchase.currentAmount;
    const expectedProviderAmount = expectedAmount(
      purchase.providerPurchaseAmount!,
      finalCreditQuantity,
      purchase.creditsGranted,
      purchase.providerPurchaseCurrency!,
    );
    const updated = await transaction.recoveryCreditRefund.updateMany({ where: { id: refund.id, status: RecoveryCreditRefundStatus.REQUESTED, version: refund.version, purchaseId: purchase.id }, data: { status: RecoveryCreditRefundStatus.PROVIDER_ACTION_REQUIRED, finalCreditQuantity, expectedProviderAmount, expectedProviderCurrency: purchase.providerPurchaseCurrency, approvedByPlatformAdminId: principal.id, approvedAt: new Date(), holdAppliedAt: new Date(), version: { increment: 1 }, reason: boundedReason } });
    if (updated.count !== 1) throw new Error("Refund changed while locking provider action.");
    return { status: RecoveryCreditRefundStatus.PROVIDER_ACTION_REQUIRED, finalCreditQuantity, expectedProviderAmount: expectedProviderAmount.toString(), expectedProviderCurrency: purchase.providerPurchaseCurrency };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function completeZeroCurrent(transaction: Transaction, adminId: string, refund: Awaited<ReturnType<typeof loadSettlementState>>["refund"], purchase: Awaited<ReturnType<typeof loadSettlementState>>["purchase"], reason: string) {
  if (purchase.reservedAmount !== 0) throw new Error("Purchase reservation parity is inconsistent.");
  const purchaseUpdate = await transaction.recoveryCreditPurchase.updateMany({ where: { id: purchase.id, status: RecoveryCreditPurchaseStatus.WITHDRAWN, version: purchase.version, currentAmount: 0, reservedAmount: 0 }, data: { status: RecoveryCreditPurchaseStatus.COMPLETED, version: { increment: 1 } } });
  const refundUpdate = await transaction.recoveryCreditRefund.updateMany({ where: { id: refund.id, status: RecoveryCreditRefundStatus.REQUESTED, version: refund.version }, data: { status: RecoveryCreditRefundStatus.COMPLETED, completedAt: new Date(), reason, version: { increment: 1 } } });
  if (purchaseUpdate.count !== 1 || refundUpdate.count !== 1) throw new Error("Refund changed while closing zero-current purchase.");
  await createAudit(transaction, adminId, refund.shopId, refund.id, reason, { status: refund.status }, { status: RecoveryCreditRefundStatus.COMPLETED, finalCreditQuantity: 0 });
  await createSystemMessage(transaction, refund.shopId, refund.id, BILLING_SYSTEM_MESSAGE_CODES.REFUND_COMPLETED, "Your recovery-credit refund request completed with no refundable credits remaining.");
  return { status: RecoveryCreditRefundStatus.COMPLETED, finalCreditQuantity: 0 } as const;
}

export async function rejectRecoveryCreditRefund(refundId: string, reason: string) {
  const principal = await requirePlatformAdminMutation();
  if (principal.role !== "SUPER_ADMIN") throw new Error("SUPER_ADMIN access is required.");
  const boundedReason = bounded(reason, MAX_REASON_LENGTH, "Reason");
  return prisma.$transaction(async (transaction) => {
    const { refund, purchase, aggregate } = await loadSettlementState(transaction, refundId);
    if (refund.status !== RecoveryCreditRefundStatus.REQUESTED) throw new Error("Provider action may already have started.");
    if (purchase.status !== RecoveryCreditPurchaseStatus.WITHDRAWN) throw new Error("Purchase is not withdrawn.");
    if (purchase.currentAmount === 0) return completeZeroCurrent(transaction, principal.id, refund, purchase, boundedReason);
    if (purchase.currentAmount < 0 || purchase.reservedAmount < 0 || purchase.reservedAmount > purchase.currentAmount) throw new Error("Purchase balance is invalid.");
    const heldAvailable = purchase.currentAmount - purchase.reservedAmount;
    if (aggregate.refundingQuantity < heldAvailable) throw new Error("Aggregate hold parity is inconsistent.");
    const purchaseUpdate = await transaction.recoveryCreditPurchase.updateMany({ where: { id: purchase.id, status: RecoveryCreditPurchaseStatus.WITHDRAWN, version: purchase.version, currentAmount: purchase.currentAmount, reservedAmount: purchase.reservedAmount }, data: { status: RecoveryCreditPurchaseStatus.ACTIVE, version: { increment: 1 } } });
    const aggregateUpdate = await transaction.shopEntitlementCounter.updateMany({ where: { id: aggregate.id, version: aggregate.version, refundingQuantity: { gte: heldAvailable } }, data: { refundingQuantity: { decrement: heldAvailable }, version: { increment: 1 } } });
    const refundUpdate = await transaction.recoveryCreditRefund.updateMany({ where: { id: refund.id, status: RecoveryCreditRefundStatus.REQUESTED, version: refund.version }, data: { status: RecoveryCreditRefundStatus.REJECTED, reason: boundedReason, version: { increment: 1 } } });
    if (purchaseUpdate.count !== 1 || aggregateUpdate.count !== 1 || refundUpdate.count !== 1) throw new Error("Refund changed while rejecting.");
    await createAudit(transaction, principal.id, refund.shopId, refund.id, boundedReason, { status: refund.status }, { status: RecoveryCreditRefundStatus.REJECTED, releasedQuantity: heldAvailable });
    await createSystemMessage(transaction, refund.shopId, refund.id, BILLING_SYSTEM_MESSAGE_CODES.REFUND_REJECTED, boundedReason);
    return { status: RecoveryCreditRefundStatus.REJECTED, releasedQuantity: heldAvailable } as const;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function recordRecoveryCreditProviderEvidence(input: { refundId: string; actionKind: RecoveryCreditProviderActionKind; providerReference: string; providerAmount: string; providerCurrency: string; confirmed: boolean }) {
  const principal = await requirePlatformAdminMutation();
  if (principal.role !== "SUPER_ADMIN") throw new Error("SUPER_ADMIN access is required.");
  if (!input.confirmed) throw new Error("Explicit provider confirmation is required.");
  if (!Object.values(RecoveryCreditProviderActionKind).includes(input.actionKind)) throw new Error("Provider action kind is invalid.");
  const reference = bounded(input.providerReference, MAX_REFERENCE_LENGTH, "Provider reference");
  if (!CURRENCY.test(input.providerCurrency)) throw new Error("Provider currency is invalid.");
  const amount = new Prisma.Decimal(input.providerAmount);
  if (!amount.isFinite() || amount.isNegative()) throw new Error("Provider amount is invalid.");
  return prisma.$transaction(async (transaction) => {
    const { refund } = await loadSettlementState(transaction, input.refundId);
    if (refund.status !== RecoveryCreditRefundStatus.PROVIDER_ACTION_REQUIRED && refund.status !== RecoveryCreditRefundStatus.NEEDS_ATTENTION) throw new Error("Provider action is not locked.");
    if (!refund.expectedProviderAmount || refund.expectedProviderCurrency !== input.providerCurrency || !amount.eq(refund.expectedProviderAmount)) {
      const attention = await transaction.recoveryCreditRefund.updateMany({ where: { id: refund.id, version: refund.version, status: { in: [RecoveryCreditRefundStatus.PROVIDER_ACTION_REQUIRED, RecoveryCreditRefundStatus.NEEDS_ATTENTION] } }, data: { status: RecoveryCreditRefundStatus.NEEDS_ATTENTION, providerReference: reference, providerActionKind: input.actionKind, providerAmount: amount, providerCurrency: input.providerCurrency, providerConfirmedByPlatformAdminId: principal.id, providerConfirmedAt: new Date(), version: { increment: 1 } } });
      if (attention.count !== 1) throw new Error("Refund changed while recording attention.");
      return { status: RecoveryCreditRefundStatus.NEEDS_ATTENTION, reason: "Provider evidence does not exactly match the frozen expected amount/currency." } as const;
    }
    const updated = await transaction.recoveryCreditRefund.updateMany({ where: { id: refund.id, version: refund.version, status: { in: [RecoveryCreditRefundStatus.PROVIDER_ACTION_REQUIRED, RecoveryCreditRefundStatus.NEEDS_ATTENTION] } }, data: { status: RecoveryCreditRefundStatus.PROVIDER_ACTION_REQUIRED, providerReference: reference, providerActionKind: input.actionKind, providerAmount: amount, providerCurrency: input.providerCurrency, providerConfirmedByPlatformAdminId: principal.id, providerConfirmedAt: new Date(), version: { increment: 1 } } });
    if (updated.count !== 1) throw new Error("Refund changed while recording provider evidence.");
    return completeRecoveryCreditRefund(transaction, principal.id, refund.id);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function completeRecoveryCreditRefund(transaction: Transaction, adminId: string, refundId: string) {
  const { refund, purchase, aggregate } = await loadSettlementState(transaction, refundId);
  if (refund.status !== RecoveryCreditRefundStatus.PROVIDER_ACTION_REQUIRED || !refund.finalCreditQuantity || !refund.expectedProviderAmount || !refund.providerAmount || !refund.providerAmount.eq(refund.expectedProviderAmount) || refund.providerCurrency !== refund.expectedProviderCurrency) throw new Error("Provider evidence is incomplete.");
  if (purchase.status !== RecoveryCreditPurchaseStatus.WITHDRAWN || purchase.reservedAmount !== 0 || purchase.currentAmount !== refund.finalCreditQuantity) throw new Error("Purchase changed after provider action.");
  const quantity = refund.finalCreditQuantity;
  const purchaseUpdate = await transaction.recoveryCreditPurchase.updateMany({ where: { id: purchase.id, status: RecoveryCreditPurchaseStatus.WITHDRAWN, version: purchase.version, currentAmount: quantity, reservedAmount: 0 }, data: { currentAmount: 0, status: RecoveryCreditPurchaseStatus.REFUNDED, version: { increment: 1 } } });
  const aggregateUpdate = await transaction.shopEntitlementCounter.updateMany({ where: { id: aggregate.id, version: aggregate.version, refundingQuantity: { gte: quantity }, grantedQuantity: { gte: quantity } }, data: { refundingQuantity: { decrement: quantity }, grantedQuantity: { decrement: quantity }, version: { increment: 1 } } });
  const refundUpdate = await transaction.recoveryCreditRefund.updateMany({ where: { id: refund.id, status: RecoveryCreditRefundStatus.PROVIDER_ACTION_REQUIRED, version: refund.version }, data: { status: RecoveryCreditRefundStatus.COMPLETED, completedAt: new Date(), version: { increment: 1 } } });
  if (purchaseUpdate.count !== 1 || aggregateUpdate.count !== 1 || refundUpdate.count !== 1) throw new Error("Refund changed while completing.");
  await createAudit(transaction, adminId, refund.shopId, refund.id, refund.reason ?? "Provider refund completed.", { status: refund.status, finalCreditQuantity: quantity }, { status: RecoveryCreditRefundStatus.COMPLETED, finalCreditQuantity: quantity, providerAmount: refund.providerAmount.toString(), providerCurrency: refund.providerCurrency });
  await createSystemMessage(transaction, refund.shopId, refund.id, BILLING_SYSTEM_MESSAGE_CODES.REFUND_COMPLETED, "Your recovery-credit refund has been completed.");
  return { status: RecoveryCreditRefundStatus.COMPLETED, finalCreditQuantity: quantity } as const;
}