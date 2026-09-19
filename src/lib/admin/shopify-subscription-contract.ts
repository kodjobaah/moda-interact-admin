import type {
  MerchantPricingBillingPeriod,
  MerchantPricingPlanKind,
  MerchantPricingUsagePricingMode,
} from "@prisma/client";

const DEFAULT_API_VERSION = "2026-07";

type PartnerTier = {
  upTo: number | null;
  amountPerUnit: string | number;
  amount: string | number;
};

type PartnerItem = {
  handle: string;
  description: string | null;
  price:
    | {
        __typename: "FlatRatePrice";
        active: boolean;
        currency: string;
        amount: string | number;
      }
    | {
        __typename: "TieredPrice";
        active: boolean;
        currency: string;
        tiersMode: "VOLUME" | "GRADUATED";
        tiers: PartnerTier[];
      };
};

type ActiveSubscription = {
  billingPeriod: "EVERY_30_DAYS" | "ANNUAL";
  legacySubscriptionId: string | null;
  items: PartnerItem[];
};

export type MerchantContractPlan = {
  shopifyPlanHandle: string;
  planKind: MerchantPricingPlanKind;
  recurringAmountMinor: number;
  currency: string;
  billingPeriod: MerchantPricingBillingPeriod;
  shopifyRecoveryUsageEventHandle: string | null;
  usageEvents: Array<{
    eventHandle: string;
    pricingMode: MerchantPricingUsagePricingMode;
    currency: string;
    fixedUnitAmountMinor: number | null;
    tiers: Array<{
      upTo: number | null;
      amountPerUnitMinor: number;
      flatAmountMinor: number;
    }>;
  }>;
};

export type ShopifyContractValidation = {
  status: "VERIFIED" | "MONETARY_MISMATCH" | "MISMATCH" | "UNAVAILABLE";
  mismatches: string[];
  blockingMismatches: string[];
  monetaryMismatches: string[];
  providerBillingPeriod: string | null;
  providerSubscriptionId: string | null;
  providerItems: Array<{
    handle: string;
    pricingType: string;
    currency: string;
  }>;
};

function minor(amount: string | number): number | null {
  const numeric = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(numeric)) return null;
  return Math.round(numeric * 100);
}

function partnerConfig() {
  const organizationId =
    process.env.SHOPIFY_PARTNER_ORGANIZATION_ID ??
    process.env.SHOPIFY_PARTNER_ORG_ID;
  const token =
    process.env.SHOPIFY_PARTNER_API_TOKEN ??
    process.env.SHOPIFY_PARTNER_ACCESS_TOKEN;
  const appId = process.env.SHOPIFY_APP_ID;
  const apiVersion =
    process.env.SHOPIFY_PARTNER_API_VERSION ?? DEFAULT_API_VERSION;
  if (!organizationId || !token || !appId) return null;
  return { organizationId, token, appId, apiVersion };
}

async function loadActiveSubscription(
  shopifyShopId: string,
): Promise<ActiveSubscription | null> {
  const config = partnerConfig();
  if (!config) {
    throw new Error(
      "Shopify Partner API is not configured. Set SHOPIFY_PARTNER_ORGANIZATION_ID, SHOPIFY_PARTNER_API_TOKEN and SHOPIFY_APP_ID.",
    );
  }

  const response = await fetch(
    `https://partners.shopify.com/${encodeURIComponent(config.organizationId)}/api/${config.apiVersion}/graphql.json`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-shopify-access-token": config.token,
      },
      cache: "no-store",
      body: JSON.stringify({
        query: `query AdminActiveSubscription($appId: ID!, $shopId: ID!) {
          activeSubscription(appId: $appId, shopId: $shopId) {
            billingPeriod
            legacySubscriptionId
            items {
              handle
              description
              price {
                __typename
                active
                currency
                ... on FlatRatePrice { amount }
                ... on TieredPrice {
                  tiersMode
                  tiers { upTo amountPerUnit amount }
                }
              }
            }
          }
        }`,
        variables: { appId: config.appId, shopId: shopifyShopId },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Shopify Partner API returned HTTP ${response.status}.`);
  }
  const payload = (await response.json()) as {
    data?: { activeSubscription?: ActiveSubscription | null };
    errors?: Array<{ message?: string }>;
  };
  if (payload.errors?.length) {
    throw new Error(
      payload.errors
        .map((error) => error.message ?? "Unknown Partner API error")
        .join("; "),
    );
  }
  return payload.data?.activeSubscription ?? null;
}

function unavailableValidation(message: string): ShopifyContractValidation {
  return {
    status: "UNAVAILABLE",
    mismatches: [message],
    blockingMismatches: [message],
    monetaryMismatches: [],
    providerBillingPeriod: null,
    providerSubscriptionId: null,
    providerItems: [],
  };
}

export async function validateShopifySubscriptionContract(input: {
  shopifyShopId: string | null;
  plan: MerchantContractPlan;
}): Promise<ShopifyContractValidation> {
  if (!input.shopifyShopId) {
    return unavailableValidation(
      "The tenant has no Shopify shop GID, so the provider subscription cannot be verified.",
    );
  }

  let provider: ActiveSubscription | null;
  try {
    provider = await loadActiveSubscription(input.shopifyShopId);
  } catch (error) {
    return unavailableValidation(
      error instanceof Error
        ? error.message
        : "Shopify subscription validation failed.",
    );
  }

  if (!provider) {
    const message =
      "Shopify reports no active managed-pricing subscription for this shop.";
    return {
      status: "MISMATCH",
      mismatches: [message],
      blockingMismatches: [message],
      monetaryMismatches: [],
      providerBillingPeriod: null,
      providerSubscriptionId: null,
      providerItems: [],
    };
  }

  const blockingMismatches: string[] = [];
  const monetaryMismatches: string[] = [];
  const expectedPlanHandle = input.plan.shopifyPlanHandle.trim();

  if (provider.billingPeriod !== input.plan.billingPeriod) {
    blockingMismatches.push(
      `Billing period differs: catalogue ${input.plan.billingPeriod}; Shopify ${provider.billingPeriod}.`,
    );
  }

  const planItems = provider.items.filter(
    (item) => item.handle.trim() === expectedPlanHandle,
  );
  if (planItems.length !== 1) {
    blockingMismatches.push(
      planItems.length === 0
        ? `Shopify active subscription does not contain the exact plan handle ${expectedPlanHandle}.`
        : `Shopify active subscription contains ${planItems.length} items with plan handle ${expectedPlanHandle}; expected exactly one.`,
    );
  } else {
    const planItem = planItems[0];
    if (planItem.price.__typename !== "FlatRatePrice") {
      blockingMismatches.push(
        `Shopify item ${expectedPlanHandle} is ${planItem.price.__typename}; the subscription plan item must be FlatRatePrice.`,
      );
    } else {
      const expectedCurrency = input.plan.currency.trim().toUpperCase();
      const providerAmountMinor = minor(planItem.price.amount);
      const recurringMonetaryMismatches: string[] = [];

      if (providerAmountMinor !== input.plan.recurringAmountMinor) {
        recurringMonetaryMismatches.push(
          `Recurring amount differs: catalogue ${input.plan.recurringAmountMinor} minor units; Shopify ${providerAmountMinor ?? "invalid"}.`,
        );
      }
      if (planItem.price.currency.toUpperCase() !== expectedCurrency) {
        recurringMonetaryMismatches.push(
          `Recurring currency differs: catalogue ${expectedCurrency}; Shopify ${planItem.price.currency}.`,
        );
      }

      if (input.plan.planKind === "PAID_METERED") {
        monetaryMismatches.push(...recurringMonetaryMismatches);
      } else {
        blockingMismatches.push(...recurringMonetaryMismatches);
      }
    }
  }

  if (input.plan.planKind === "PAID_METERED") {
    const recoveryUsageHandle =
      input.plan.shopifyRecoveryUsageEventHandle?.trim() ?? "";
    if (!recoveryUsageHandle) {
      blockingMismatches.push(
        "The paid MerchantPricing plan has no recovery usage-event handle configured.",
      );
    } else if (
      !provider.items.some(
        (item) => item.handle.trim() === recoveryUsageHandle,
      )
    ) {
      blockingMismatches.push(
        `Shopify active subscription does not contain the configured recovery usage-event handle ${recoveryUsageHandle}.`,
      );
    }
  }

  // Optional/top-up usage-event prices and tier representations are deliberately
  // not mapping gates. Shopify remains authoritative for live monetary values and
  // the commerce surfaces intersect catalogue handles with the provider items.
  const mismatches = [...blockingMismatches, ...monetaryMismatches];
  const status: ShopifyContractValidation["status"] = blockingMismatches.length
    ? "MISMATCH"
    : monetaryMismatches.length
      ? "MONETARY_MISMATCH"
      : "VERIFIED";

  return {
    status,
    mismatches,
    blockingMismatches,
    monetaryMismatches,
    providerBillingPeriod: provider.billingPeriod,
    providerSubscriptionId: provider.legacySubscriptionId,
    providerItems: provider.items.map((item) => ({
      handle: item.handle,
      pricingType: item.price.__typename,
      currency: item.price.currency,
    })),
  };
}
