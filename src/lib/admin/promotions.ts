import type { PromotionCampaignStatus, PromotionTargetScope } from "@prisma/client";
import { requirePlatformAdminRead } from "@/lib/auth/platform-admin";
import { prisma } from "@/lib/prisma";

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
};

export async function getPromotionCampaigns(): Promise<PromotionCampaignRow[]> {
  await requirePlatformAdminRead();
  return prisma.promotionCampaign.findMany({
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
    },
  }).then((campaigns) =>
    campaigns.map((campaign) => ({
      ...campaign,
      targetPlanName: campaign.targetPlan?.name ?? null,
      targetShopDomain: campaign.targetShop?.domain ?? null,
    })),
  );
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