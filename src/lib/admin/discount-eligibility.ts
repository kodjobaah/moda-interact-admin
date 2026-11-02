export type AdminDiscountRow = {
  shopId: string;
  shopifyDiscountNodeId: string;
  providerType: string;
  method: "CODE" | "AUTOMATIC";
  providerStatus: string;
  isAvailable: boolean;
  fixedSelectable: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  unavailableAt: Date | null;
  lastSeenSyncGeneration: number;
};

export type AdminDiscountEligibilityInput = {
  shopId: string;
  platform: "SHOPIFY" | "WOOCOMMERCE";
  catalogueStatus: string;
  catalogueGeneration: number;
  discount: AdminDiscountRow;
  now: Date;
};

export function isAdminDiscountRunning({
  shopId,
  platform,
  catalogueStatus,
  catalogueGeneration,
  discount,
  now,
}: AdminDiscountEligibilityInput): boolean {
  if (
    catalogueStatus !== "CURRENT" ||
    discount.shopId !== shopId ||
    discount.unavailableAt !== null ||
    discount.lastSeenSyncGeneration !== catalogueGeneration ||
    discount.providerStatus !== "ACTIVE" ||
    (discount.startsAt !== null && discount.startsAt > now) ||
    (discount.endsAt !== null && discount.endsAt <= now)
  ) {
    return false;
  }

  if (platform === "SHOPIFY") {
    return (
      !discount.shopifyDiscountNodeId.startsWith("woo:") &&
      !discount.providerType.startsWith("WooCoupon:")
    );
  }

  return (
    discount.shopifyDiscountNodeId.startsWith("woo:coupon:") &&
    /^woo:coupon:[1-9]\d*$/.test(discount.shopifyDiscountNodeId) &&
    discount.providerType.startsWith("WooCoupon:")
  );
}

export function isAdminDiscountAssignable(
  input: AdminDiscountEligibilityInput,
): boolean {
  return input.discount.fixedSelectable && isAdminDiscountRunning(input);
}
