import type {
  Prisma,
  PromotionCampaignEventType,
  PromotionCampaignStatus,
  PromotionTargetScope,
} from "@prisma/client";
import { requirePlatformAdminRead } from "@/lib/auth/platform-admin";
import { prisma } from "@/lib/prisma";
import type { PageResult } from "@/lib/admin/types";
import {
  derivePromotionCatalogueState,
  normalizePromotionTargetQuery,
  promotionCatalogueWhere,
  selectLastPromotionLifecycleChange,
  type PromotionCatalogueState,
} from "@/lib/admin/promotions/catalogue";

export type PromotionCampaignSummary = {
  id: string;
  name: string;
  translationCount: number;
  scope: PromotionTargetScope;
  quantity: number;
  targetPlanId: string | null;
  targetPlanName: string | null;
  targetShopId: string | null;
  targetShopDomain: string | null;
  startsAt: Date;
  expiresAt: Date;
  status: PromotionCampaignStatus;
  createdAt: Date;
  creatorName: string;
  lastLifecycleChange: {
    kind: PromotionCampaignEventType;
    createdAt: Date;
  } | null;
  state: PromotionCatalogueState;
};

export type PromotionCampaignRow = PromotionCampaignSummary & {
  englishMerchantTitle: string;
  englishMerchantDescription: string | null;
  translations: Array<{
    locale: string;
    merchantTitle: string;
    merchantDescription: string;
  }>;
};

export type PromotionCampaignFilters = {
  state?: "ALL" | PromotionCatalogueState;
  scope?: PromotionTargetScope | "ALL";
  target?: string;
  page?: number;
  pageSize?: number;
};

function safePage(value: number | undefined): number {
  return Math.max(1, Math.trunc(value ?? 1) || 1);
}

function safePageSize(value: number | undefined): number {
  const bounded = Math.min(Math.max(Math.trunc(value ?? 5) || 5, 1), 50);
  return bounded;
}

function summaryFromCampaign(
  campaign: {
    id: string;
    name: string;
    scope: PromotionTargetScope;
    quantity: number;
    targetPlanId: string | null;
    targetPlan: { name: string } | null;
    targetShopId: string | null;
    targetShop: { domain: string } | null;
    startsAt: Date;
    expiresAt: Date;
    status: PromotionCampaignStatus;
    createdAt: Date;
    createdByPlatformAdmin: { displayName: string | null; email: string };
    events: Array<{
      kind: PromotionCampaignEventType;
      createdAt: Date;
    }>;
    _count: { translations: number };
  },
  now: Date,
): PromotionCampaignSummary {
  return {
    id: campaign.id,
    name: campaign.name,
    translationCount: campaign._count.translations,
    scope: campaign.scope,
    quantity: campaign.quantity,
    targetPlanId: campaign.targetPlanId,
    targetPlanName: campaign.targetPlan?.name ?? null,
    targetShopId: campaign.targetShopId,
    targetShopDomain: campaign.targetShop?.domain ?? null,
    startsAt: campaign.startsAt,
    expiresAt: campaign.expiresAt,
    status: campaign.status,
    createdAt: campaign.createdAt,
    creatorName:
      campaign.createdByPlatformAdmin.displayName ??
      campaign.createdByPlatformAdmin.email,
    lastLifecycleChange: selectLastPromotionLifecycleChange(campaign.events),
    state: derivePromotionCatalogueState(campaign, now),
  };
}

const campaignSummarySelect = {
  id: true,
  name: true,
  scope: true,
  quantity: true,
  targetPlanId: true,
  targetPlan: { select: { name: true } },
  targetShopId: true,
  targetShop: { select: { domain: true } },
  startsAt: true,
  expiresAt: true,
  status: true,
  createdAt: true,
  createdByPlatformAdmin: { select: { displayName: true, email: true } },
  events: {
    orderBy: [{ createdAt: "desc" }],
    take: 5,
    select: { kind: true, createdAt: true },
  },
  _count: { select: { translations: true } },
} satisfies Prisma.PromotionCampaignSelect;

export async function getPromotionCampaigns(
  filters: PromotionCampaignFilters = {},
  now = new Date(),
): Promise<PageResult<PromotionCampaignSummary>> {
  await requirePlatformAdminRead();
  const pageSize = safePageSize(filters.pageSize);
  const requestedPage = safePage(filters.page);
  const where = promotionCatalogueWhere(
    {
      state: filters.state,
      scope: filters.scope,
      target: normalizePromotionTargetQuery(filters.target),
    },
    now,
  );
  const totalItems = await prisma.promotionCampaign.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const campaigns = await prisma.promotionCampaign.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: campaignSummarySelect,
  });

  return {
    items: campaigns.map((campaign) => summaryFromCampaign(campaign, now)),
    page,
    pageSize,
    totalItems,
    totalPages,
  };
}

export async function getPromotionCampaignById(
  id: string,
  now = new Date(),
): Promise<PromotionCampaignRow | null> {
  await requirePlatformAdminRead();
  const campaign = await prisma.promotionCampaign.findUnique({
    where: { id },
    select: {
      ...campaignSummarySelect,
      translations: { orderBy: { locale: "asc" as const } },
    },
  });
  if (!campaign) return null;

  const summary = summaryFromCampaign(campaign, now);
  const english = campaign.translations.find(
    (translation) => translation.locale === "en",
  );
  const translationCount = campaign.translations.filter(
    (translation) =>
      translation.merchantTitle.trim() &&
      translation.merchantDescription.trim(),
  ).length;

  return {
    ...summary,
    translationCount,
    englishMerchantTitle: english?.merchantTitle ?? "",
    englishMerchantDescription: english?.merchantDescription ?? null,
    translations: campaign.translations,
  };
}

export async function getPromotionTargets() {
  await requirePlatformAdminRead();
  const [plans, shops] = await Promise.all([
    prisma.billingPlan.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, shopifyPlanHandle: true },
    }),
    prisma.shop.findMany({
      orderBy: { domain: "asc" },
      select: { id: true, domain: true },
    }),
  ]);
  return { plans, shops };
}
