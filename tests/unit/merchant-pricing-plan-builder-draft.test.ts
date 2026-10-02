import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMerchantPricingPlanDraftPayload,
  buildEconomicsConfigurationKey,
  buildMerchantPricingPlanDraftFormFields,
  canNavigateTo,
  canSubmitMerchantPricingPlan,
  createMerchantPricingPlanDraft,
  allocateUsageEventClientKey,
  isEconomicsOverrideReady,
  isFreePlanOptionDisabled,
  merchantPricingPlanDraftReducer,
  retainInitialMerchantKnowledgeConfiguration,
  selectUnavailableCommerceModelId,
  sourceTypeKey,
  validMerchantPricingTranslationJson,
  type MerchantPricingPlanDraft,
} from "../../src/components/admin/merchant/merchant-pricing-plan-builder/merchant-pricing-plan-draft.ts";

function draft(overrides: Partial<MerchantPricingPlanDraft> = {}): MerchantPricingPlanDraft {
  return {
    isEditing: false,
    step: 0,
    name: "",
    handle: "",
    planKind: "FREE",
    isActive: true,
    featured: false,
    commerceModelId: "",
    maxKnowledgeSources: "",
    maxContentUnitsPerSource: "",
    allowedSourceTypeKeys: [],
    credits: 0,
    recoveryUsageEventHandle: "recovery-handle",
    supportedFeatureKeys: [],
    currency: "USD",
    recurring: "0",
    placement: "ONLY",
    description: "",
    reason: "",
    economicsOverrideEnabled: false,
    economicsOverrideReason: "",
    events: [],
    highlights: [],
    translationJson: "",
    translationResult: null,
    ...overrides,
  };
}

test("new draft defaults to FREE without a FREE plan and PAID_METERED when one exists", () => {
  const create = (hasFreePlan: boolean) =>
    createMerchantPricingPlanDraft({
      hasFreePlan,
      initialPlacement: "ONLY",
      initialEvents: [],
      initialHighlights: [],
      initialKnowledgeConfiguration: null,
    });

  assert.equal(create(false).planKind, "FREE");
  assert.equal(create(true).planKind, "PAID_METERED");
});

test("FREE plan option is disabled only for a non-FREE edit when a FREE plan exists", () => {
  assert.equal(isFreePlanOptionDisabled(false, undefined), false);
  assert.equal(isFreePlanOptionDisabled(true, undefined), true);
  assert.equal(isFreePlanOptionDisabled(true, "PAID_METERED"), true);
  assert.equal(isFreePlanOptionDisabled(true, "FREE"), false);
});

test("plan-kind changes recompute placement only for create drafts", () => {
  const createDraft = draft();
  const editDraft = draft({ isEditing: true, placement: "UNCHANGED" });

  assert.equal(
    merchantPricingPlanDraftReducer(createDraft, {
      type: "set-plan-kind",
      value: "PAID_METERED",
      createPlacement: "AFTER:last",
    }).placement,
    "AFTER:last",
  );
  assert.equal(
    merchantPricingPlanDraftReducer(editDraft, {
      type: "set-plan-kind",
      value: "FREE",
      createPlacement: "BEFORE:first",
    }).placement,
    "UNCHANGED",
  );
});

test("FREE payload clears the recovery handle and always includes Merchant Knowledge", () => {
  const current = draft({
    planKind: "FREE",
    recoveryUsageEventHandle: "saved-meter",
    supportedFeatureKeys: ["feature-a"],
  });
  const payload = buildMerchantPricingPlanDraftPayload({
    draft: current,
    cataloguePlanIds: [],
    effectivePlacement: "ONLY",
    merchantKnowledgeConfiguration: {
      schemaVersion: 1,
      maxKnowledgeSources: 1,
      maxContentUnitsPerSource: 1,
      allowedSourceTypes: [],
    },
    serializedUsageEvents: [],
  });

  assert.equal(payload.shopifyRecoveryUsageEventHandle, null);
  assert.equal(current.recoveryUsageEventHandle, "saved-meter");
  assert.deepEqual(payload.supportedFeatureKeys, ["feature-a", "merchant_knowledge"]);
  const disabledGenericFeature = merchantPricingPlanDraftReducer(current, {
    type: "set-supported-feature",
    key: "feature-a",
    selected: false,
  });
  const afterToggle = buildMerchantPricingPlanDraftPayload({
    draft: disabledGenericFeature,
    cataloguePlanIds: [],
    effectivePlacement: "ONLY",
    merchantKnowledgeConfiguration: {
      schemaVersion: 1,
      maxKnowledgeSources: 1,
      maxContentUnitsPerSource: 1,
      allowedSourceTypes: [],
    },
    serializedUsageEvents: [],
  });
  assert.deepEqual(afterToggle.supportedFeatureKeys, ["merchant_knowledge"]);
});

test("navigation gates only forward movement from the three guarded steps", () => {
  const navigation = {
    currentStep: 0,
    targetStep: 0,
    hasUnboundedZeroCostFixedEvent: false,
    merchantContentValid: false,
    economicsSatisfied: false,
  };

  assert.equal(canNavigateTo({ ...navigation, currentStep: 3, targetStep: 4 }), true);
  assert.equal(canNavigateTo({ ...navigation, currentStep: 3, targetStep: 4, hasUnboundedZeroCostFixedEvent: true }), false);
  assert.equal(canNavigateTo({ ...navigation, currentStep: 3, targetStep: 4, hasUnboundedZeroCostFixedEvent: false }), true);
  assert.equal(canNavigateTo({ ...navigation, currentStep: 4, targetStep: 5 }), false);
  assert.equal(canNavigateTo({ ...navigation, currentStep: 4, targetStep: 5, merchantContentValid: true }), true);
  assert.equal(canNavigateTo({ ...navigation, currentStep: 5, targetStep: 6 }), false);
  assert.equal(canNavigateTo({ ...navigation, currentStep: 5, targetStep: 6, economicsSatisfied: true }), true);
  assert.equal(canNavigateTo({ ...navigation, currentStep: 5, targetStep: 4 }), true);
  assert.equal(canNavigateTo({ ...navigation, currentStep: 5, targetStep: 0 }), true);
  assert.equal(canNavigateTo({ ...navigation, currentStep: 2, targetStep: 4 }), false);
});

test("submit selector requires each independent readiness condition", () => {
  const ready = {
    requiredFieldsValid: true,
    merchantKnowledgeConfigurationValid: true,
    reason: "approved",
    economicsSatisfied: true,
    translationsRetained: false,
    translationValid: true,
  };

  assert.equal(canSubmitMerchantPricingPlan(ready), true);
  for (const key of [
    "requiredFieldsValid",
    "merchantKnowledgeConfigurationValid",
    "economicsSatisfied",
    "translationValid",
  ] as const) {
    assert.equal(canSubmitMerchantPricingPlan({ ...ready, [key]: false }), false);
  }
  assert.equal(canSubmitMerchantPricingPlan({ ...ready, reason: "  " }), false);
  assert.equal(canSubmitMerchantPricingPlan({ ...ready, reason: "x".repeat(2000) }), true);
  assert.equal(canSubmitMerchantPricingPlan({ ...ready, reason: "x".repeat(2001) }), false);
  assert.equal(
    canSubmitMerchantPricingPlan({ ...ready, translationsRetained: true, translationValid: false }),
    true,
  );
});

test("Merchant Knowledge configuration is retained only for one valid mapping with active source pairs", () => {
  const configuration = {
    schemaVersion: 1 as const,
    maxKnowledgeSources: 3,
    maxContentUnitsPerSource: 20,
    allowedSourceTypes: [{ purposeKey: "FAQ" as const, dataFormatKey: "CSV" as const }],
  };
  const activePairs = new Set([sourceTypeKey("FAQ", "CSV")]);

  assert.deepEqual(
    retainInitialMerchantKnowledgeConfiguration(1, configuration, activePairs),
    configuration,
  );
  assert.equal(retainInitialMerchantKnowledgeConfiguration(0, configuration, activePairs), null);
  assert.equal(retainInitialMerchantKnowledgeConfiguration(2, configuration, activePairs), null);
  assert.equal(retainInitialMerchantKnowledgeConfiguration(1, null, activePairs), null);
  assert.equal(
    retainInitialMerchantKnowledgeConfiguration(1, configuration, new Set()),
    null,
  );
});

test("unavailable saved Commerce model remains selected for deliberate repair", () => {
  assert.equal(selectUnavailableCommerceModelId("retired-model", []), "retired-model");
  assert.equal(
    selectUnavailableCommerceModelId("active-model", [{ id: "active-model" }]),
    null,
  );
  assert.equal(selectUnavailableCommerceModelId("", []), null);
});

test("usage-event identity allocation starts at zero and a full list consumes no key", () => {
  assert.deepEqual(allocateUsageEventClientKey(0, 0), {
    clientKey: "new-usage-event-0",
    nextKey: 1,
  });
  assert.deepEqual(allocateUsageEventClientKey(4, 7), {
    clientKey: "new-usage-event-7",
    nextKey: 8,
  });
  assert.equal(allocateUsageEventClientKey(5, 8), null);
});

test("economics override readiness is bounded and requires an available enabled override", () => {
  const available = { overrideAvailable: true, enabled: true, reason: " approved " };
  assert.equal(isEconomicsOverrideReady(available), true);
  assert.equal(isEconomicsOverrideReady({ ...available, overrideAvailable: false }), false);
  assert.equal(isEconomicsOverrideReady({ ...available, enabled: false }), false);
  assert.equal(isEconomicsOverrideReady({ ...available, reason: " " }), false);
  assert.equal(isEconomicsOverrideReady({ ...available, reason: "x".repeat(2001) }), false);
});

test("economics invalidation key contains exactly the current configuration fields", () => {
  const baseline = {
    handle: " plan ",
    credits: 5,
    currency: " usd ",
    recurring: "10.00",
    effectivePlacement: "ONLY",
    minimumUpgradePremiumBps: 2000,
    serializedUsageEvents: [
      {
        adminLabel: "Recovery",
        eventHandle: "recovery",
        creditsGrantedPerUnit: 1,
        maximumUnitsPerBillingPeriod: null,
        pricingMode: "FIXED" as const,
        fixedUnitAmount: "1.00",
      },
    ],
  };
  const key = buildEconomicsConfigurationKey(baseline);

  assert.equal(
    buildEconomicsConfigurationKey({ ...baseline, handle: "plan" }),
    key,
  );
  assert.equal(
    buildEconomicsConfigurationKey({ ...baseline, currency: "USD" }),
    key,
  );
  assert.notEqual(buildEconomicsConfigurationKey({ ...baseline, handle: "other" }), key);
  assert.notEqual(buildEconomicsConfigurationKey({ ...baseline, credits: 6 }), key);
  assert.notEqual(buildEconomicsConfigurationKey({ ...baseline, currency: "EUR" }), key);
  assert.notEqual(buildEconomicsConfigurationKey({ ...baseline, recurring: "11.00" }), key);
  assert.notEqual(buildEconomicsConfigurationKey({ ...baseline, effectivePlacement: "AFTER:p1" }), key);
  assert.notEqual(buildEconomicsConfigurationKey({ ...baseline, minimumUpgradePremiumBps: 2100 }), key);
  assert.notEqual(
    buildEconomicsConfigurationKey({
      ...baseline,
      serializedUsageEvents: [...baseline.serializedUsageEvents, {
        adminLabel: "Extra",
        eventHandle: "extra",
        creditsGrantedPerUnit: 1,
        maximumUnitsPerBillingPeriod: 2,
        pricingMode: "FIXED",
        fixedUnitAmount: "2.00",
      }],
    }),
    key,
  );

  const current = draft({ economicsOverrideEnabled: true });
  const unrelatedUpdates = [
    { type: "set-name", value: "Renamed" },
    { type: "set-commerce-model", value: "model-2" },
    { type: "set-max-knowledge-sources", value: "4" },
    { type: "set-description", value: "Updated description" },
    { type: "set-reason", value: "Admin reason" },
    { type: "set-economics-override-reason", value: "New override reason" },
    { type: "set-source-type", key: "faq\u001ftext", selected: true },
    { type: "set-supported-feature", key: "feature", selected: true },
    { type: "set-translation", rawJson: "{}", result: null },
    {
      type: "add-highlight",
      highlight: { contentKey: "new-highlight", title: "New", description: "New" },
    },
  ] as const;
  const updated = unrelatedUpdates.reduce(
    (state, action) => merchantPricingPlanDraftReducer(state, action),
    current,
  );
  assert.equal(updated.economicsOverrideEnabled, true);
  assert.equal(
    buildEconomicsConfigurationKey({
      handle: current.handle,
      credits: current.credits,
      currency: current.currency,
      recurring: current.recurring,
      effectivePlacement: current.placement,
      minimumUpgradePremiumBps: 2000,
      serializedUsageEvents: [],
    }),
    buildEconomicsConfigurationKey({
      handle: updated.handle,
      credits: updated.credits,
      currency: updated.currency,
      recurring: updated.recurring,
      effectivePlacement: updated.placement,
      minimumUpgradePremiumBps: 2000,
      serializedUsageEvents: [],
    }),
  );
});

test("reducer preserves event, tier, highlight, and externally generated identity transitions", () => {
  const event = {
    clientKey: "usage-1",
    adminLabel: "Usage",
    eventHandle: "usage",
    creditsGrantedPerUnit: 1,
    maximumUnitsPerBillingPeriod: null,
    pricingMode: "GRADUATED" as const,
    tiers: [{ upTo: null, amountPerUnit: "1", flatAmount: "0" }],
  };
  const highlight = { contentKey: "uuid-from-ui", title: "Title", description: "Details" };
  const initial = draft({ events: [event], highlights: [highlight] });
  const added = merchantPricingPlanDraftReducer(initial, {
    type: "add-tier",
    eventIndex: 0,
  });
  assert.equal(added.events[0].tiers?.length, 2);
  assert.equal(
    merchantPricingPlanDraftReducer(added, {
      type: "update-tier",
      eventIndex: 0,
      tierIndex: 1,
      update: { amountPerUnit: "3" },
    }).events[0].tiers?.[1].amountPerUnit,
    "3",
  );
  assert.equal(
    merchantPricingPlanDraftReducer(added, {
      type: "remove-tier",
      eventIndex: 0,
      tierIndex: 0,
    }).events[0].tiers?.length,
    1,
  );
  assert.deepEqual(
    merchantPricingPlanDraftReducer(initial, {
      type: "add-highlight",
      highlight: { contentKey: "another-ui-uuid", title: "", description: "" },
    }).highlights.map(({ contentKey }) => contentKey),
    ["uuid-from-ui", "another-ui-uuid"],
  );
  assert.equal(
    merchantPricingPlanDraftReducer(initial, {
      type: "update-highlight",
      index: 0,
      update: { title: "Changed" },
    }).highlights[0].title,
    "Changed",
  );
  assert.equal(
    merchantPricingPlanDraftReducer(initial, {
      type: "add-event",
      event: { ...event, clientKey: "new-usage-event-0" },
    }).events[1].clientKey,
    "new-usage-event-0",
  );
  const secondEvent = { ...event, clientKey: "usage-2", eventHandle: "usage-2" };
  const twoEvents = draft({ events: [event, secondEvent] });
  assert.deepEqual(
    merchantPricingPlanDraftReducer(twoEvents, {
      type: "move-event",
      index: 0,
      direction: 1,
    }).events.map(({ clientKey }) => clientKey),
    ["usage-2", "usage-1"],
  );
  assert.deepEqual(
    merchantPricingPlanDraftReducer(twoEvents, {
      type: "remove-event",
      index: 0,
    }).events.map(({ clientKey }) => clientKey),
    ["usage-2"],
  );
  assert.equal(
    merchantPricingPlanDraftReducer(twoEvents, {
      type: "update-event",
      index: 1,
      update: { adminLabel: "Updated" },
    }).events[1].adminLabel,
    "Updated",
  );
  const fullDraft = draft({ events: Array.from({ length: 5 }, (_, index) => ({
    ...event,
    clientKey: `usage-${index}`,
  })) });
  assert.equal(
    merchantPricingPlanDraftReducer(fullDraft, {
      type: "add-event",
      event: { ...event, clientKey: "must-not-be-added" },
    }),
    fullDraft,
  );
});

test("hidden fields preserve the existing action and override serialization contract", () => {
  assert.deepEqual(
    buildMerchantPricingPlanDraftFormFields({
      isEditing: true,
      payload: { plan: "value" },
      translationJson: "{}",
      economicsOverrideReady: true,
      economicsOverrideReason: " approved ",
    }),
    {
      intent: "update",
      payload: '{"plan":"value"}',
      translationJson: "{}",
      economicsOverrideRequested: "true",
      economicsOverrideReason: "approved",
    },
  );
  assert.deepEqual(
    buildMerchantPricingPlanDraftFormFields({
      isEditing: false,
      payload: null,
      translationJson: "{}",
      economicsOverrideReady: false,
      economicsOverrideReason: "ignored",
    }),
    {
      intent: "create",
      payload: "null",
      translationJson: "{}",
      economicsOverrideRequested: "false",
      economicsOverrideReason: "",
    },
  );
});

test("translation JSON preserves the existing precedence and raw non-empty value", () => {
  const currentTemplate = { current: true };
  const retainedTemplate = { retained: true };

  assert.equal(
    validMerchantPricingTranslationJson({
      translationJson: "uploaded",
      translationValid: true,
      retainedTemplate,
      currentTemplate,
    }),
    "uploaded",
  );
  assert.equal(
    validMerchantPricingTranslationJson({
      translationJson: "uploaded",
      translationValid: false,
      retainedTemplate,
      currentTemplate,
    }),
    JSON.stringify(retainedTemplate),
  );
  assert.equal(
    validMerchantPricingTranslationJson({
      translationJson: "  raw invalid  ",
      translationValid: false,
      retainedTemplate: null,
      currentTemplate,
    }),
    "  raw invalid  ",
  );
  assert.equal(
    validMerchantPricingTranslationJson({
      translationJson: "",
      translationValid: false,
      retainedTemplate: null,
      currentTemplate,
    }),
    JSON.stringify(currentTemplate),
  );
});