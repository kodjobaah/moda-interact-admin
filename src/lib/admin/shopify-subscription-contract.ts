import type { MerchantPricingBillingPeriod, MerchantPricingUsagePricingMode } from "@prisma/client";

const DEFAULT_API_VERSION = "2026-07";


type PartnerTier = { upTo: number | null; amountPerUnit: string | number; amount: string | number };

type PartnerItem = {
  handle: string;
  description: string | null;
  price:
    | { __typename: "FlatRatePrice"; active: boolean; currency: string; amount: string | number }
    | { __typename: "TieredPrice"; active: boolean; currency: string; tiersMode: "VOLUME" | "GRADUATED"; tiers: PartnerTier[] };
};

type ActiveSubscription = {
  billingPeriod: "EVERY_30_DAYS" | "ANNUAL";
  legacySubscriptionId: string | null;
  items: PartnerItem[];
};

export type MerchantContractPlan = {
  shopifyPlanHandle: string;
  recurringAmountMinor: number;
  currency: string;
  billingPeriod: MerchantPricingBillingPeriod;
  usageEvents: Array<{
    eventHandle: string;
    pricingMode: MerchantPricingUsagePricingMode;
    currency: string;
    fixedUnitAmountMinor: number | null;
    tiers: Array<{ upTo: number | null; amountPerUnitMinor: number; flatAmountMinor: number }>;
  }>;
};

export type ShopifyContractValidation = {
  status: "VERIFIED" | "MISMATCH" | "UNAVAILABLE";
  mismatches: string[];
  providerBillingPeriod: string | null;
  providerSubscriptionId: string | null;
  providerItems: Array<{ handle: string; pricingType: string; currency: string }>;
};

function minor(amount: string | number): number | null {
  const numeric = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(numeric)) return null;
  return Math.round(numeric * 100);
}

function sorted(values: string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function sameStringSet(a: string[], b: string[]): boolean {
  return JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
}

function partnerConfig() {
  const organizationId =
    process.env.SHOPIFY_PARTNER_ORGANIZATION_ID ?? process.env.SHOPIFY_PARTNER_ORG_ID;
  const token =
    process.env.SHOPIFY_PARTNER_API_TOKEN ?? process.env.SHOPIFY_PARTNERS_TOKEN;
  const appId = process.env.SHOPIFY_APP_ID;
  const apiVersion = process.env.SHOPIFY_PARTNER_API_VERSION ?? DEFAULT_API_VERSION;
  if (!organizationId || !token || !appId) return null;
  return { organizationId, token, appId, apiVersion };
}

async function loadActiveSubscription(shopifyShopId: string): Promise<ActiveSubscription | null> {
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
      payload.errors.map((error) => error.message ?? "Unknown Partner API error").join("; "),
    );
  }
  return payload.data?.activeSubscription ?? null;
}

export async function validateShopifySubscriptionContract(input: {
  shopifyShopId: string | null;
  plan: MerchantContractPlan;
}): Promise<ShopifyContractValidation> {
  if (!input.shopifyShopId) {
    return {
      status: "UNAVAILABLE",
      mismatches: ["The tenant has no Shopify shop GID, so the provider subscription cannot be verified."],
      providerBillingPeriod: null,
      providerSubscriptionId: null,
      providerItems: [],
    };
  }

  let provider: ActiveSubscription | null;
  try {
    provider = await loadActiveSubscription(input.shopifyShopId);
  } catch (error) {
    return {
      status: "UNAVAILABLE",
      mismatches: [error instanceof Error ? error.message : "Shopify subscription validation failed."],
      providerBillingPeriod: null,
      providerSubscriptionId: null,
      providerItems: [],
    };
  }

  if (!provider) {
    return {
      status: "MISMATCH",
      mismatches: ["Shopify reports no active managed-pricing subscription for this shop."],
      providerBillingPeriod: null,
      providerSubscriptionId: null,
      providerItems: [],
    };
  }

  const mismatches: string[] = [];
  const expectedPeriod = input.plan.billingPeriod;
  if (provider.billingPeriod !== expectedPeriod) {
    mismatches.push(`Billing period differs: catalogue ${expectedPeriod}; Shopify ${provider.billingPeriod}.`);
  }

  const expectedCurrency = input.plan.currency.trim().toUpperCase();
  const expectedUsageHandles = input.plan.usageEvents.map((event) => event.eventHandle.trim());
  const providerUsageHandles = provider.items
    .filter((item) => item.price.__typename === "TieredPrice" || expectedUsageHandles.includes(item.handle))
    .map((item) => item.handle)
    .filter((handle) => handle !== input.plan.shopifyPlanHandle);

  if (!sameStringSet(expectedUsageHandles, providerUsageHandles)) {
    mismatches.push(
      `Usage meter handles differ: catalogue [${sorted(expectedUsageHandles).join(", ") || "none"}]; Shopify [${sorted(providerUsageHandles).join(", ") || "none"}].`,
    );
  }

  const recurringCandidates = provider.items.filter(
    (item) => item.price.__typename === "FlatRatePrice" && !expectedUsageHandles.includes(item.handle),
  );
  if (input.plan.recurringAmountMinor === 0) {
    const nonZero = recurringCandidates.filter(
      (item) => item.price.__typename === "FlatRatePrice" && minor(item.price.amount) !== 0,
    );
    if (nonZero.length) {
      mismatches.push("Catalogue recurring price is 0, but Shopify has a non-zero recurring flat-rate item.");
    }
  } else if (recurringCandidates.length !== 1) {
    mismatches.push(
      `Expected exactly one recurring flat-rate Shopify item, found ${recurringCandidates.length}.`,
    );
  } else {
    const recurring = recurringCandidates[0].price;
    if (recurring.__typename === "FlatRatePrice") {
      const providerMinor = minor(recurring.amount);
      if (providerMinor !== input.plan.recurringAmountMinor) {
        mismatches.push(
          `Recurring amount differs: catalogue ${input.plan.recurringAmountMinor} minor units; Shopify ${providerMinor ?? "invalid"}.`,
        );
      }
      if (recurring.currency.toUpperCase() !== expectedCurrency) {
        mismatches.push(`Recurring currency differs: catalogue ${expectedCurrency}; Shopify ${recurring.currency}.`);
      }
    }
  }

  for (const event of input.plan.usageEvents) {
    const item = provider.items.find((candidate) => candidate.handle === event.eventHandle);
    if (!item) continue;
    if (item.price.currency.toUpperCase() !== event.currency.trim().toUpperCase()) {
      mismatches.push(`Usage meter ${event.eventHandle} currency differs.`);
    }

    if (event.pricingMode === "FIXED") {
      if (item.price.__typename === "FlatRatePrice") {
        if (minor(item.price.amount) !== event.fixedUnitAmountMinor) {
          mismatches.push(`Usage meter ${event.eventHandle} fixed price differs.`);
        }
      } else {
        const tiers = item.price.tiers;
        if (
          tiers.length !== 1 ||
          tiers[0].upTo !== null ||
          minor(tiers[0].amountPerUnit) !== event.fixedUnitAmountMinor ||
          minor(tiers[0].amount) !== 0
        ) {
          mismatches.push(`Usage meter ${event.eventHandle} does not match the catalogue fixed-unit price.`);
        }
      }
      continue;
    }

    if (item.price.__typename !== "TieredPrice") {
      mismatches.push(`Usage meter ${event.eventHandle} is ${event.pricingMode} in the catalogue but is not tiered in Shopify.`);
      continue;
    }
    if (item.price.tiersMode !== event.pricingMode) {
      mismatches.push(`Usage meter ${event.eventHandle} mode differs: catalogue ${event.pricingMode}; Shopify ${item.price.tiersMode}.`);
    }
    if (item.price.tiers.length !== event.tiers.length) {
      mismatches.push(`Usage meter ${event.eventHandle} tier count differs.`);
      continue;
    }
    event.tiers.forEach((tier, index) => {
      const providerTier = item.price.__typename === "TieredPrice" ? item.price.tiers[index] : null;
      if (!providerTier) return;
      if (
        providerTier.upTo !== tier.upTo ||
        minor(providerTier.amountPerUnit) !== tier.amountPerUnitMinor ||
        minor(providerTier.amount) !== tier.flatAmountMinor
      ) {
        mismatches.push(`Usage meter ${event.eventHandle} tier ${index + 1} differs from Shopify.`);
      }
    });
  }

  return {
    status: mismatches.length ? "MISMATCH" : "VERIFIED",
    mismatches,
    providerBillingPeriod: provider.billingPeriod,
    providerSubscriptionId: provider.legacySubscriptionId,
    providerItems: provider.items.map((item) => ({
      handle: item.handle,
      pricingType: item.price.__typename,
      currency: item.price.currency,
    })),
  };
}
