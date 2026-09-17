import type {
  MerchantPricingPlan,
  MerchantPricingPlanTranslation,
  MerchantPricingPlanHighlight,
  MerchantPricingPlanHighlightTranslation,
  MerchantPricingUsageEvent,
  MerchantPricingUsageTier,
} from "@prisma/client";
import { requirePlatformAdminRead } from "@/lib/auth/platform-admin";
import { prisma } from "@/lib/prisma";
import type {
  MerchantPricingEconomicsPlan,
  MerchantPricingUsageOffer,
} from "./pricing-economics";

export type MerchantPricingPlanWithChildren = MerchantPricingPlan & {
  translations: MerchantPricingPlanTranslation[];
  highlights: Array<
    MerchantPricingPlanHighlight & {
      translations: MerchantPricingPlanHighlightTranslation[];
    }
  >;
  usageEvents: Array<
    MerchantPricingUsageEvent & { tiers: MerchantPricingUsageTier[] }
  >;
};

const merchantPricingInclude = {
  translations: { orderBy: { locale: "asc" as const } },
  highlights: {
    orderBy: { position: "asc" as const },
    include: { translations: { orderBy: { locale: "asc" as const } } },
  },
  usageEvents: {
    orderBy: { position: "asc" as const },
    include: { tiers: { orderBy: { position: "asc" as const } } },
  },
};

export async function getMerchantPricingPlans(): Promise<
  MerchantPricingPlanWithChildren[]
> {
  await requirePlatformAdminRead();
  return prisma.merchantPricingPlan.findMany({
    include: merchantPricingInclude,
    orderBy: { cataloguePosition: "asc" },
  });
}

export async function getMerchantPricingPlanById(
  id: string,
): Promise<MerchantPricingPlanWithChildren | null> {
  await requirePlatformAdminRead();
  return prisma.merchantPricingPlan.findUnique({
    where: { id },
    include: merchantPricingInclude,
  });
}

export function toMerchantPricingEconomicsPlan(
  plan: MerchantPricingPlanWithChildren,
): MerchantPricingEconomicsPlan {
  const usageEvents: MerchantPricingUsageOffer[] = plan.usageEvents.map(
    (event) => ({
      eventHandle: event.eventHandle,
      creditsGrantedPerUnit: event.creditsGrantedPerUnit,
      maximumUnitsPerBillingPeriod: event.maximumUnitsPerBillingPeriod,
      pricing:
        event.pricingMode === "FIXED"
          ? {
              mode: "FIXED",
              currency: event.currency,
              unitAmountMinor: event.fixedUnitAmountMinor ?? 0,
            }
          : {
              mode: event.pricingMode,
              currency: event.currency,
              tiers: event.tiers.map((tier) => ({
                upTo: tier.upTo,
                amountPerUnitMinor: tier.amountPerUnitMinor,
                flatAmountMinor: tier.flatAmountMinor,
              })),
            },
    }),
  );
  return {
    id: plan.id,
    shopifyPlanHandle: plan.shopifyPlanHandle,
    name: plan.displayName,
    includedRecoveryCredits: plan.includedRecoveryCredits,
    recurringAmountMinor: plan.recurringAmountMinor,
    currency: plan.currency,
    usageEvents,
  };
}

export function merchantPricingDescription(
  plan: MerchantPricingPlanWithChildren,
): string {
  return (
    plan.translations.find((translation) => translation.locale === "en")
      ?.merchantDescription ?? ""
  );
}
