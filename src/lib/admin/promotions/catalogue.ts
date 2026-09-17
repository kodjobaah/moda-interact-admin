import type {
  Prisma,
  PromotionCampaignEventType,
  PromotionCampaignStatus,
  PromotionTargetScope,
} from "@prisma/client";

export type PromotionCatalogueState =
  | "DRAFT"
  | "SCHEDULED"
  | "RUNNING"
  | "EXPIRED"
  | "CLOSED";

export const PROMOTION_CATALOGUE_PAGE_SIZES = [5, 10, 20, 50] as const;
export const DEFAULT_PROMOTION_CATALOGUE_PAGE_SIZE = 5;

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

export function parsePromotionCatalogueState(
  value: string | undefined,
): "ALL" | PromotionCatalogueState {
  return value === "DRAFT" ||
    value === "SCHEDULED" ||
    value === "RUNNING" ||
    value === "EXPIRED" ||
    value === "CLOSED"
    ? value
    : "ALL";
}

export function parsePromotionCatalogueScope(
  value: string | undefined,
): "ALL" | PromotionTargetScope {
  return value === "GLOBAL" || value === "PLAN" || value === "SHOP"
    ? value
    : "ALL";
}

export function parsePromotionCataloguePageSize(
  value: string | undefined,
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return PROMOTION_CATALOGUE_PAGE_SIZES.includes(
    parsed as (typeof PROMOTION_CATALOGUE_PAGE_SIZES)[number],
  )
    ? parsed
    : DEFAULT_PROMOTION_CATALOGUE_PAGE_SIZE;
}

export function normalizePromotionTargetQuery(
  target: string | undefined,
): string | undefined {
  const normalized = target?.trim().slice(0, 255);
  return normalized || undefined;
}

function promotionStateWhere(
  state: "ALL" | PromotionCatalogueState | undefined,
  now: Date,
): Prisma.PromotionCampaignWhereInput | null {
  switch (state) {
    case "DRAFT":
      return { status: "DRAFT" };
    case "CLOSED":
      return { status: "CLOSED" };
    case "SCHEDULED":
      return { status: "ACTIVE", startsAt: { gt: now } };
    case "RUNNING":
      return {
        status: "ACTIVE",
        startsAt: { lte: now },
        expiresAt: { gt: now },
      };
    case "EXPIRED":
      return { status: "ACTIVE", expiresAt: { lte: now } };
    default:
      return null;
  }
}

export function promotionCatalogueWhere(
  filters: {
    state?: "ALL" | PromotionCatalogueState;
    scope?: PromotionTargetScope | "ALL";
    target?: string;
  } = {},
  now = new Date(),
): Prisma.PromotionCampaignWhereInput {
  const target = normalizePromotionTargetQuery(filters.target);
  const conditions: Prisma.PromotionCampaignWhereInput[] = [];
  const stateCondition = promotionStateWhere(filters.state, now);

  if (stateCondition) conditions.push(stateCondition);
  if (filters.scope && filters.scope !== "ALL") {
    conditions.push({ scope: filters.scope });
  }
  if (target) {
    conditions.push({
      OR: [
        { name: { contains: target, mode: "insensitive" } },
        { targetPlan: { name: { contains: target, mode: "insensitive" } } },
        { targetShop: { domain: { contains: target, mode: "insensitive" } } },
        { targetPlanId: target },
        { targetShopId: target },
      ],
    });
  }

  return conditions.length ? { AND: conditions } : {};
}

const lifecyclePriority: Record<PromotionCampaignEventType, number> = {
  CREATED: 0,
  ACTIVATED: 1,
  CLOSED: 2,
  REOPENED: 3,
  EXPIRY_CHANGED: 4,
};

export function selectLastPromotionLifecycleChange<
  T extends { kind: PromotionCampaignEventType; createdAt: Date },
>(events: T[]): T | null {
  return events.reduce<T | null>((latest, event) => {
    if (!latest) return event;
    const byTime = event.createdAt.getTime() - latest.createdAt.getTime();
    if (byTime > 0) return event;
    if (
      byTime === 0 &&
      lifecyclePriority[event.kind] > lifecyclePriority[latest.kind]
    )
      return event;
    return latest;
  }, null);
}
