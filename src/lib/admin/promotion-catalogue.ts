import type { PromotionCampaignEventType, PromotionCampaignStatus, PromotionTargetScope } from "@prisma/client";

export type PromotionCatalogueState = "DRAFT" | "SCHEDULED" | "RUNNING" | "EXPIRED" | "CLOSED";

export type PromotionCatalogueCampaign = {
  status: PromotionCampaignStatus;
  startsAt: Date;
  expiresAt: Date;
};

export function derivePromotionCatalogueState(
  campaign: PromotionCatalogueCampaign,
  now: Date,
): PromotionCatalogueState {
  if (campaign.status === "DRAFT") return "DRAFT";
  if (campaign.status === "CLOSED") return "CLOSED";
  if (now < campaign.startsAt) return "SCHEDULED";
  if (now < campaign.expiresAt) return "RUNNING";
  return "EXPIRED";
}

export function normalizePromotionTargetQuery(target: string | undefined): string | undefined {
  const normalized = target?.trim().slice(0, 255);
  return normalized || undefined;
}

export function promotionCatalogueWhere(
  filters: { scope?: PromotionTargetScope | "ALL"; target?: string } = {},
) {
  const target = normalizePromotionTargetQuery(filters.target);
  return {
    ...(filters.scope && filters.scope !== "ALL" ? { scope: filters.scope } : {}),
    ...(target
      ? {
          OR: [
            { name: { contains: target, mode: "insensitive" as const } },
            { targetPlan: { name: { contains: target, mode: "insensitive" as const } } },
            { targetShop: { domain: { contains: target, mode: "insensitive" as const } } },
            { targetPlanId: target },
            { targetShopId: target },
          ],
        }
      : {}),
  };
}

const lifecyclePriority: Record<PromotionCampaignEventType, number> = {
  CREATED: 0,
  ACTIVATED: 1,
  CLOSED: 2,
  REOPENED: 3,
  EXPIRY_CHANGED: 4,
};

export function selectLastPromotionLifecycleChange<T extends { kind: PromotionCampaignEventType; createdAt: Date }>(
  events: T[],
): T | null {
  return events.reduce<T | null>((latest, event) => {
    if (!latest) return event;
    const byTime = event.createdAt.getTime() - latest.createdAt.getTime();
    if (byTime > 0) return event;
    if (byTime === 0 && lifecyclePriority[event.kind] > lifecyclePriority[latest.kind]) return event;
    return latest;
  }, null);
}