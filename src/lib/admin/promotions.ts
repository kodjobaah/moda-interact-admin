import type { PromotionCampaignStatus, PromotionCampaignEventType, PromotionTargetScope } from "@prisma/client";
import { requirePlatformAdminRead } from "@/lib/auth/platform-admin";
import { prisma } from "@/lib/prisma";
import {
  derivePromotionCatalogueState,
  normalizePromotionTargetQuery,
  promotionCatalogueWhere,
  selectLastPromotionLifecycleChange,
  type PromotionCatalogueState,
} from "@/lib/admin/promotion-catalogue";

export type PromotionCampaignRow = {
  id: string;
  name: string;
  merchantDescription: string | null;
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

export type PromotionCampaignFilters = {
  state?: "ALL" | PromotionCatalogueState;
  scope?: PromotionTargetScope | "ALL";
  target?: string;
};

export async function getPromotionCampaigns(
  filters: PromotionCampaignFilters = {},
  now = new Date(),
): Promise<PromotionCampaignRow[]> {
  await requirePlatformAdminRead();
  const campaigns = await prisma.promotionCampaign.findMany({
    where: promotionCatalogueWhere({ scope: filters.scope, target: normalizePromotionTargetQuery(filters.target) }),
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      merchantDescription: true,
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
    },
  });
  return campaigns
    .map((campaign) => {
      const state = derivePromotionCatalogueState(campaign, now);
      return {
        ...campaign,
        targetPlanName: campaign.targetPlan?.name ?? null,
        targetShopDomain: campaign.targetShop?.domain ?? null,
        creatorName: campaign.createdByPlatformAdmin.displayName ?? campaign.createdByPlatformAdmin.email,
        lastLifecycleChange: selectLastPromotionLifecycleChange(campaign.events),
        state,
      };
    })
    .filter((campaign) => !filters.state || filters.state === "ALL" || campaign.state === filters.state);
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