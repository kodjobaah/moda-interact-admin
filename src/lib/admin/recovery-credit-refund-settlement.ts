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
const CURRENCY = /^[A-Z]{3}$/;
const SUPPORTED_CURRENCIES = new Set(Intl.supportedValuesOf("currency"));
type Transaction = Prisma.TransactionClient;

function bounded(value: string, max: number, name: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) throw new Error(`${name} is invalid.`);
  return trimmed;
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
    const { refund, purchase } = await loadSettlementState(transaction, input.refundId);
    if (refund.status !== RecoveryCreditRefundStatus.PROVIDER_ACTION_REQUIRED || refund.automaticCorrectionUsageEventId !== null) throw new Error("Manual provider settlement is not eligible.");
    if (purchase.status !== RecoveryCreditPurchaseStatus.WITHDRAWN || purchase.reservedAmount !== 0 || refund.finalCreditQuantity === null || refund.finalCreditQuantity <= 0 || refund.expectedProviderAmount === null || refund.expectedProviderCurrency === null) throw new Error("Manual settlement evidence is incomplete.");
    if (!refund.expectedProviderAmount || refund.expectedProviderCurrency !== input.providerCurrency || !amount.eq(refund.expectedProviderAmount)) {
      const attention = await transaction.recoveryCreditRefund.updateMany({ where: { id: refund.id, version: refund.version, status: RecoveryCreditRefundStatus.PROVIDER_ACTION_REQUIRED, automaticCorrectionUsageEventId: null }, data: { status: RecoveryCreditRefundStatus.NEEDS_ATTENTION, providerReference: reference, providerActionKind: input.actionKind, providerAmount: amount, providerCurrency: input.providerCurrency, providerConfirmedByPlatformAdminId: principal.id, providerConfirmedAt: new Date(), version: { increment: 1 } } });
      if (attention.count !== 1) throw new Error("Refund changed while recording attention.");
      return { status: RecoveryCreditRefundStatus.NEEDS_ATTENTION, reason: "Provider evidence does not exactly match the frozen expected amount/currency." } as const;
    }
    const updated = await transaction.recoveryCreditRefund.updateMany({ where: { id: refund.id, version: refund.version, status: RecoveryCreditRefundStatus.PROVIDER_ACTION_REQUIRED, automaticCorrectionUsageEventId: null }, data: { status: RecoveryCreditRefundStatus.PROVIDER_ACTION_REQUIRED, providerReference: reference, providerActionKind: input.actionKind, providerAmount: amount, providerCurrency: input.providerCurrency, providerConfirmedByPlatformAdminId: principal.id, providerConfirmedAt: new Date(), version: { increment: 1 } } });
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