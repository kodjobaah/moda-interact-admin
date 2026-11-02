import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isAdminDiscountAssignable,
  isAdminDiscountRunning,
  type AdminDiscountEligibilityInput,
} from "../../src/lib/admin/discount-eligibility";

const now = new Date("2026-11-02T12:00:00.000Z");

function fixture(
  overrides: Partial<AdminDiscountEligibilityInput["discount"]> = {},
  context: Partial<
    Omit<AdminDiscountEligibilityInput, "discount" | "now">
  > = {},
): AdminDiscountEligibilityInput {
  return {
    shopId: "shop-1",
    platform: "WOOCOMMERCE",
    catalogueStatus: "CURRENT",
    catalogueGeneration: 4,
    now,
    ...context,
    discount: {
      shopId: "shop-1",
      shopifyDiscountNodeId: "woo:coupon:27",
      providerType: "WooCoupon:percent",
      method: "CODE",
      providerStatus: "ACTIVE",
      isAvailable: false,
      fixedSelectable: true,
      startsAt: null,
      endsAt: null,
      unavailableAt: null,
      lastSeenSyncGeneration: 4,
      ...overrides,
    },
  };
}

test("Woo provider validity and assignability are independent of merchant selection", () => {
  assert.equal(isAdminDiscountRunning(fixture()), true);
  assert.equal(isAdminDiscountAssignable(fixture()), true);
  assert.equal(isAdminDiscountAssignable(fixture({ isAvailable: true })), true);
});

test("Shopify provider validity is independent of merchant selection", () => {
  const context = { platform: "SHOPIFY" as const };
  for (const isAvailable of [false, true]) {
    assert.equal(
      isAdminDiscountAssignable(
        fixture(
          {
            shopifyDiscountNodeId: "gid://shopify/Discount/1",
            providerType: "ShopifyDiscountCode",
            method: "CODE",
            isAvailable,
          },
          context,
        ),
      ),
      true,
    );
  }
  assert.equal(
    isAdminDiscountAssignable(
      fixture(
        {
          shopifyDiscountNodeId: "woo:coupon:27",
          providerType: "WooCoupon:percent",
          isAvailable: true,
        },
        context,
      ),
    ),
    false,
  );
});

test("stale, unavailable, expired, removed, and unselectable Woo rows are rejected", () => {
  assert.equal(
    isAdminDiscountAssignable(fixture({}, { catalogueGeneration: 5 })),
    false,
  );
  assert.equal(
    isAdminDiscountAssignable(fixture({ unavailableAt: now })),
    false,
  );
  assert.equal(
    isAdminDiscountAssignable(fixture({ lastSeenSyncGeneration: 3 })),
    false,
  );
  assert.equal(
    isAdminDiscountAssignable(fixture({ providerStatus: "REMOVED" })),
    false,
  );
  assert.equal(
    isAdminDiscountAssignable(fixture({ fixedSelectable: false })),
    false,
  );
  assert.equal(isAdminDiscountAssignable(fixture({ endsAt: now })), false);
  assert.equal(
    isAdminDiscountAssignable(
      fixture({ startsAt: new Date(now.getTime() + 1) }),
    ),
    false,
  );
  assert.equal(
    isAdminDiscountAssignable(fixture({}, { catalogueStatus: "ERROR" })),
    false,
  );
});

test("foreign-shop and malformed provider identities cannot be assigned", () => {
  assert.equal(isAdminDiscountAssignable(fixture({ shopId: "shop-2" })), false);
  assert.equal(
    isAdminDiscountAssignable(
      fixture({ shopifyDiscountNodeId: "woo:coupon:0" }),
    ),
    false,
  );
  assert.equal(
    isAdminDiscountAssignable(fixture({ providerType: "ShopifyDiscountCode" })),
    false,
  );
});
