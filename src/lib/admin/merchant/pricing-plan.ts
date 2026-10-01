import type {
  Feature,
  MerchantPricingPlan,
  MerchantPricingPlanTranslation,
  MerchantPricingPlanHighlight,
  MerchantPricingPlanHighlightTranslation,
  MerchantPricingUsageEvent,
  MerchantPricingUsageTier,
} from "@prisma/client";
import { CommercePricingPlanModelAssignmentSchema } from "@modainteract/moda-interact-shared/commerce/model";
import { hasCurrentMerchantKnowledgeConfiguration } from "@/lib/admin/merchant-knowledge-plan-policy";
import { requirePlatformAdminRead } from "@/lib/auth/platform-admin";
import { prisma } from "@/lib/prisma";
import type { PageResult } from "@/lib/admin/types";
import type {
  MerchantPricingEconomicsPlan,
  MerchantPricingUsageOffer,
} from "./pricing-economics";

export type MerchantPricingPlanWithChildren = MerchantPricingPlan & {
  features: Array<{ feature: Feature; configuration: unknown }>;
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

export type MerchantKnowledgeSourceTypeOption = {
  purposeKey: string;
  purposeDisplayName: string;
  dataFormatKey: string;
  dataFormatDisplayName: string;
};

export type MerchantKnowledgePlanConfigurationIssue = {
  id: string;
  displayName: string;
};

export const MERCHANT_PRICING_CATALOGUE_PAGE_SIZES = [5, 10, 20, 50] as const;

export type MerchantPricingPlanPageInput = {
  page?: number;
  pageSize?: number;
};

function validateMerchantPricingPlanAssignment<
  T extends {
    id: string;
    shopifyPlanHandle: string;
    commerceModelId: string | null;
  },
>(plan: T): T {
  CommercePricingPlanModelAssignmentSchema.parse({
    merchantPricingPlanId: plan.id,
    shopifyPlanHandle: plan.shopifyPlanHandle,
    modelId: plan.commerceModelId,
  });
  return plan;
}

const merchantPricingInclude = {
  features: {
    include: { feature: true },
    orderBy: { featureId: "asc" as const },
  },
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

function safeMerchantPricingPage(value: number | undefined): number {
  return Math.max(1, Math.trunc(value ?? 1) || 1);
}

function safeMerchantPricingPageSize(value: number | undefined): number {
  const candidate = Math.trunc(
    value ?? MERCHANT_PRICING_CATALOGUE_PAGE_SIZES[0],
  );
  return MERCHANT_PRICING_CATALOGUE_PAGE_SIZES.includes(
    candidate as (typeof MERCHANT_PRICING_CATALOGUE_PAGE_SIZES)[number],
  )
    ? candidate
    : MERCHANT_PRICING_CATALOGUE_PAGE_SIZES[0];
}

export async function getMerchantPricingPlans(
  input: MerchantPricingPlanPageInput = {},
): Promise<PageResult<MerchantPricingPlanWithChildren>> {
  await requirePlatformAdminRead();

  const pageSize = safeMerchantPricingPageSize(input.pageSize);
  const requestedPage = safeMerchantPricingPage(input.page);
  const totalItems = await prisma.merchantPricingPlan.count();
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(requestedPage, totalPages);

  const items = await prisma.merchantPricingPlan.findMany({
    include: merchantPricingInclude,
    orderBy: [{ cataloguePosition: "asc" }, { id: "asc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  return {
    items: items.map(validateMerchantPricingPlanAssignment),
    page,
    pageSize,
    totalItems,
    totalPages,
  };
}

export async function getMerchantKnowledgeSourceTypeCatalogue(): Promise<
  MerchantKnowledgeSourceTypeOption[]
> {
  await requirePlatformAdminRead();
  const rows = await prisma.merchantKnowledgePurposeDataFormat.findMany({
    where: {
      purpose: { active: true },
      dataFormat: { active: true },
    },
    select: {
      purpose: {
        select: { key: true, displayName: true, displayOrder: true },
      },
      dataFormat: {
        select: { key: true, displayName: true, displayOrder: true },
      },
    },
    orderBy: [
      { purpose: { displayOrder: "asc" } },
      { purpose: { key: "asc" } },
      { dataFormat: { displayOrder: "asc" } },
      { dataFormat: { key: "asc" } },
    ],
  });

  return rows.map(({ purpose, dataFormat }) => ({
    purposeKey: purpose.key,
    purposeDisplayName: purpose.displayName,
    dataFormatKey: dataFormat.key,
    dataFormatDisplayName: dataFormat.displayName,
  }));
}

export async function getMerchantKnowledgePlansRequiringConfiguration(): Promise<
  MerchantKnowledgePlanConfigurationIssue[]
> {
  await requirePlatformAdminRead();
  const [plans, sourceTypes] = await Promise.all([
    prisma.merchantPricingPlan.findMany({
      orderBy: [{ cataloguePosition: "asc" }, { id: "asc" }],
      select: {
        id: true,
        displayName: true,
        features: {
          include: { feature: { select: { key: true } } },
        },
      },
    }),
    prisma.merchantKnowledgePurposeDataFormat.findMany({
      where: {
        purpose: { active: true },
        dataFormat: { active: true },
      },
      select: {
        purpose: { select: { key: true } },
        dataFormat: { select: { key: true } },
      },
    }),
  ]);
  const activePairs = sourceTypes.map(({ purpose, dataFormat }) => ({
    purposeKey: purpose.key,
    dataFormatKey: dataFormat.key,
  }));

  return plans
    .filter(
      (plan) =>
        !hasCurrentMerchantKnowledgeConfiguration(plan.features, activePairs),
    )
    .map(({ id, displayName }) => ({ id, displayName }));
}

/**
 * Loads only the catalogue context required by the plan builder.
 *
 * The paginated catalogue list above is the normal plans-page read path. This
 * context is loaded only while the create/edit drawer is open. It deliberately
 * avoids fetching translations and highlights for every plan. Inactive plans
 * only need their scalar catalogue metadata; usage-event economics are loaded
 * for active plans because those are the rows that participate in portfolio
 * economics. The plan currently being edited is loaded separately in full and
 * replaces its catalogue copy inside the builder's projected portfolio.
 */
export async function getMerchantPricingCatalogueContext(): Promise<
  MerchantPricingPlanWithChildren[]
> {
  await requirePlatformAdminRead();

  const [plans, activeUsageEvents] = await Promise.all([
    prisma.merchantPricingPlan.findMany({
      orderBy: [{ cataloguePosition: "asc" }, { id: "asc" }],
      include: { features: { include: { feature: true } } },
    }),
    prisma.merchantPricingPlan.findMany({
      where: { isActive: true },
      select: {
        id: true,
        usageEvents: {
          orderBy: { position: "asc" },
          include: {
            tiers: { orderBy: { position: "asc" } },
          },
        },
      },
    }),
  ]);

  const usageEventsByPlanId = new Map(
    activeUsageEvents.map((plan) => [plan.id, plan.usageEvents] as const),
  );

  return plans.map((plan) =>
    validateMerchantPricingPlanAssignment({
      ...plan,
      translations: [],
      highlights: [],
      usageEvents: usageEventsByPlanId.get(plan.id) ?? [],
    }),
  );
}

export async function getMerchantPricingPlanById(
  id: string,
): Promise<MerchantPricingPlanWithChildren | null> {
  await requirePlatformAdminRead();
  const plan = await prisma.merchantPricingPlan.findUnique({
    where: { id },
    include: merchantPricingInclude,
  });
  return plan ? validateMerchantPricingPlanAssignment(plan) : null;
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
