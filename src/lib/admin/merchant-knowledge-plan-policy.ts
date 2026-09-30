import {
  BillingAuditAction,
  FeatureActivationMode,
  Prisma,
  type Feature,
} from "@prisma/client";
import {
  MerchantKnowledgeFeatureConfigurationSchema,
  type MerchantKnowledgeFeatureConfiguration,
} from "@modainteract/moda-interact-shared/merchant-knowledge";

export const MERCHANT_KNOWLEDGE_FEATURE_KEY = "merchant_knowledge" as const;

export const MERCHANT_KNOWLEDGE_FEATURE_DESCRIPTOR = {
  key: "merchant_knowledge",
  displayName: "Merchant Knowledge",
  description:
    "Allow the CommerceAgent to use merchant-managed knowledge sources.",
  activationMode: "ALWAYS_ENABLED",
  systemRequired: false,
  active: true,
} as const;

export function validateMerchantKnowledgeConfiguration(
  value: unknown,
  activePairs: readonly { purposeKey: string; dataFormatKey: string }[],
): MerchantKnowledgeFeatureConfiguration {
  const parsed = MerchantKnowledgeFeatureConfigurationSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(
      `Merchant Knowledge configuration is invalid: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    );
  }

  const activePairKeys = new Set(
    activePairs.map(({ purposeKey, dataFormatKey }) =>
      `${purposeKey}\u001f${dataFormatKey}`,
    ),
  );
  if (
    parsed.data.allowedSourceTypes.some(
      ({ purposeKey, dataFormatKey }) =>
        !activePairKeys.has(`${purposeKey}\u001f${dataFormatKey}`),
    )
  ) {
    throw new Error(
      "One or more selected Merchant Knowledge source types are inactive or unsupported.",
    );
  }

  return parsed.data;
}

export function hasCurrentMerchantKnowledgeConfiguration(
  featureMappings: readonly {
    feature: { key: string };
    configuration: unknown;
  }[],
  activePairs: readonly { purposeKey: string; dataFormatKey: string }[],
): boolean {
  const mappings = featureMappings.filter(
    ({ feature }) => feature.key === MERCHANT_KNOWLEDGE_FEATURE_KEY,
  );
  if (mappings.length !== 1) return false;
  try {
    validateMerchantKnowledgeConfiguration(
      mappings[0].configuration,
      activePairs,
    );
    return true;
  } catch {
    return false;
  }
}

export type DesiredPlanFeature = {
  featureId: string;
  configuration: Prisma.InputJsonValue | Prisma.NullTypes.JsonNull;
};

export function buildDesiredPlanFeatures({
  activeFeatures,
  existingMappings,
  requestedFeatures,
  merchantKnowledgeFeatureId,
  merchantKnowledgeConfiguration,
}: {
  activeFeatures: readonly { id: string; systemRequired: boolean }[];
  existingMappings: readonly {
    featureId: string;
    configuration: unknown;
    feature: { active: boolean };
  }[];
  requestedFeatures: readonly { id: string }[];
  merchantKnowledgeFeatureId: string;
  merchantKnowledgeConfiguration: MerchantKnowledgeFeatureConfiguration;
}): DesiredPlanFeature[] {
  const existingByFeatureId = new Map(
    existingMappings.map((mapping) => [mapping.featureId, mapping]),
  );
  const desiredIds = new Set<string>([
    ...activeFeatures
      .filter((feature) => feature.systemRequired)
      .map((feature) => feature.id),
    ...existingMappings
      .filter(({ feature }) => !feature.active)
      .map(({ featureId }) => featureId),
    ...requestedFeatures.map((feature) => feature.id),
    merchantKnowledgeFeatureId,
  ]);

  return [...desiredIds].sort().map((featureId) => {
    if (featureId === merchantKnowledgeFeatureId) {
      return {
        featureId,
        configuration:
          merchantKnowledgeConfiguration as Prisma.InputJsonValue,
      };
    }
    const existingConfiguration = existingByFeatureId.get(featureId)?.configuration;
    return {
      featureId,
      configuration:
        existingConfiguration === undefined
          ? {}
          : existingConfiguration === null
            ? Prisma.JsonNull
            : (existingConfiguration as Prisma.InputJsonValue),
    };
  });
}

export async function ensureMerchantKnowledgeFeature(
  transaction: Prisma.TransactionClient,
  platformAdminId: string,
): Promise<Feature> {
  const existing = await transaction.feature.findUnique({
    where: { key: MERCHANT_KNOWLEDGE_FEATURE_KEY },
  });
  if (existing) {
    if (
      existing.activationMode !== FeatureActivationMode.ALWAYS_ENABLED ||
      existing.systemRequired ||
      !existing.active
    ) {
      throw new Error(
        "Merchant Knowledge Feature has a conflicting configuration.",
      );
    }
    return existing;
  }

  const feature = await transaction.feature.create({
    data: MERCHANT_KNOWLEDGE_FEATURE_DESCRIPTOR,
  });
  await transaction.billingAuditEvent.create({
    data: {
      action: BillingAuditAction.PLAN_CATALOG_CHANGED,
      platformAdminId,
      reason: "Created Feature merchant_knowledge",
      relatedEntityType: "Feature",
      relatedEntityId: feature.id,
    },
  });
  return feature;
}