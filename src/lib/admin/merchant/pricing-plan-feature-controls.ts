export const MERCHANT_KNOWLEDGE_FEATURE_KEY = "merchant_knowledge" as const;

type FeatureControlSource = {
  id: string;
  key: string;
  displayName: string;
  description: string | null;
  active: boolean;
  systemRequired: boolean;
};

export type SupportedFeatureControl = {
  key: string;
  displayName: string;
  description: string | null;
  checked: boolean;
  disabled: boolean;
  includedByProductPolicy: boolean;
  systemRequired: boolean;
  active: boolean;
};

export function buildSupportedFeatureControls({
  featureCatalogue,
  existingFeatures,
  supportedFeatureKeys,
}: {
  featureCatalogue: readonly FeatureControlSource[];
  existingFeatures: readonly FeatureControlSource[];
  supportedFeatureKeys: readonly string[];
}): SupportedFeatureControl[] {
  const featuresById = new Map<string, FeatureControlSource>();
  for (const feature of featureCatalogue) {
    if (
      feature.active ||
      existingFeatures.some(({ id }) => id === feature.id)
    ) {
      featuresById.set(feature.id, feature);
    }
  }
  for (const feature of existingFeatures) {
    featuresById.set(feature.id, feature);
  }

  return [
    {
      key: MERCHANT_KNOWLEDGE_FEATURE_KEY,
      displayName: "Merchant Knowledge",
      description: null,
      checked: true,
      disabled: true,
      includedByProductPolicy: true,
      systemRequired: false,
      active: true,
    },
    ...[...featuresById.values()]
      .filter(({ key }) => key !== MERCHANT_KNOWLEDGE_FEATURE_KEY)
      .map((feature) => ({
        key: feature.key,
        displayName: feature.displayName,
        description: feature.description,
        checked:
          supportedFeatureKeys.includes(feature.key) || feature.systemRequired,
        disabled: feature.systemRequired || !feature.active,
        includedByProductPolicy: false,
        systemRequired: feature.systemRequired,
        active: feature.active,
      })),
  ];
}
