import {
  Prisma,
  RecoveryCreditPurchaseStatus,
  RecoveryCreditRefundStatus,
} from "@prisma/client";
import { requirePlatformAdminRead } from "@/lib/auth/platform-admin";
import { prisma } from "@/lib/prisma";
import type {
  PageResult,
  RecoveryCreditRefundDetail,
  RecoveryCreditRefundItem,
  RecoveryCreditRefundQueueStatus,
} from "./types";

export const RECOVERY_CREDIT_REFUND_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

const refundSelect = {
  id: true,
  shopId: true,
  source: true,
  requestedByShopifyUserId: true,
  status: true,
  purchaseCreditsGrantedSnapshot: true,
  currentAmountAtRequestSnapshot: true,
  reservedAmountAtRequestSnapshot: true,
  availableAmountAtRequestSnapshot: true,
  billingPeriodIdSnapshot: true,
  providerSubscriptionIdSnapshot: true,
  planHandleSnapshot: true,
  eventHandleSnapshot: true,
  purchaseProviderAmountSnapshot: true,
  purchaseProviderCurrencySnapshot: true,
  finalCreditQuantity: true,
  expectedProviderAmount: true,
  expectedProviderCurrency: true,
  automaticCorrectionUsageEventId: true,
  providerUsageQuantityBeforeCorrection: true,
  providerUsageCostBeforeCorrection: true,
  expectedProviderUsageQuantityAfterCorrection: true,
  expectedProviderUsageCostAfterCorrection: true,
  providerReference: true,
  providerActionKind: true,
  providerAmount: true,
  providerCurrency: true,
  reason: true,
  sourceMessageId: true,
  createdAt: true,
  updatedAt: true,
  shop: { select: { domain: true, brand: { select: { brandName: true } } } },
  purchase: {
    select: {
      id: true,
      status: true,
      creditsGranted: true,
      currentAmount: true,
      reservedAmount: true,
      providerPurchaseAmount: true,
      providerPurchaseCurrency: true,
      activatedAt: true,
      createdAt: true,
    },
  },
} satisfies Prisma.RecoveryCreditRefundSelect;

type RefundRow = Prisma.RecoveryCreditRefundGetPayload<{ select: typeof refundSelect }>;

function decimalValue(value: Prisma.Decimal | null | undefined): string | null {
  return value?.toString() ?? null;
}

function queueStatus(row: Pick<RefundRow, "status" | "purchase">): RecoveryCreditRefundQueueStatus {
  if (row.status !== RecoveryCreditRefundStatus.REQUESTED) {
    return row.status as RecoveryCreditRefundQueueStatus;
  }
  if (
    row.purchase.status === RecoveryCreditPurchaseStatus.WITHDRAWN &&
    row.purchase.reservedAmount === 0 &&
    row.purchase.currentAmount > 0
  ) {
    return "READY_FOR_REFUND_PROCESSING";
  }
  if (
    row.purchase.status === RecoveryCreditPurchaseStatus.WITHDRAWN &&
    row.purchase.reservedAmount > 0
  ) {
    return "WAITING_FOR_RESERVATIONS";
  }
  return "NEEDS_ATTENTION";
}

function baseProjection(row: RefundRow): RecoveryCreditRefundItem {
  return {
    id: row.id,
    shopId: row.shopId,
    shop: { domain: row.shop.domain, brandName: row.shop.brand?.brandName ?? null },
    source: row.source,
    requestedByShopifyUserId: row.requestedByShopifyUserId,
    status: row.status,
    queueStatus: queueStatus(row),
    purchase: {
      ...row.purchase,
      providerPurchaseAmount: decimalValue(row.purchase.providerPurchaseAmount),
    },
    purchaseCreditsGrantedSnapshot: row.purchaseCreditsGrantedSnapshot,
    currentAmountAtRequestSnapshot: row.currentAmountAtRequestSnapshot,
    reservedAmountAtRequestSnapshot: row.reservedAmountAtRequestSnapshot,
    availableAmountAtRequestSnapshot: row.availableAmountAtRequestSnapshot,
    billingPeriodIdSnapshot: row.billingPeriodIdSnapshot,
    providerSubscriptionIdSnapshot: row.providerSubscriptionIdSnapshot,
    planHandleSnapshot: row.planHandleSnapshot,
    eventHandleSnapshot: row.eventHandleSnapshot,
    purchaseProviderAmountSnapshot: row.purchaseProviderAmountSnapshot.toString(),
    purchaseProviderCurrencySnapshot: row.purchaseProviderCurrencySnapshot,
    finalCreditQuantity: row.finalCreditQuantity,
    expectedProviderAmount: decimalValue(row.expectedProviderAmount),
    expectedProviderCurrency: row.expectedProviderCurrency,
    automaticCorrectionUsageEventId: row.automaticCorrectionUsageEventId,
    providerUsageQuantityBeforeCorrection: decimalValue(row.providerUsageQuantityBeforeCorrection),
    providerUsageCostBeforeCorrection: decimalValue(row.providerUsageCostBeforeCorrection),
    expectedProviderUsageQuantityAfterCorrection: decimalValue(row.expectedProviderUsageQuantityAfterCorrection),
    expectedProviderUsageCostAfterCorrection: decimalValue(row.expectedProviderUsageCostAfterCorrection),
    automaticCorrection: null,
    providerReference: row.providerReference,
    providerActionKind: row.providerActionKind,
    providerAmount: decimalValue(row.providerAmount),
    providerCurrency: row.providerCurrency,
    reason: row.reason,
    sourceMessageId: row.sourceMessageId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function boundedPage(page: number, pageSize: number) {
  return {
    page: Math.max(1, Math.trunc(page) || 1),
    pageSize: Math.min(Math.max(1, Math.trunc(pageSize) || 1), MAX_PAGE_SIZE),
  };
}

function statusWhere(status: RecoveryCreditRefundQueueStatus): Prisma.RecoveryCreditRefundWhereInput {
  if (status === "ALL") return {};
  if (status === "READY_FOR_REFUND_PROCESSING") {
    return {
      status: RecoveryCreditRefundStatus.REQUESTED,
      purchase: { status: RecoveryCreditPurchaseStatus.WITHDRAWN, reservedAmount: 0, currentAmount: { gt: 0 } },
    };
  }
  if (status === "WAITING_FOR_RESERVATIONS") {
    return {
      status: RecoveryCreditRefundStatus.REQUESTED,
      purchase: { status: RecoveryCreditPurchaseStatus.WITHDRAWN, reservedAmount: { gt: 0 } },
    };
  }
  if (status === "NEEDS_ATTENTION") {
    return {
      OR: [
        { status: RecoveryCreditRefundStatus.NEEDS_ATTENTION },
        {
          status: RecoveryCreditRefundStatus.REQUESTED,
          purchase: {
            status: {
              in: [
                RecoveryCreditPurchaseStatus.REQUESTED,
                RecoveryCreditPurchaseStatus.ACTIVE,
                RecoveryCreditPurchaseStatus.COMPLETED,
                RecoveryCreditPurchaseStatus.REFUNDED,
              ],
            },
          },
        },
        {
          status: RecoveryCreditRefundStatus.REQUESTED,
          purchase: {
            status: RecoveryCreditPurchaseStatus.WITHDRAWN,
            reservedAmount: 0,
            currentAmount: { lte: 0 },
          },
        },
      ],
    };
  }
  if (status === "REQUESTED") return { status: RecoveryCreditRefundStatus.REQUESTED };
  return { status: status as RecoveryCreditRefundStatus };
}

function pageResult<T>(items: T[], page: number, pageSize: number, totalItems: number): PageResult<T> {
  return { items, page, pageSize, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / pageSize)) };
}

export async function getRecoveryCreditRefunds(input: {
  page: number;
  pageSize?: number;
  status?: RecoveryCreditRefundQueueStatus;
}): Promise<PageResult<RecoveryCreditRefundItem>> {
  await requirePlatformAdminRead();
  const status = input.status ?? "ALL";
  const allowed: RecoveryCreditRefundQueueStatus[] = [
    "ALL", "REQUESTED", "READY_FOR_REFUND_PROCESSING", "WAITING_FOR_RESERVATIONS",
    "PROVIDER_ACTION_REQUIRED", "NEEDS_ATTENTION", "COMPLETED", "REJECTED", "CANCELLED",
  ];
  if (!allowed.includes(status)) throw new Error("Unsupported recovery-credit refund status");
  const { page: requestedPage, pageSize } = boundedPage(input.page, input.pageSize ?? RECOVERY_CREDIT_REFUND_PAGE_SIZE);
  const where = statusWhere(status);
  const totalItems = await prisma.recoveryCreditRefund.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const rows = await prisma.recoveryCreditRefund.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: refundSelect,
  });
  return pageResult(rows.map(baseProjection), page, pageSize, totalItems);
}

export async function getRecoveryCreditRefundDetail(id: string): Promise<RecoveryCreditRefundDetail | null> {
  await requirePlatformAdminRead();
  const row = await prisma.recoveryCreditRefund.findUnique({
    where: { id },
    select: {
      ...refundSelect,
      automaticCorrectionUsageEvent: {
        select: {
          id: true,
          quantity: true,
          shopifyReportState: true,
          shopifyEventHandle: true,
          shopifyIdempotencyKey: true,
          reportAttemptCount: true,
          lastReportAttemptAt: true,
          reportedAt: true,
        },
      },
      approvedAt: true,
      holdAppliedAt: true,
      providerConfirmedAt: true,
      completedAt: true,
      sourceMessage: { select: { id: true, createdAt: true, shopifyUserId: true, systemCode: true } },
      purchase: {
        select: {
          ...refundSelect.purchase.select,
          plan: { select: { name: true } },
          shopifyPlanHandleSnapshot: true,
          shopifyEventHandleSnapshot: true,
          providerSubscriptionIdSnapshot: true,
          providerUsageQuantityBeforeSnapshot: true,
          providerUsageCostBeforeSnapshot: true,
          providerUsageCostCurrencyBeforeSnapshot: true,
          providerUsageQuantityAfterSnapshot: true,
          providerUsageCostAfterSnapshot: true,
          providerUsageCostCurrencyAfterSnapshot: true,
          providerValuationConfirmedAt: true,
          providerPriceSnapshot: true,
          billingPeriod: { select: { id: true, periodStart: true, periodEnd: true, planNameSnapshot: true, planKindSnapshot: true } },
          purchasedReservations: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 20,
            select: { id: true, quantity: true, status: true, createdAt: true, updatedAt: true },
          },
          refunds: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 20,
            select: { id: true, status: true, source: true, reason: true, finalCreditQuantity: true, providerAmount: true, providerCurrency: true, createdAt: true, completedAt: true },
          },
        },
      },
    },
  });
  if (!row) return null;
  const projected = baseProjection(row);
  return {
    ...projected,
    approvedAt: row.approvedAt,
    holdAppliedAt: row.holdAppliedAt,
    providerConfirmedAt: row.providerConfirmedAt,
    completedAt: row.completedAt,
    sourceMessage: row.sourceMessage,
    purchase: {
      ...projected.purchase,
      planName: row.purchase.plan?.name ?? null,
      shopifyPlanHandleSnapshot: row.purchase.shopifyPlanHandleSnapshot,
      shopifyEventHandleSnapshot: row.purchase.shopifyEventHandleSnapshot,
      providerSubscriptionIdSnapshot: row.purchase.providerSubscriptionIdSnapshot,
      providerUsageQuantityBeforeSnapshot: row.purchase.providerUsageQuantityBeforeSnapshot.toString(),
      providerUsageCostBeforeSnapshot: row.purchase.providerUsageCostBeforeSnapshot.toString(),
      providerUsageCostCurrencyBeforeSnapshot: row.purchase.providerUsageCostCurrencyBeforeSnapshot,
      providerUsageQuantityAfterSnapshot: decimalValue(row.purchase.providerUsageQuantityAfterSnapshot),
      providerUsageCostAfterSnapshot: decimalValue(row.purchase.providerUsageCostAfterSnapshot),
      providerUsageCostCurrencyAfterSnapshot: row.purchase.providerUsageCostCurrencyAfterSnapshot,
      providerValuationConfirmedAt: row.purchase.providerValuationConfirmedAt,
      providerPriceSnapshot: row.purchase.providerPriceSnapshot,
      billingPeriod: row.purchase.billingPeriod,
    },
    automaticCorrection: row.automaticCorrectionUsageEvent
      ? {
          ...row.automaticCorrectionUsageEvent,
          quantity: row.automaticCorrectionUsageEvent.quantity.toString(),
        }
      : null,
    reservations: row.purchase.purchasedReservations,
    refundHistory: row.purchase.refunds.map((refund) => ({
      ...refund,
      providerAmount: decimalValue(refund.providerAmount),
    })),
  };
}