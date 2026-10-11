import { MerchantKnowledgeFeatureConfigurationSchema } from "@modainteract/moda-interact-shared/merchant-knowledge";
import type { Feature } from "@prisma/client";
import { useEffect, useReducer, useRef } from "react";
import {
  allocateUsageEventClientKey,
  buildMerchantPricingPlanDraftFormFields,
  buildMerchantPricingPlanDraftPayload,
  buildEconomicsConfigurationKey,
  canNavigateTo as selectCanNavigateTo,
  canSubmitMerchantPricingPlan,
  createMerchantPricingPlanDraft,
  isFreePlanOptionDisabled,
  isEconomicsOverrideReady,
  merchantPricingPlanDraftReducer,
  retainInitialMerchantKnowledgeConfiguration,
  selectUnavailableCommerceModelId,
  sourceTypeKey,
  type MerchantPricingPlanDraft,
} from "./merchant-pricing-plan-draft";
import {
  addBuilderTier,
  createEmptyBuilderEvent,
  evaluateBuilderEconomics,
  formatBuilderEventPrice,
  formatMinorUnits,
  hasUnboundedZeroCostFixedEvent,
  initialEvents,
  initialHighlights,
  merchantPricingBuilderEnglishContentUnchanged,
  merchantPricingBuilderMerchantContentValid,
  merchantPricingBuilderRequiredFieldsValid,
  merchantPricingBuilderTranslationsRetained,
  minorUnitsToMoney,
  moveBuilderEvent,
  moveBuilderHighlight,
  serializeBuilderEvent,
  updateBuilderEvent,
  updateBuilderHighlight,
  updateBuilderTier,
  ZERO_COST_USAGE_EVENT_MESSAGE,
  type BuilderEvent,
} from "@/lib/admin/merchant/pricing-plan-builder";
import {
  parseMoneyToMinorUnits,
  resolveMerchantPricingCreatePlacement,
} from "@/lib/admin/merchant/pricing-builder-payload";
import { findUnboundedZeroCostEventLabel } from "@/lib/admin/merchant/pricing-builder-presentation";
import type {
  MerchantKnowledgeSourceTypeOption,
  MerchantPricingPlanWithChildren,
} from "@/lib/admin/merchant/pricing-plan";
import { assessMerchantPricingEconomicsOverride } from "@/lib/admin/merchant/pricing-economics-override";
import { presentMerchantPricingEconomicsResult } from "@/lib/admin/merchant/pricing-economics-presentation";
import { buildSupportedFeatureControls } from "@/lib/admin/merchant/pricing-plan-feature-controls";
import type { MerchantPricingPlanModelOption } from "@/lib/admin/merchant/pricing-plan-model";
import type { MerchantKnowledgeFeatureConfiguration } from "@modainteract/moda-interact-shared/merchant-knowledge";
import { useMerchantPricingAutomaticTranslation } from "./use-merchant-pricing-automatic-translation";
import { merchantPricingAutomaticTranslationCanPersistDraft } from "./merchant-pricing-automatic-translation-state";

export type MerchantPricingPlanDraftControllerInput = {
  plan?: MerchantPricingPlanWithChildren;
  cataloguePlans?: MerchantPricingPlanWithChildren[];
  featureCatalogue?: Feature[];
  merchantKnowledgeSourceTypes?: MerchantKnowledgeSourceTypeOption[];
  commerceModelOptions?: MerchantPricingPlanModelOption[];
  minimumUpgradePremiumBps?: number;
};

function initialKnowledgeConfiguration(
  plan: MerchantPricingPlanWithChildren | undefined,
  sourceTypes: MerchantKnowledgeSourceTypeOption[],
): MerchantKnowledgeFeatureConfiguration | null {
  const mappings =
    plan?.features.filter(
      ({ feature }) => feature.key === "merchant_knowledge",
    ) ?? [];
  if (mappings.length !== 1) return null;
  const parsed = MerchantKnowledgeFeatureConfigurationSchema.safeParse(
    mappings[0].configuration,
  );
  const activePairs = new Set(
    sourceTypes.map(({ purposeKey, dataFormatKey }) =>
      sourceTypeKey(purposeKey, dataFormatKey),
    ),
  );
  return retainInitialMerchantKnowledgeConfiguration(
    mappings.length,
    parsed.success ? parsed.data : null,
    activePairs,
  );
}

export function useMerchantPricingPlanDraft({
  plan,
  cataloguePlans = [],
  featureCatalogue = [],
  merchantKnowledgeSourceTypes = [],
  commerceModelOptions = [],
  minimumUpgradePremiumBps = 2000,
}: MerchantPricingPlanDraftControllerInput) {
  const nextEventKeyRef = useRef(0);
  const cataloguePlanIds = cataloguePlans.map(({ id }) => id);
  const hasFreePlan = cataloguePlans.some(
    (cataloguePlan) => cataloguePlan.planKind === "FREE",
  );
  const initialKnowledge = initialKnowledgeConfiguration(
    plan,
    merchantKnowledgeSourceTypes,
  );
  const [draft, dispatch] = useReducer(
    merchantPricingPlanDraftReducer,
    {
      plan,
      hasFreePlan,
      initialPlacement: plan
        ? "UNCHANGED"
        : resolveMerchantPricingCreatePlacement(
            hasFreePlan ? "PAID_METERED" : "FREE",
            cataloguePlanIds,
          ),
      initialEvents: initialEvents(plan),
      initialHighlights: initialHighlights(plan),
      initialKnowledgeConfiguration: initialKnowledge,
    },
    createMerchantPricingPlanDraft,
  );

  const effectivePlacement =
    !plan && draft.planKind === "FREE"
      ? resolveMerchantPricingCreatePlacement("FREE", cataloguePlanIds)
      : draft.placement;
  const unavailableCommerceModelId = selectUnavailableCommerceModelId(
    draft.commerceModelId,
    commerceModelOptions,
  );
  const supportedFeatureControls = buildSupportedFeatureControls({
    featureCatalogue,
    existingFeatures: plan?.features.map(({ feature }) => feature) ?? [],
    supportedFeatureKeys: draft.supportedFeatureKeys,
  });
  const merchantKnowledgeConfiguration = {
    schemaVersion: 1 as const,
    maxKnowledgeSources: Number(draft.maxKnowledgeSources),
    maxContentUnitsPerSource: Number(draft.maxContentUnitsPerSource),
    allowedSourceTypes: merchantKnowledgeSourceTypes
      .filter(({ purposeKey, dataFormatKey }) =>
        draft.allowedSourceTypeKeys.includes(
          sourceTypeKey(purposeKey, dataFormatKey),
        ),
      )
      .map(({ purposeKey, dataFormatKey }) => ({
        purposeKey,
        dataFormatKey,
      })),
  } as MerchantKnowledgeFeatureConfiguration;
  const merchantKnowledgeConfigurationValid =
    MerchantKnowledgeFeatureConfigurationSchema.safeParse(
      merchantKnowledgeConfiguration,
    ).success;
  const serializedUsageEvents = draft.events.map(serializeBuilderEvent);
  const payload = buildMerchantPricingPlanDraftPayload({
    draft,
    plan,
    cataloguePlanIds,
    effectivePlacement,
    merchantKnowledgeConfiguration,
    serializedUsageEvents,
  });
  const economicsConfigurationKey = buildEconomicsConfigurationKey({
    handle: draft.handle,
    credits: draft.credits,
    currency: draft.currency,
    recurring: draft.recurring,
    effectivePlacement,
    minimumUpgradePremiumBps,
    serializedUsageEvents,
  });
  const previousEconomicsConfigurationKeyRef = useRef(
    economicsConfigurationKey,
  );

  useEffect(() => {
    if (
      previousEconomicsConfigurationKeyRef.current !== economicsConfigurationKey
    ) {
      dispatch({ type: "set-economics-override-enabled", value: false });
      previousEconomicsConfigurationKeyRef.current = economicsConfigurationKey;
    }
  }, [economicsConfigurationKey]);

  const merchantContentValid = merchantPricingBuilderMerchantContentValid({
    description: draft.description,
    highlights: draft.highlights,
  });
  const economicsState = evaluateBuilderEconomics({
    plan,
    cataloguePlans,
    handle: draft.handle,
    name: draft.name,
    credits: draft.credits,
    recurring: draft.recurring,
    currency: draft.currency,
    events: draft.events,
    placement: effectivePlacement,
    minimumUpgradePremiumBps,
  });
  const economicsPreview = economicsState.results;
  const unboundedZeroCostEventLabel = findUnboundedZeroCostEventLabel(
    draft.events,
    parseMoneyToMinorUnits,
  );
  const economicsPassed =
    !economicsState.invalid &&
    economicsPreview.every((result) => result.status === "PASS");
  const economicsOverrideAssessment = assessMerchantPricingEconomicsOverride(
    economicsPreview,
    economicsState.invalid,
  );
  const economicsOverrideAvailable =
    economicsOverrideAssessment.kind === "OVERRIDEABLE";
  const economicsOverrideReasonValid =
    Boolean(draft.economicsOverrideReason.trim()) &&
    draft.economicsOverrideReason.trim().length <= 2000;
  const economicsOverrideReady = isEconomicsOverrideReady({
    overrideAvailable: economicsOverrideAvailable,
    enabled: draft.economicsOverrideEnabled,
    reason: draft.economicsOverrideReason,
  });
  const economicsSatisfied = economicsPassed || economicsOverrideReady;
  const presentedEconomics = economicsPreview.map((result) => ({
    result,
    presentation: presentMerchantPricingEconomicsResult({
      result,
      lowerPlan: economicsState.plansById[result.lowerPlanId],
      higherPlan: economicsState.plansById[result.higherPlanId],
      minimumUpgradePremiumBps,
    }),
  }));
  const failedEconomics = presentedEconomics.filter(
    ({ result }) => result.status !== "PASS",
  );
  const passedEconomics = presentedEconomics.filter(
    ({ result }) => result.status === "PASS",
  );
  const requiredFieldsValid = merchantPricingBuilderRequiredFieldsValid({
    handle: draft.handle,
    name: draft.name,
    currency: draft.currency,
    credits: draft.credits,
    description: draft.description,
    events: draft.events,
    recoveryUsageEventHandle: draft.recoveryUsageEventHandle,
    planKind: draft.planKind,
  });
  const englishContentUnchanged = merchantPricingBuilderEnglishContentUnchanged(
    plan,
    draft.description,
    draft.highlights,
  );
  const translationsRetained = merchantPricingBuilderTranslationsRetained(
    plan,
    draft.description,
    draft.highlights,
  );
  const automaticTranslation = useMerchantPricingAutomaticTranslation({
    active: draft.step === 6,
    translationsRetained,
    merchantPricingPlanId: plan?.id ?? null,
    initialRunId:
      englishContentUnchanged && plan?.currentTranslationRunId
        ? plan.currentTranslationRunId
        : null,
    shopifyPlanHandle: draft.handle,
    englishDescription: draft.description,
    highlights: draft.highlights,
  });
  const translationRunAvailable =
    merchantPricingAutomaticTranslationCanPersistDraft(
      automaticTranslation.run,
    );
  const activationLocked =
    !plan || plan.publicationStatus !== "READY" || !translationsRetained;
  const canSubmit = canSubmitMerchantPricingPlan({
    requiredFieldsValid,
    merchantKnowledgeConfigurationValid,
    reason: draft.reason,
    economicsSatisfied,
  });
  const placementLabel = plan
    ? `Current position (${plan.cataloguePosition + 1})`
    : effectivePlacement === "ONLY"
      ? "This will be the first plan."
      : effectivePlacement.startsWith("BEFORE:")
        ? `First — before ${cataloguePlans[0]?.displayName ?? "the first plan"}`
        : `After ${cataloguePlans.find((cataloguePlan) => effectivePlacement === `AFTER:${cataloguePlan.id}`)?.displayName ?? "the selected plan"}`;
  const canNavigateTo = (targetStep: number) =>
    selectCanNavigateTo({
      currentStep: draft.step,
      targetStep,
      hasUnboundedZeroCostFixedEvent: draft.events.some(
        hasUnboundedZeroCostFixedEvent,
      ),
      merchantContentValid,
      economicsSatisfied,
    });

  function setStep(next: number | ((current: number) => number)) {
    const target = typeof next === "function" ? next(draft.step) : next;
    if (canNavigateTo(target)) dispatch({ type: "set-step", step: target });
  }

  const actions = {
    setStep,
    setName: (value: string) => dispatch({ type: "set-name", value }),
    setHandle: (value: string) => dispatch({ type: "set-handle", value }),
    handlePlanKindChange: (value: "FREE" | "PAID_METERED") =>
      dispatch({
        type: "set-plan-kind",
        value,
        createPlacement: resolveMerchantPricingCreatePlacement(
          value,
          cataloguePlanIds,
        ),
      }),
    setIsActive: (value: boolean) => dispatch({ type: "set-active", value }),
    setFeatured: (value: boolean) => dispatch({ type: "set-featured", value }),
    setCommerceModelId: (value: string) =>
      dispatch({ type: "set-commerce-model", value }),
    setMaxKnowledgeSources: (value: string) =>
      dispatch({ type: "set-max-knowledge-sources", value }),
    setMaxContentUnitsPerSource: (value: string) =>
      dispatch({ type: "set-max-content-units-per-source", value }),
    setSourceType: (key: string, selected: boolean) =>
      dispatch({ type: "set-source-type", key, selected }),
    setCredits: (value: number) => dispatch({ type: "set-credits", value }),
    setRecoveryUsageEventHandle: (value: string) =>
      dispatch({ type: "set-recovery-usage-event-handle", value }),
    setSupportedFeature: (key: string, selected: boolean) =>
      dispatch({ type: "set-supported-feature", key, selected }),
    setCurrency: (value: string) => dispatch({ type: "set-currency", value }),
    setRecurring: (value: string) => dispatch({ type: "set-recurring", value }),
    setPlacement: (value: string) => dispatch({ type: "set-placement", value }),
    setDescription: (value: string) =>
      dispatch({ type: "set-description", value }),
    setReason: (value: string) => dispatch({ type: "set-reason", value }),
    setEconomicsOverrideEnabled: (value: boolean) =>
      dispatch({ type: "set-economics-override-enabled", value }),
    setEconomicsOverrideReason: (value: string) =>
      dispatch({ type: "set-economics-override-reason", value }),
    addEvent: () => {
      const allocation = allocateUsageEventClientKey(
        draft.events.length,
        nextEventKeyRef.current,
      );
      if (!allocation) return;
      nextEventKeyRef.current = allocation.nextKey;
      dispatch({
        type: "add-event",
        event: createEmptyBuilderEvent(allocation.clientKey),
      });
    },
    removeEvent: (index: number) => dispatch({ type: "remove-event", index }),
    moveEvent: (index: number, direction: -1 | 1) =>
      dispatch({ type: "move-event", index, direction }),
    updateEvent: (
      index: number,
      update: Partial<Omit<BuilderEvent, "clientKey">>,
    ) => dispatch({ type: "update-event", index, update }),
    addTier: (eventIndex: number) =>
      dispatch({ type: "add-tier", eventIndex }),
    removeTier: (eventIndex: number, tierIndex: number) =>
      dispatch({ type: "remove-tier", eventIndex, tierIndex }),
    updateTier: (
      eventIndex: number,
      tierIndex: number,
      update: Partial<NonNullable<BuilderEvent["tiers"]>[number]>,
    ) => dispatch({ type: "update-tier", eventIndex, tierIndex, update }),
    addHighlight: () =>
      dispatch({
        type: "add-highlight",
        highlight: {
          contentKey: crypto.randomUUID(),
          title: "",
          description: "",
        },
      }),
    removeHighlight: (index: number) =>
      dispatch({ type: "remove-highlight", index }),
    moveHighlight: (index: number, direction: -1 | 1) =>
      dispatch({ type: "move-highlight", index, direction }),
    updateHighlight: (
      index: number,
      update: Partial<Omit<MerchantPricingPlanDraft["highlights"][number], "contentKey">>,
    ) => dispatch({ type: "update-highlight", index, update }),
    retryAutomaticTranslation: automaticTranslation.retry,
    setSupportedFeatureKeys: (keys: string[]) =>
      dispatch({ type: "replace-supported-features", keys }),
  };

  const formFields = buildMerchantPricingPlanDraftFormFields({
    isEditing: Boolean(plan),
    payload,
    translationRunId:
      translationsRetained || !translationRunAvailable
        ? ""
        : (automaticTranslation.run?.runId ?? ""),
    economicsOverrideReady,
    economicsOverrideReason: draft.economicsOverrideReason,
  });

  return {
    draft,
    actions,
    selectors: {
      hasFreePlan,
      freePlanAlreadyExists: isFreePlanOptionDisabled(
        hasFreePlan,
        plan?.planKind,
      ),
      unavailableCommerceModelId,
      supportedFeatureControls,
      effectivePlacement,
      placementLabel,
      merchantKnowledgeConfiguration,
      merchantKnowledgeConfigurationValid,
      merchantContentValid,
      requiredFieldsValid,
      economicsState,
      economicsPreview,
      economicsPassed,
      economicsOverrideAssessment,
      economicsOverrideAvailable,
      economicsOverrideReasonValid,
      economicsOverrideReady,
      economicsSatisfied,
      presentedEconomics,
      failedEconomics,
      passedEconomics,
      unboundedZeroCostEventLabel,
      translationsRetained,
      automaticTranslation,
      translationRunAvailable,
      activationLocked,
      serializedUsageEvents,
      economicsConfigurationKey,
      payload,
      canSubmit,
      canNavigateTo,
      formFields,
      sourceTypeKey,
      formatBuilderEventPrice,
      formatMinorUnits,
      hasUnboundedZeroCostFixedEvent,
      ZERO_COST_USAGE_EVENT_MESSAGE,
      addBuilderTier,
      moveBuilderEvent,
      moveBuilderHighlight,
      updateBuilderEvent,
      updateBuilderHighlight,
      updateBuilderTier,
      minorUnitsToMoney,
    },
  };
}

export type MerchantPricingPlanDraftController = ReturnType<
  typeof useMerchantPricingPlanDraft
>;