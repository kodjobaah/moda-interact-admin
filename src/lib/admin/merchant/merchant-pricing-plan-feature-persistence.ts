import type { Prisma } from "@prisma/client";
import type { DesiredPlanFeature } from "../merchant-knowledge-plan-policy";

export async function persistMerchantPricingPlanFeatures(
  transaction: Prisma.TransactionClient,
  {
    merchantPricingPlanId,
    desiredFeatures,
    replaceExisting,
    materializedBillingPlanId,
  }: {
    merchantPricingPlanId: string;
    desiredFeatures: readonly DesiredPlanFeature[];
    replaceExisting: boolean;
    materializedBillingPlanId?: string;
  },
): Promise<void> {
  if (replaceExisting) {
    await transaction.merchantPricingPlanFeature.deleteMany({
      where: { merchantPricingPlanId },
    });
  }
  await transaction.merchantPricingPlanFeature.createMany({
    data: desiredFeatures.map(({ featureId, configuration }) => ({
      merchantPricingPlanId,
      featureId,
      configuration,
    })),
  });

  if (!materializedBillingPlanId) return;

  const desiredFeatureIds = desiredFeatures.map(({ featureId }) => featureId);
  await transaction.billingPlanFeature.deleteMany({
    where: {
      planId: materializedBillingPlanId,
      featureId: { notIn: desiredFeatureIds },
    },
  });
  for (const { featureId, configuration } of desiredFeatures) {
    await transaction.billingPlanFeature.upsert({
      where: {
        planId_featureId: {
          planId: materializedBillingPlanId,
          featureId,
        },
      },
      create: {
        planId: materializedBillingPlanId,
        featureId,
        enabled: true,
        configuration,
      },
      update: { enabled: true, configuration },
    });
  }
}
