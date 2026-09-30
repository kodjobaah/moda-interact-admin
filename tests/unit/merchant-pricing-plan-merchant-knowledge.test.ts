import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import { buildDesiredPlanFeatures } from "../../src/lib/admin/merchant-knowledge-plan-policy.ts";
import { persistMerchantPricingPlanFeatures } from "../../src/lib/admin/merchant/merchant-pricing-plan-feature-persistence.ts";
import { buildSupportedFeatureControls } from "../../src/lib/admin/merchant/pricing-plan-feature-controls.ts";

function persistenceTransactionDouble() {
  const calls: Array<{ model: string; operation: string; args: unknown }> = [];
  const transaction = {
    merchantPricingPlanFeature: {
      deleteMany: async (args: unknown) => {
        calls.push({
          model: "MerchantPricingPlanFeature",
          operation: "deleteMany",
          args,
        });
        return { count: 0 };
      },
      createMany: async (args: unknown) => {
        calls.push({
          model: "MerchantPricingPlanFeature",
          operation: "createMany",
          args,
        });
        return { count: 0 };
      },
    },
    billingPlanFeature: {
      deleteMany: async (args: unknown) => {
        calls.push({
          model: "BillingPlanFeature",
          operation: "deleteMany",
          args,
        });
        return { count: 0 };
      },
      upsert: async (args: unknown) => {
        calls.push({ model: "BillingPlanFeature", operation: "upsert", args });
        return {};
      },
    },
  } as unknown as Prisma.TransactionClient;
  return { transaction, calls };
}

const merchantKnowledgeConfiguration = {
  schemaVersion: 1 as const,
  maxKnowledgeSources: 4,
  maxContentUnitsPerSource: 900,
  allowedSourceTypes: [
    { purposeKey: "FAQ" as const, dataFormatKey: "CSV" as const },
  ],
};

test("existing Merchant Knowledge mapping renders as one checked locked product-policy control", () => {
  const controls = buildSupportedFeatureControls({
    featureCatalogue: [
      {
        id: "feature-mk",
        key: "merchant_knowledge",
        displayName: "Merchant Knowledge",
        description: "Persisted wording",
        active: true,
        systemRequired: false,
      },
    ],
    existingFeatures: [
      {
        id: "feature-mk",
        key: "merchant_knowledge",
        displayName: "Merchant Knowledge",
        description: "Persisted wording",
        active: true,
        systemRequired: false,
      },
    ],
    supportedFeatureKeys: [],
  });

  const merchantKnowledgeControls = controls.filter(
    ({ key }) => key === "merchant_knowledge",
  );
  assert.equal(merchantKnowledgeControls.length, 1);
  assert.deepEqual(merchantKnowledgeControls[0], {
    key: "merchant_knowledge",
    displayName: "Merchant Knowledge",
    description: null,
    checked: true,
    disabled: true,
    includedByProductPolicy: true,
    systemRequired: false,
    active: true,
  });
});

test("plan create persists exactly one Merchant Knowledge mapping with the validated configuration", async () => {
  const { transaction, calls } = persistenceTransactionDouble();
  const desiredFeatures = [
    { featureId: "feature-mk", configuration: merchantKnowledgeConfiguration },
    { featureId: "feature-other", configuration: { enabledOption: "kept" } },
  ];

  await persistMerchantPricingPlanFeatures(transaction, {
    merchantPricingPlanId: "pricing-plan-created",
    desiredFeatures,
    replaceExisting: false,
  });

  const createCall = calls.find(
    ({ model, operation }) =>
      model === "MerchantPricingPlanFeature" && operation === "createMany",
  );
  assert.deepEqual(createCall?.args, {
    data: [
      {
        merchantPricingPlanId: "pricing-plan-created",
        featureId: "feature-mk",
        configuration: merchantKnowledgeConfiguration,
      },
      {
        merchantPricingPlanId: "pricing-plan-created",
        featureId: "feature-other",
        configuration: { enabledOption: "kept" },
      },
    ],
  });
  assert.equal(
    calls.filter(
      ({ model, args }) =>
        model === "MerchantPricingPlanFeature" &&
        JSON.stringify(args).includes('"feature-mk"'),
    ).length,
    1,
  );
  assert.ok(calls.every(({ model }) => model !== "ShopFeaturePreference"));
});

test("plan update retains other and inactive configurations and mirrors identical Merchant Knowledge JSON", async () => {
  const { transaction, calls } = persistenceTransactionDouble();
  const desiredFeatures = buildDesiredPlanFeatures({
    activeFeatures: [],
    existingMappings: [
      {
        featureId: "feature-other",
        feature: { active: true },
        configuration: { nested: { retained: true } },
      },
      {
        featureId: "feature-inactive",
        feature: { active: false },
        configuration: { inactiveConfig: "preserved" },
      },
    ],
    requestedFeatures: [{ id: "feature-other" }, { id: "feature-mk" }],
    merchantKnowledgeFeatureId: "feature-mk",
    merchantKnowledgeConfiguration,
  });

  await persistMerchantPricingPlanFeatures(transaction, {
    merchantPricingPlanId: "pricing-plan-updated",
    desiredFeatures,
    replaceExisting: true,
    materializedBillingPlanId: "billing-plan-existing",
  });

  const pricingMappings = calls.find(
    ({ model, operation }) =>
      model === "MerchantPricingPlanFeature" && operation === "createMany",
  );
  assert.deepEqual(pricingMappings?.args, {
    data: [
      {
        merchantPricingPlanId: "pricing-plan-updated",
        featureId: "feature-inactive",
        configuration: { inactiveConfig: "preserved" },
      },
      {
        merchantPricingPlanId: "pricing-plan-updated",
        featureId: "feature-mk",
        configuration: merchantKnowledgeConfiguration,
      },
      {
        merchantPricingPlanId: "pricing-plan-updated",
        featureId: "feature-other",
        configuration: { nested: { retained: true } },
      },
    ],
  });
  const merchantKnowledgeMirror = calls.find(
    ({ model, operation, args }) =>
      model === "BillingPlanFeature" &&
      operation === "upsert" &&
      JSON.stringify(args).includes('"feature-mk"'),
  );
  assert.deepEqual(merchantKnowledgeMirror?.args, {
    where: {
      planId_featureId: {
        planId: "billing-plan-existing",
        featureId: "feature-mk",
      },
    },
    create: {
      planId: "billing-plan-existing",
      featureId: "feature-mk",
      enabled: true,
      configuration: merchantKnowledgeConfiguration,
    },
    update: { enabled: true, configuration: merchantKnowledgeConfiguration },
  });
  assert.deepEqual(
    calls
      .filter(
        ({ model, operation }) =>
          model === "BillingPlanFeature" && operation === "upsert",
      )
      .map(({ args }) => args),
    desiredFeatures.map(({ featureId, configuration }) => ({
      where: {
        planId_featureId: {
          planId: "billing-plan-existing",
          featureId,
        },
      },
      create: {
        planId: "billing-plan-existing",
        featureId,
        enabled: true,
        configuration,
      },
      update: { enabled: true, configuration },
    })),
  );
  assert.ok(calls.every(({ model }) => model !== "ShopFeaturePreference"));
});
