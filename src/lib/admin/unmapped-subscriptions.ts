import {
  BillingPlanKind,
  MerchantPricingPlanKind,
  Prisma,
} from "@prisma/client";
import { requirePlatformAdminRead } from "@/lib/auth/platform-admin";
import { prisma } from "@/lib/prisma";
import { validateShopifySubscriptionContract, type ShopifyContractValidation } from "./shopify-subscription-contract";
import type { PageResult } from "./types";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

export type UnmappedResolutionState =
  | "MISSING_OBSERVED_HANDLE"
  | "CATALOGUE_MISSING"
  | "CATALOGUE_INACTIVE"
  | "OPERATIONAL_MISSING"
  | "OPERATIONAL_DRIFT"
  | "READY_TO_RECONCILE";

export type UnmappedSubscriptionItem = {
  id: string;
  shopId: string;
  shopDomain: string;
  brandName: string | null;
  observedShopifyPlanHandle: string | null;
  providerSubscriptionId: string | null;
  lastSyncedAt: Date | null;
  lastSyncErrorCode: string | null;
  lastSyncErrorAt: Date | null;
  nextReconcileAt: Date | null;
  cataloguePlan: {
    id: string;
    displayName: string;
    shopifyPlanHandle: string;
    planKind: MerchantPricingPlanKind;
    isActive: boolean;
    includedRecoveryCredits: number;
  } | null;
  operationalPlan: {
    id: string;
    name: string;
    shopifyPlanHandle: string;
    kind: BillingPlanKind;
    active: boolean;
    shopifyUsageEventHandle: string | null;
    includedRecoveryConversationAllowance: number | null;
  } | null;
  resolutionState: UnmappedResolutionState;
};

export type UnmappedSubscriptionDetail = UnmappedSubscriptionItem & {
  cataloguePlan: (NonNullable<UnmappedSubscriptionItem["cataloguePlan"]> & {
    shopifyRecoveryUsageEventHandle: string | null;
    features: string[];
    usageEvents: Array<{
      eventHandle: string;
      adminLabel: string;
      position: number;
    }>;
  }) | null;
  operationalPlan: (NonNullable<UnmappedSubscriptionItem["operationalPlan"]> & {
    features: string[];
  }) | null;
  shopifyContract: ShopifyContractValidation | null;
};

type CataloguePlanSummary = NonNullable<UnmappedSubscriptionItem["cataloguePlan"]>;
type OperationalPlanSummary = NonNullable<UnmappedSubscriptionItem["operationalPlan"]>;

function boundedPage(page: number, pageSize: number) {
  const safePageSize = Math.min(
    Math.max(Math.trunc(pageSize) || DEFAULT_PAGE_SIZE, 1),
    MAX_PAGE_SIZE,
  );
  return {
    page: Math.max(Math.trunc(page) || 1, 1),
    pageSize: safePageSize,
  };
}

function expectedOperationalKind(
  planKind: MerchantPricingPlanKind,
): BillingPlanKind {
  return planKind === MerchantPricingPlanKind.FREE
    ? BillingPlanKind.FREE
    : BillingPlanKind.PAID_METERED;
}

function expectedIncludedAllowance(
  plan: CataloguePlanSummary,
): number | null {
  return plan.planKind === MerchantPricingPlanKind.PAID_METERED
    ? plan.includedRecoveryCredits
    : null;
}

function resolutionState(
  observedShopifyPlanHandle: string | null,
  cataloguePlan: CataloguePlanSummary | null,
  operationalPlan: OperationalPlanSummary | null,
): UnmappedResolutionState {
  if (!observedShopifyPlanHandle?.trim()) return "MISSING_OBSERVED_HANDLE";
  if (!cataloguePlan) return "CATALOGUE_MISSING";
  if (!cataloguePlan.isActive) return "CATALOGUE_INACTIVE";
  if (!operationalPlan) return "OPERATIONAL_MISSING";

  if (
    operationalPlan.name !== cataloguePlan.displayName ||
    operationalPlan.kind !== expectedOperationalKind(cataloguePlan.planKind) ||
    operationalPlan.active !== cataloguePlan.isActive ||
    operationalPlan.includedRecoveryConversationAllowance !==
      expectedIncludedAllowance(cataloguePlan)
  ) {
    return "OPERATIONAL_DRIFT";
  }

  return "READY_TO_RECONCILE";
}

const subscriptionSelect = {
  id: true,
  shopId: true,
  observedShopifyPlanHandle: true,
  providerSubscriptionId: true,
  lastSyncedAt: true,
  lastSyncErrorCode: true,
  lastSyncErrorAt: true,
  nextReconcileAt: true,
  shop: {
    select: {
      domain: true,
      shopifyShopId: true,
      brand: { select: { brandName: true } },
    },
  },
} satisfies Prisma.SubscriptionSelect;

async function loadPlanMaps(handles: string[]) {
  if (!handles.length) {
    return {
      catalogueByHandle: new Map<string, CataloguePlanSummary>(),
      operationalByHandle: new Map<string, OperationalPlanSummary>(),
    };
  }

  const [cataloguePlans, operationalPlans] = await Promise.all([
    prisma.merchantPricingPlan.findMany({
      where: { shopifyPlanHandle: { in: handles } },
      select: {
        id: true,
        displayName: true,
        shopifyPlanHandle: true,
        planKind: true,
        isActive: true,
        includedRecoveryCredits: true,
      },
    }),
    prisma.billingPlan.findMany({
      where: { shopifyPlanHandle: { in: handles } },
      select: {
        id: true,
        name: true,
        shopifyPlanHandle: true,
        kind: true,
        active: true,
        shopifyUsageEventHandle: true,
        includedRecoveryConversationAllowance: true,
      },
    }),
  ]);

  return {
    catalogueByHandle: new Map(
      cataloguePlans.map((plan) => [plan.shopifyPlanHandle, plan] as const),
    ),
    operationalByHandle: new Map(
      operationalPlans.map((plan) => [plan.shopifyPlanHandle, plan] as const),
    ),
  };
}

function projectListItem(
  row: Prisma.SubscriptionGetPayload<{ select: typeof subscriptionSelect }>,
  catalogueByHandle: Map<string, CataloguePlanSummary>,
  operationalByHandle: Map<string, OperationalPlanSummary>,
): UnmappedSubscriptionItem {
  const handle = row.observedShopifyPlanHandle?.trim() || null;
  const cataloguePlan = handle ? (catalogueByHandle.get(handle) ?? null) : null;
  const operationalPlan = handle
    ? (operationalByHandle.get(handle) ?? null)
    : null;

  return {
    id: row.id,
    shopId: row.shopId,
    shopDomain: row.shop.domain,
    brandName: row.shop.brand?.brandName ?? null,
    observedShopifyPlanHandle: handle,
    providerSubscriptionId: row.providerSubscriptionId,
    lastSyncedAt: row.lastSyncedAt,
    lastSyncErrorCode: row.lastSyncErrorCode,
    lastSyncErrorAt: row.lastSyncErrorAt,
    nextReconcileAt: row.nextReconcileAt,
    cataloguePlan,
    operationalPlan,
    resolutionState: resolutionState(handle, cataloguePlan, operationalPlan),
  };
}

export async function getUnmappedSubscriptions(input: {
  page?: number;
  pageSize?: number;
} = {}): Promise<PageResult<UnmappedSubscriptionItem>> {
  await requirePlatformAdminRead();
  const { page: requestedPage, pageSize } = boundedPage(
    input.page ?? 1,
    input.pageSize ?? DEFAULT_PAGE_SIZE,
  );
  const where: Prisma.SubscriptionWhereInput = { status: "UNMAPPED" };
  const totalItems = await prisma.subscription.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const rows = await prisma.subscription.findMany({
    where,
    orderBy: [{ lastSyncErrorAt: "desc" }, { updatedAt: "desc" }, { id: "asc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: subscriptionSelect,
  });
  const handles = [
    ...new Set(
      rows
        .map((row) => row.observedShopifyPlanHandle?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const { catalogueByHandle, operationalByHandle } =
    await loadPlanMaps(handles);

  return {
    items: rows.map((row) =>
      projectListItem(row, catalogueByHandle, operationalByHandle),
    ),
    page,
    pageSize,
    totalItems,
    totalPages,
  };
}

export async function getUnmappedSubscriptionDetail(
  subscriptionId: string,
): Promise<UnmappedSubscriptionDetail | null> {
  await requirePlatformAdminRead();
  const row = await prisma.subscription.findFirst({
    where: { id: subscriptionId, status: "UNMAPPED" },
    select: subscriptionSelect,
  });
  if (!row) return null;

  const handle = row.observedShopifyPlanHandle?.trim() || null;
  const [cataloguePlan, operationalPlan] = handle
    ? await Promise.all([
        prisma.merchantPricingPlan.findUnique({
          where: { shopifyPlanHandle: handle },
          select: {
            id: true,
            displayName: true,
            shopifyPlanHandle: true,
            planKind: true,
            isActive: true,
            includedRecoveryCredits: true,
            shopifyRecoveryUsageEventHandle: true,
            recurringAmountMinor: true,
            currency: true,
            billingPeriod: true,
            features: {
              select: { feature: { select: { key: true } } },
            },
            usageEvents: {
              orderBy: { position: "asc" },
              select: {
                eventHandle: true,
                adminLabel: true,
                position: true,
                pricingMode: true,
                currency: true,
                fixedUnitAmountMinor: true,
                tiers: { orderBy: { position: "asc" }, select: { upTo: true, amountPerUnitMinor: true, flatAmountMinor: true } },
              },
            },
          },
        }),
        prisma.billingPlan.findUnique({
          where: { shopifyPlanHandle: handle },
          select: {
            id: true,
            name: true,
            shopifyPlanHandle: true,
            kind: true,
            active: true,
            shopifyUsageEventHandle: true,
            includedRecoveryConversationAllowance: true,
            features: {
              where: { enabled: true },
              select: { feature: true },
            },
          },
        }),
      ])
    : [null, null];

  const base = projectListItem(
    row,
    new Map(
      cataloguePlan
        ? [[cataloguePlan.shopifyPlanHandle, cataloguePlan]]
        : [],
    ),
    new Map(
      operationalPlan
        ? [[operationalPlan.shopifyPlanHandle, operationalPlan]]
        : [],
    ),
  );

  if (!cataloguePlan) {
    return {
      ...base,
      cataloguePlan: null,
      operationalPlan: operationalPlan
        ? {
            ...operationalPlan,
            features: operationalPlan.features.map((item) => item.feature.key),
          }
        : null,
      shopifyContract: null,
    };
  }

  const shopifyContract = await validateShopifySubscriptionContract({
    shopifyShopId: row.shop.shopifyShopId,
    plan: {
      shopifyPlanHandle: cataloguePlan.shopifyPlanHandle,
      planKind: cataloguePlan.planKind,
      recurringAmountMinor: cataloguePlan.recurringAmountMinor,
      currency: cataloguePlan.currency,
      billingPeriod: cataloguePlan.billingPeriod,
      shopifyRecoveryUsageEventHandle:
        cataloguePlan.shopifyRecoveryUsageEventHandle,
      usageEvents: cataloguePlan.usageEvents.map((event) => ({
        eventHandle: event.eventHandle,
        pricingMode: event.pricingMode,
        currency: event.currency,
        fixedUnitAmountMinor: event.fixedUnitAmountMinor,
        tiers: event.tiers,
      })),
    },
  });

  return {
    ...base,
    shopifyContract,
      cataloguePlan: {
        ...cataloguePlan,
        features: cataloguePlan.features.map((item) => item.feature.key),
      },
    operationalPlan: operationalPlan
      ? {
          ...operationalPlan,
            features: operationalPlan.features.map((item) => item.feature.key),
        }
      : null,
  };
}
