import type { PrismaClient } from "@prisma/client";
import {
  isAdminDiscountAssignable,
  isAdminDiscountRunning,
} from "./discount-eligibility";

export async function readAdminDiscountCatalogue(
  database: Pick<PrismaClient, "shopifyDiscount">,
  input: {
    shopId: string;
    platform: "SHOPIFY" | "WOOCOMMERCE";
    catalogueStatus: string;
    catalogueGeneration: number;
    now: Date;
  },
) {
  const discountRows = await database.shopifyDiscount.findMany({
    where: { shopId: input.shopId },
    orderBy: { title: "asc" },
    select: {
      id: true,
      shopId: true,
      title: true,
      shopifyDiscountNodeId: true,
      providerType: true,
      method: true,
      providerStatus: true,
      isAvailable: true,
      fixedSelectable: true,
      startsAt: true,
      endsAt: true,
      unavailableAt: true,
      lastSeenSyncGeneration: true,
    },
  });
  const eligibilityContext = {
    shopId: input.shopId,
    platform: input.platform,
    catalogueStatus: input.catalogueStatus,
    catalogueGeneration: input.catalogueGeneration,
    now: input.now,
  } as const;
  const runningDiscounts = discountRows.filter((discount) =>
    isAdminDiscountRunning({ ...eligibilityContext, discount }),
  );
  const assignableDiscounts = discountRows.filter((discount) =>
    isAdminDiscountAssignable({ ...eligibilityContext, discount }),
  );

  return {
    knownDiscountCount: discountRows.length,
    runningDiscountCount: runningDiscounts.length,
    fixedSelectableCount: assignableDiscounts.length,
    discounts: discountRows.map((discount) => ({
      id: discount.id,
      title: discount.title,
      providerType: discount.providerType,
      providerStatus: discount.providerStatus,
      isAvailable: discount.isAvailable,
      fixedSelectable: discount.fixedSelectable,
      startsAt: discount.startsAt,
      endsAt: discount.endsAt,
      unavailableAt: discount.unavailableAt,
      lastSeenSyncGeneration: discount.lastSeenSyncGeneration,
      assignable: isAdminDiscountAssignable({
        ...eligibilityContext,
        discount,
      }),
    })),
  };
}