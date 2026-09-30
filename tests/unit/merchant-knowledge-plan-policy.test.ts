import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDesiredPlanFeatures,
  ensureMerchantKnowledgeFeature,
  hasCurrentMerchantKnowledgeConfiguration,
  validateMerchantKnowledgeConfiguration,
} from "../../src/lib/admin/merchant-knowledge-plan-policy.ts";
import type { Prisma } from "@prisma/client";

function transactionDouble(
  existingFeature: unknown = null,
  transitionCount = 1,
) {
  const calls: Array<{ model: string; args: unknown }> = [];
  const feature = {
    id: "feature-mk",
    key: "merchant_knowledge",
    displayName: "Persisted wording",
    description: null,
    activationMode: "MERCHANT_OPT_IN",
    systemRequired: false,
    active: true,
  };
  const transaction = {
    feature: {
      findUnique: async (args: unknown) => {
        calls.push({ model: "findUnique", args });
        return existingFeature ?? null;
      },
      create: async (args: unknown) => {
        calls.push({ model: "create", args });
        return feature;
      },
      updateMany: async (args: unknown) => {
        calls.push({ model: "updateMany", args });
        return { count: transitionCount };
      },
    },
    billingAuditEvent: {
      create: async (args: unknown) => {
        calls.push({ model: "audit", args });
        return {};
      },
    },
  } as unknown as Prisma.TransactionClient;
  return { transaction, calls, feature };
}

test("creates the fixed ordinary Feature and audits its creation once", async () => {
  const { transaction, calls, feature } = transactionDouble();
  const result = await ensureMerchantKnowledgeFeature(transaction, "admin-1");
  assert.equal(result, feature);
  assert.deepEqual(calls.map(({ model }) => model), [
    "findUnique",
    "create",
    "audit",
  ]);
  assert.deepEqual(calls[1].args, {
    data: {
      key: "merchant_knowledge",
      displayName: "Merchant Knowledge",
      description:
        "Allow the CommerceAgent to use merchant-managed knowledge sources.",
      activationMode: "MERCHANT_OPT_IN",
      systemRequired: false,
      active: true,
    },
  });
  assert.deepEqual(calls[2].args, {
    data: {
      action: "PLAN_CATALOG_CHANGED",
      platformAdminId: "admin-1",
      reason: "Created Feature merchant_knowledge",
      relatedEntityType: "Feature",
      relatedEntityId: "feature-mk",
    },
  });
});

test("preserves a target-state Feature without writing", async () => {
  const { transaction, calls } = transactionDouble({
    id: "feature-mk",
    key: "merchant_knowledge",
    displayName: "Custom persisted name",
    description: "Existing description",
    activationMode: "MERCHANT_OPT_IN",
    systemRequired: false,
    active: true,
  });
  const feature = await ensureMerchantKnowledgeFeature(transaction, "admin-1");
  assert.equal(feature.displayName, "Custom persisted name");
  assert.deepEqual(calls.map(({ model }) => model), ["findUnique"]);
});

test("transitions only the exact legacy state and audits once without side writes", async () => {
  const { transaction, calls } = transactionDouble({
    id: "feature-mk",
    key: "merchant_knowledge",
    displayName: "Merchant Knowledge",
    description: null,
    activationMode: "ALWAYS_ENABLED",
    systemRequired: false,
    active: true,
  });

  const feature = await ensureMerchantKnowledgeFeature(transaction, "admin-1");

  assert.equal(feature.activationMode, "MERCHANT_OPT_IN");
  assert.deepEqual(calls.map(({ model }) => model), [
    "findUnique",
    "updateMany",
    "audit",
  ]);
  assert.deepEqual(calls[1].args, {
    where: {
      id: "feature-mk",
      activationMode: "ALWAYS_ENABLED",
      systemRequired: false,
      active: true,
    },
    data: { activationMode: "MERCHANT_OPT_IN" },
  });
  assert.deepEqual(calls[2].args, {
    data: {
      action: "PLAN_CATALOG_CHANGED",
      platformAdminId: "admin-1",
      reason:
        "Updated Feature merchant_knowledge activation mode to MERCHANT_OPT_IN",
      relatedEntityType: "Feature",
      relatedEntityId: "feature-mk",
    },
  });
});

test("fails closed without auditing when the exact legacy state changes concurrently", async () => {
  const { transaction, calls } = transactionDouble(
    {
      id: "feature-mk",
      key: "merchant_knowledge",
      displayName: "Merchant Knowledge",
      description: null,
      activationMode: "ALWAYS_ENABLED",
      systemRequired: false,
      active: true,
    },
    0,
  );

  await assert.rejects(
    ensureMerchantKnowledgeFeature(transaction, "admin-1"),
    /Merchant Knowledge Feature has a conflicting configuration\./,
  );
  assert.deepEqual(calls.map(({ model }) => model), [
    "findUnique",
    "updateMany",
  ]);
});

test("rejects conflicting identity or state without rewriting the Feature", async () => {
  for (const values of [
    { activationMode: "MERCHANT_OPT_IN", systemRequired: true, active: true },
    { activationMode: "MERCHANT_OPT_IN", systemRequired: false, active: false },
    { activationMode: "ALWAYS_ENABLED", systemRequired: true, active: true },
    { activationMode: "ALWAYS_ENABLED", systemRequired: false, active: false },
  ]) {
    const { transaction, calls } = transactionDouble({
      id: "feature-mk",
      key: "merchant_knowledge",
      displayName: "Merchant Knowledge",
      description: null,
      ...values,
    });
    await assert.rejects(
      ensureMerchantKnowledgeFeature(transaction, "admin-1"),
      /Merchant Knowledge Feature has a conflicting configuration\./,
    );
    assert.deepEqual(calls.map(({ model }) => model), ["findUnique"]);
  }
});

test("validates Shared C2 and permits only active database source-type pairs", () => {
  const config = {
    schemaVersion: 1,
    maxKnowledgeSources: 3,
    maxContentUnitsPerSource: 500,
    allowedSourceTypes: [{ purposeKey: "FAQ", dataFormatKey: "CSV" }],
  };
  assert.deepEqual(
    validateMerchantKnowledgeConfiguration(config, [
      { purposeKey: "FAQ", dataFormatKey: "CSV" },
    ]),
    config,
  );
  assert.throws(
    () => validateMerchantKnowledgeConfiguration({ ...config, maxKnowledgeSources: 0 }, []),
    /Merchant Knowledge configuration is invalid/,
  );
  assert.throws(
    () =>
      validateMerchantKnowledgeConfiguration(
        { ...config, allowedSourceTypes: [config.allowedSourceTypes[0], config.allowedSourceTypes[0]] },
        [{ purposeKey: "FAQ", dataFormatKey: "CSV" }],
      ),
    /duplicate pairs/,
  );
  assert.throws(
    () => validateMerchantKnowledgeConfiguration(config, []),
    /inactive or unsupported/,
  );
});

test("retains unrelated and inactive mapping configuration while assigning C2 exactly", () => {
  const merchantKnowledgeConfiguration = {
    schemaVersion: 1 as const,
    maxKnowledgeSources: 4,
    maxContentUnitsPerSource: 900,
    allowedSourceTypes: [],
  };
  const desired = buildDesiredPlanFeatures({
    activeFeatures: [
      { id: "system-feature", systemRequired: true },
      { id: "knowledge-feature", systemRequired: false },
    ],
    existingMappings: [
      {
        featureId: "knowledge-feature",
        feature: { active: true },
        configuration: { retained: true, nested: { value: 7 } },
      },
      {
        featureId: "inactive-feature",
        feature: { active: false },
        configuration: { inactiveConfig: "keep" },
      },
      {
        featureId: "new-feature",
        feature: { active: true },
        configuration: undefined,
      },
    ],
    requestedFeatures: [
      { id: "knowledge-feature" },
      { id: "merchant-feature" },
      { id: "new-feature" },
    ],
    merchantKnowledgeFeatureId: "merchant-feature",
    merchantKnowledgeConfiguration,
  });
  assert.deepEqual(
    Object.fromEntries(desired.map(({ featureId, configuration }) => [featureId, configuration])),
    {
      "inactive-feature": { inactiveConfig: "keep" },
      "knowledge-feature": { retained: true, nested: { value: 7 } },
      "merchant-feature": merchantKnowledgeConfiguration,
      "new-feature": {},
      "system-feature": {},
    },
  );
});

test("rollout report distinguishes missing, invalid, stale, and current configurations", () => {
  const activePairs = [{ purposeKey: "FAQ", dataFormatKey: "CSV" }];
  const currentMapping = {
    feature: { key: "merchant_knowledge" },
    configuration: {
      schemaVersion: 1,
      maxKnowledgeSources: 4,
      maxContentUnitsPerSource: 500,
      allowedSourceTypes: [{ purposeKey: "FAQ", dataFormatKey: "CSV" }],
    },
  };
  assert.equal(hasCurrentMerchantKnowledgeConfiguration([], activePairs), false);
  assert.equal(
    hasCurrentMerchantKnowledgeConfiguration(
      [{ ...currentMapping, configuration: { schemaVersion: 2 } }],
      activePairs,
    ),
    false,
  );
  assert.equal(
    hasCurrentMerchantKnowledgeConfiguration(
      [
        {
          ...currentMapping,
          configuration: {
            ...currentMapping.configuration,
            allowedSourceTypes: [
              { purposeKey: "FAQ", dataFormatKey: "XLSX" },
            ],
          },
        },
      ],
      activePairs,
    ),
    false,
  );
  assert.equal(
    hasCurrentMerchantKnowledgeConfiguration([currentMapping], activePairs),
    true,
  );
});