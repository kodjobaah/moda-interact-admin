import { Prisma, SubscriptionProjectionStatus } from "@prisma/client";
import { requirePlatformAdminRead } from "@/lib/auth/platform-admin";
import { prisma } from "@/lib/prisma";
import type { PageResult } from "./types";

const MAX_PAGE_SIZE = 50;

export const RETRYABLE_PLAN_CHANGE_SYNC_ERROR_CODES = [
  "UNEXPECTED_IMMEDIATE_PLAN_CHANGE",
  "MISSING_BILLING_CYCLE",
  "MISSING_USAGE_METER",
  "INVALID_INCLUDED_ALLOWANCE",
] as const;

export const RETRYABLE_PROVIDER_SYNC_ERROR_CODES = [
  "PARTNER_API_ERROR",
] as const;

export function canRequestBillingSyncReconciliation(input: {
  errorCode: string | null;
  planId: string | null;
  pendingPlanId: string | null;
  pendingShopifyPlanHandle: string | null;
  pendingEffectiveAt: Date | null;
}): boolean {
  if (!input.errorCode || !input.planId) return false;
  const hasCompletePendingPlan = Boolean(
    input.pendingPlanId
      && input.pendingShopifyPlanHandle
      && input.pendingEffectiveAt,
  );
  const hasNoPendingPlan = !input.pendingPlanId
    && !input.pendingShopifyPlanHandle
    && !input.pendingEffectiveAt;
  if (RETRYABLE_PLAN_CHANGE_SYNC_ERROR_CODES.includes(
    input.errorCode as (typeof RETRYABLE_PLAN_CHANGE_SYNC_ERROR_CODES)[number],
  )) {
    return hasCompletePendingPlan;
  }
  if (RETRYABLE_PROVIDER_SYNC_ERROR_CODES.includes(
    input.errorCode as (typeof RETRYABLE_PROVIDER_SYNC_ERROR_CODES)[number],
  )) {
    return hasCompletePendingPlan || hasNoPendingPlan;
  }
  return false;
}

export type BillingSyncErrorItem = {
  id: string;
  shopId: string;
  shopDomain: string;
  brandName: string | null;
  observedShopifyPlanHandle: string | null;
  status: "SYNC_ERROR";
  lastSyncErrorCode: string | null;
  lastSyncErrorAt: Date | null;
  lastSyncedAt: Date | null;
  nextReconcileAt: Date | null;
  pendingShopifyPlanHandle: string | null;
  pendingEffectiveAt: Date | null;
  canRequestReconciliation: boolean;
  updatedAt: Date;
  plan: {
    id: string;
    name: string;
    kind: string;
    shopifyPlanHandle: string | null;
    active: boolean;
  } | null;
  pendingPlan: {
    id: string;
    name: string;
    shopifyPlanHandle: string | null;
    active: boolean;
  } | null;
};

const syncErrorSelect = {
  id: true,
  shopId: true,
  observedShopifyPlanHandle: true,
  status: true,
  lastSyncErrorCode: true,
  lastSyncErrorAt: true,
  lastSyncedAt: true,
  nextReconcileAt: true,
  pendingShopifyPlanHandle: true,
  pendingEffectiveAt: true,
  updatedAt: true,
  shop: {
    select: {
      domain: true,
      brand: { select: { brandName: true } },
    },
  },
  plan: {
    select: {
      id: true,
      name: true,
      kind: true,
      shopifyPlanHandle: true,
      active: true,
    },
  },
  pendingPlan: {
    select: {
      id: true,
      name: true,
      shopifyPlanHandle: true,
      active: true,
    },
  },
} satisfies Prisma.SubscriptionSelect;

type SyncErrorRow = Prisma.SubscriptionGetPayload<{
  select: typeof syncErrorSelect;
}>;

function project(row: SyncErrorRow): BillingSyncErrorItem {
  const canRequestReconciliation = canRequestBillingSyncReconciliation({
    errorCode: row.lastSyncErrorCode,
    planId: row.plan?.id ?? null,
    pendingPlanId: row.pendingPlan?.id ?? null,
    pendingShopifyPlanHandle: row.pendingShopifyPlanHandle,
    pendingEffectiveAt: row.pendingEffectiveAt,
  });
  return {
    id: row.id,
    shopId: row.shopId,
    shopDomain: row.shop.domain,
    brandName: row.shop.brand?.brandName ?? null,
    observedShopifyPlanHandle: row.observedShopifyPlanHandle,
    status: "SYNC_ERROR",
    lastSyncErrorCode: row.lastSyncErrorCode,
    lastSyncErrorAt: row.lastSyncErrorAt,
    lastSyncedAt: row.lastSyncedAt,
    nextReconcileAt: row.nextReconcileAt,
    pendingShopifyPlanHandle: row.pendingShopifyPlanHandle,
    pendingEffectiveAt: row.pendingEffectiveAt,
    canRequestReconciliation,
    updatedAt: row.updatedAt,
    plan: row.plan,
    pendingPlan: row.pendingPlan,
  };
}

export async function getBillingSyncErrors(input: {
  page: number;
  pageSize: number;
}): Promise<PageResult<BillingSyncErrorItem>> {
  await requirePlatformAdminRead();

  const pageSize = Math.min(
    Math.max(Math.trunc(input.pageSize) || 1, 1),
    MAX_PAGE_SIZE,
  );
  const requestedPage = Math.max(Math.trunc(input.page) || 1, 1);
  const where: Prisma.SubscriptionWhereInput = {
    status: SubscriptionProjectionStatus.SYNC_ERROR,
  };
  const totalItems = await prisma.subscription.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const rows = await prisma.subscription.findMany({
    where,
    select: syncErrorSelect,
    orderBy: [
      { lastSyncErrorAt: "desc" },
      { updatedAt: "desc" },
      { id: "asc" },
    ],
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  return {
    items: rows.map(project),
    page,
    pageSize,
    totalItems,
    totalPages,
  };
}
