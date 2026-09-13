import type { Prisma, PromotionCampaignStatus, PromotionTargetScope } from "@prisma/client";
import { requirePlatformAdminRead } from "@/lib/auth/platform-admin";
import { prisma } from "@/lib/prisma";

export const PROMOTION_REPORT_PAGE_SIZE = 25;

export type PromotionReportFilters = {
  page?: number;
  search?: string;
  status?: "ALL" | "SELECTED" | "USED" | "EXHAUSTED";
};

export type PromotionMerchantRow = {
  shopId: string;
  shopLabel: string;
  firstSelectedAt: Date | null;
  lastSelectedAt: Date | null;
  selectionCount: number;
  quantityGranted: number;
  reserved: number;
  committed: number;
  remainingAllocation: number;
  firstUsedAt: Date | null;
  lastUsedAt: Date | null;
  exhaustedAt: Date | null;
  currentlySelected: boolean;
};

export type PromotionReport = {
  campaign: {
    id: string;
    name: string;
    scope: PromotionTargetScope;
    quantity: number;
    status: PromotionCampaignStatus;
    startsAt: Date;
    expiresAt: Date;
  };
  summary: {
    merchantsSelected: number;
    merchantsUsed: number;
    merchantsExhausted: number;
    totalCreditsCommitted: number;
  };
  merchants: PromotionMerchantRow[];
  page: number;
  pageSize: number;
  totalMerchants: number;
  totalPages: number;
};

function normalizePage(value: number | undefined): number {
  return Number.isInteger(value) && value && value > 0 ? value : 1;
}

function normalizeSearch(value: string | undefined): string | undefined {
  const search = value?.trim().slice(0, 255);
  return search || undefined;
}

function grantWhere(
  campaignId: string,
  filters: PromotionReportFilters,
): {
  campaignId: string;
  OR?: Prisma.PromotionalCreditGrantWhereInput["OR"];
  firstSelectedAt?: { not: null };
  firstUsedAt?: { not: null };
  exhaustedAt?: { not: null };
} {
  const search = normalizeSearch(filters.search);
  const where = { campaignId } as ReturnType<typeof grantWhere>;
  if (search) {
    where.OR = [
      { shopId: { contains: search, mode: "insensitive" } },
      { shop: { domain: { contains: search, mode: "insensitive" } } },
    ];
  }
  if (filters.status === "SELECTED") where.firstSelectedAt = { not: null };
  if (filters.status === "USED") where.firstUsedAt = { not: null };
  if (filters.status === "EXHAUSTED") where.exhaustedAt = { not: null };
  return where;
}

export async function getPromotionReport(
  campaignId: string,
  filters: PromotionReportFilters = {},
): Promise<PromotionReport | null> {
  const principal = await requirePlatformAdminRead();
  if (principal.role !== "SUPER_ADMIN") {
    throw new Error("SUPER_ADMIN access is required for promotion reports.");
  }

  const campaign = await prisma.promotionCampaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      name: true,
      scope: true,
      quantity: true,
      status: true,
      startsAt: true,
      expiresAt: true,
    },
  });
  if (!campaign) return null;

  const page = normalizePage(filters.page);
  const where = grantWhere(campaignId, filters);
  const [totalMerchants, grants, aggregate, summaryCounts] = await Promise.all([
    prisma.promotionalCreditGrant.count({ where }),
    prisma.promotionalCreditGrant.findMany({
      where,
      orderBy: [{ createdAt: "asc" }, { shopId: "asc" }],
      skip: (page - 1) * PROMOTION_REPORT_PAGE_SIZE,
      take: PROMOTION_REPORT_PAGE_SIZE,
      select: {
        shopId: true,
        shop: { select: { domain: true } },
        quantity: true,
        reservedQuantity: true,
        committedQuantity: true,
        firstSelectedAt: true,
        lastSelectedAt: true,
        selectionCount: true,
        firstUsedAt: true,
        lastUsedAt: true,
        exhaustedAt: true,
        selection: { select: { id: true } },
      },
    }),
    prisma.promotionalCreditGrant.aggregate({
      where: { campaignId },
      _sum: { committedQuantity: true },
    }),
    Promise.all([
      prisma.promotionalCreditGrant.count({ where: { campaignId } }),
      prisma.promotionalCreditGrant.count({ where: { campaignId, firstUsedAt: { not: null } } }),
      prisma.promotionalCreditGrant.count({ where: { campaignId, exhaustedAt: { not: null } } }),
    ]),
  ]);

  return {
    campaign,
    summary: {
      merchantsSelected: summaryCounts[0],
      merchantsUsed: summaryCounts[1],
      merchantsExhausted: summaryCounts[2],
      totalCreditsCommitted: aggregate._sum.committedQuantity ?? 0,
    },
    merchants: grants.map((grant) => ({
      shopId: grant.shopId,
      shopLabel: grant.shop.domain,
      firstSelectedAt: grant.firstSelectedAt,
      lastSelectedAt: grant.lastSelectedAt,
      selectionCount: grant.selectionCount,
      quantityGranted: grant.quantity,
      reserved: grant.reservedQuantity,
      committed: grant.committedQuantity,
      remainingAllocation: Math.max(0, grant.quantity - grant.reservedQuantity - grant.committedQuantity),
      firstUsedAt: grant.firstUsedAt,
      lastUsedAt: grant.lastUsedAt,
      exhaustedAt: grant.exhaustedAt,
      currentlySelected: grant.selection !== null,
    })),
    page,
    pageSize: PROMOTION_REPORT_PAGE_SIZE,
    totalMerchants,
    totalPages: Math.max(1, Math.ceil(totalMerchants / PROMOTION_REPORT_PAGE_SIZE)),
  };
}