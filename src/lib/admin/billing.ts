import {
  BillingPlanKind,
  EntitlementCounter,
  Prisma,
  ShopifyReportState,
  UsageMetric,
} from "@prisma/client";
import { requirePlatformAdminRead } from "@/lib/auth/platform-admin";
import { prisma } from "@/lib/prisma";
import type {
  BillingLedgerItem,
  BillingOverview,
  PageResult,
  TenantBilling,
} from "./types";

const MAX_PAGE_SIZE = 50;

const REPORT_STATES: ShopifyReportState[] = [
  ShopifyReportState.PENDING,
  ShopifyReportState.IN_FLIGHT,
  ShopifyReportState.RETRYABLE,
  ShopifyReportState.REPORTED,
  ShopifyReportState.NEEDS_ATTENTION,
];

function boundedPage(
  value: number,
  pageSize: number,
): { page: number; pageSize: number } {
  const safePageSize = Math.min(
    Math.max(Math.trunc(pageSize) || 1, 1),
    MAX_PAGE_SIZE,
  );
  return { page: Math.max(Math.trunc(value) || 1, 1), pageSize: safePageSize };
}

function pageResult<T>(
  items: T[],
  page: number,
  pageSize: number,
  totalItems: number,
): PageResult<T> {
  return {
    items,
    page,
    pageSize,
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
  };
}

export function billingDateBoundary(
  value: string | undefined,
  endOfDay = false,
): Date | undefined {
  if (!value) return undefined;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function decimalValue(value: Prisma.Decimal | null | undefined): string {
  return value?.toString() ?? "0";
}

export async function getBillingOverview(): Promise<BillingOverview> {
  await requirePlatformAdminRead();
  const [free, paid, unmapped, syncError, paidUsage, reportStateCounts] =
    await Promise.all([
      prisma.shop.count({
        where: {
          subscription: {
            is: { plan: { is: { kind: BillingPlanKind.FREE } } },
          },
        },
      }),
      prisma.shop.count({
        where: {
          subscription: {
            is: { plan: { is: { kind: BillingPlanKind.PAID_METERED } } },
          },
        },
      }),
      prisma.subscription.count({ where: { status: "UNMAPPED" } }),
      prisma.subscription.count({ where: { status: "SYNC_ERROR" } }),
      prisma.usageEvent.aggregate({
        where: {
          metric: UsageMetric.RECOVERY_CONVERSATION,
          shopifyReportState: ShopifyReportState.REPORTED,
        },
        _sum: { quantity: true },
      }),
      Promise.all(
        REPORT_STATES.map(
          async (state) =>
            [
              state,
              await prisma.usageEvent.count({
                where: { shopifyReportState: state },
              }),
            ] as const,
        ),
      ),
    ]);

  return {
    planDistribution: { free, paid, unmapped, syncError },
    freeExhausted: null,
    paidRecoveryUsage: decimalValue(paidUsage._sum.quantity),
    reportStates: Object.fromEntries(reportStateCounts),
  };
}

export async function getBillingLedger(input: {
  page: number;
  pageSize: number;
  shopId?: string;
  state?: ShopifyReportState;
  from?: string;
  to?: string;
}): Promise<PageResult<BillingLedgerItem>> {
  await requirePlatformAdminRead();
  const { page: requestedPage, pageSize } = boundedPage(
    input.page,
    input.pageSize,
  );
  const occurredAt: Prisma.DateTimeFilter = {};
  const from = billingDateBoundary(input.from);
  const to = billingDateBoundary(input.to, true);
  if (from) occurredAt.gte = from;
  if (to) occurredAt.lte = to;
  const where: Prisma.UsageEventWhereInput = {
    ...(input.shopId ? { shopId: input.shopId } : {}),
    ...(input.state ? { shopifyReportState: input.state } : {}),
    ...(from || to ? { occurredAt } : {}),
  };
  const totalItems = await prisma.usageEvent.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const rows = await prisma.usageEvent.findMany({
    where,
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      shopId: true,
      metric: true,
      quantity: true,
      occurredAt: true,
      shopifyReportState: true,
      reportAttemptCount: true,
      lastReportAttemptAt: true,
      reportedAt: true,
      providerErrorCode: true,
      providerResponseSummary: true,
      shopifyEventHandle: true,
      shop: { select: { domain: true } },
    },
  });
  return pageResult(
    rows.map((row) => ({ ...row, quantity: decimalValue(row.quantity) })),
    page,
    pageSize,
    totalItems,
  );
}

export async function getTenantBilling(
  shopId: string,
  ledgerPage = 1,
  ledgerPageSize = 10,
): Promise<TenantBilling | null> {
  await requirePlatformAdminRead();
  const subscription = await prisma.subscription.findUnique({
    where: { shopId },
    select: {
      observedShopifyPlanHandle: true,
      status: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      trialEndsAt: true,
      cancelAtPeriodEnd: true,
      pendingShopifyPlanHandle: true,
      pendingEffectiveAt: true,
      lastSyncedAt: true,
      lastSyncErrorCode: true,
      plan: {
        select: {
          name: true,
          kind: true,
          freeLifetimeConversationAllowance: true,
          shopifyUsageEventHandle: true,
          defaultOutboundHardLimit: true,
        },
      },
      pendingPlan: { select: { name: true } },
      billingPeriod: {
        select: { id: true, periodStart: true, periodEnd: true, status: true },
      },
    },
  });
  if (!subscription) return null;

  const now = new Date();
  const [
    counter,
    adjustments,
    usage,
    automatedMessages,
    override,
    policy,
    ledger,
  ] = await Promise.all([
    prisma.shopEntitlementCounter.findUnique({
      where: {
        shopId_counter: {
          shopId,
          counter: EntitlementCounter.FREE_RECOVERY_LIFETIME,
        },
      },
      select: { committedQuantity: true, reservedQuantity: true },
    }),
    prisma.billingAllowanceAdjustment.aggregate({
      where: { shopId, counter: EntitlementCounter.FREE_RECOVERY_LIFETIME },
      _sum: { quantity: true },
    }),
    prisma.usageEvent.aggregate({
      where: {
        shopId,
        billingPeriodId:
          subscription.billingPeriod?.id ?? "__no_billing_period__",
        metric: UsageMetric.RECOVERY_CONVERSATION,
        shopifyReportState: ShopifyReportState.REPORTED,
        ...(subscription.plan?.shopifyUsageEventHandle
          ? { shopifyEventHandle: subscription.plan.shopifyUsageEventHandle }
          : { shopifyEventHandle: "__no_usage_meter__" }),
      },
      _sum: { quantity: true },
    }),
    subscription.billingPeriod
      ? prisma.usageEvent.aggregate({
          where: {
            shopId,
            billingPeriodId: subscription.billingPeriod.id,
            metric: UsageMetric.OUTBOUND_AUTOMATED_MESSAGE,
          },
          _sum: { quantity: true },
        })
      : Promise.resolve(null),
    prisma.shopBillingPolicyOverride.findUnique({
      where: { shopId },
      select: {
        outboundSoftLimit: true,
        outboundHardLimit: true,
        pauseNewRecoveries: true,
        pauseAutomatedWhatsapp: true,
        recoverySafetyCeiling: true,
        reason: true,
        expiresAt: true,
      },
    }),
    prisma.platformBillingPolicy.findUnique({ where: { id: "default" } }),
    getBillingLedger({ shopId, page: ledgerPage, pageSize: ledgerPageSize }),
  ]);

  const baseAllowance =
    subscription.plan?.freeLifetimeConversationAllowance ?? 0;
  const adjustmentTotal = adjustments._sum.quantity ?? 0;
  const committed = counter?.committedQuantity ?? 0;
  const reserved = counter?.reservedQuantity ?? 0;
  const overrideActive = override
    ? override.expiresAt === null || override.expiresAt > now
    : false;
  const configuredHardLimit = overrideActive
    ? (override?.outboundHardLimit ??
      subscription.plan?.defaultOutboundHardLimit ??
      null)
    : (subscription.plan?.defaultOutboundHardLimit ?? null);
  const effectiveOutboundHardCap =
    configuredHardLimit === null || !policy
      ? configuredHardLimit
      : Math.min(configuredHardLimit, policy.absoluteOutboundHardLimit);
  return {
    subscription,
    allowance: {
      base: baseAllowance,
      adjustments: adjustmentTotal,
      committed,
      reserved,
      remaining: Math.max(
        baseAllowance + adjustmentTotal - committed - reserved,
        0,
      ),
    },
    paidRecoveryUsage: decimalValue(usage._sum.quantity),
    currentPeriodAutomatedMessageQuantity:
      automatedMessages === null
        ? null
        : decimalValue(automatedMessages._sum.quantity),
    planDefaultOutboundHardLimit:
      subscription.plan?.defaultOutboundHardLimit ?? null,
    platformAbsoluteOutboundHardLimit:
      policy?.absoluteOutboundHardLimit ?? null,
    effectiveOutboundHardCap,
    overrideState: override ? (overrideActive ? "ACTIVE" : "EXPIRED") : null,
    overrideReason: override?.reason ?? null,
    pauseNewRecoveries: overrideActive
      ? (override?.pauseNewRecoveries ?? null)
      : null,
    pauseAutomatedWhatsapp: overrideActive
      ? (override?.pauseAutomatedWhatsapp ?? null)
      : null,
    override,
    ledger,
    discrepancy: null,
  };
}
