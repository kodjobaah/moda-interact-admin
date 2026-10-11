import type {
  MerchantPricingBuilderEvent,
  MerchantPricingBuilderHighlight,
} from "../../../../lib/admin/merchant/pricing-builder-payload.ts";
import type { MerchantPricingPlanWithChildren } from "../../../../lib/admin/merchant/pricing-plan.ts";
import type { BuilderEvent } from "../../../../lib/admin/merchant/pricing-plan-builder.ts";
import type { MerchantKnowledgeFeatureConfiguration } from "@modainteract/moda-interact-shared/merchant-knowledge";

export const MERCHANT_KNOWLEDGE_FEATURE_KEY = "merchant_knowledge";

export type MerchantPricingPlanDraft = {
  isEditing: boolean;
  step: number;
  name: string;
  handle: string;
  planKind: "FREE" | "PAID_METERED";
  isActive: boolean;
  featured: boolean;
  commerceModelId: string;
  maxKnowledgeSources: string;
  maxContentUnitsPerSource: string;
  allowedSourceTypeKeys: string[];
  credits: number;
  recoveryUsageEventHandle: string;
  supportedFeatureKeys: string[];
  currency: string;
  recurring: string;
  placement: string;
  description: string;
  reason: string;
  economicsOverrideEnabled: boolean;
  economicsOverrideReason: string;
  events: BuilderEvent[];
  highlights: MerchantPricingBuilderHighlight[];
};

export type CreateMerchantPricingPlanDraftInput = {
  plan?: MerchantPricingPlanWithChildren;
  hasFreePlan: boolean;
  initialPlacement: string;
  initialEvents: BuilderEvent[];
  initialHighlights: MerchantPricingBuilderHighlight[];
  initialKnowledgeConfiguration: MerchantKnowledgeFeatureConfiguration | null;
};

export type MerchantPricingPlanDraftAction =
  | { type: "set-step"; step: number }
  | { type: "set-name"; value: string }
  | { type: "set-handle"; value: string }
  | { type: "set-plan-kind"; value: "FREE" | "PAID_METERED"; createPlacement: string }
  | { type: "set-active"; value: boolean }
  | { type: "set-featured"; value: boolean }
  | { type: "set-commerce-model"; value: string }
  | { type: "set-max-knowledge-sources"; value: string }
  | { type: "set-max-content-units-per-source"; value: string }
  | { type: "set-source-type"; key: string; selected: boolean }
  | { type: "set-credits"; value: number }
  | { type: "set-recovery-usage-event-handle"; value: string }
  | { type: "set-supported-feature"; key: string; selected: boolean }
  | { type: "replace-supported-features"; keys: string[] }
  | { type: "set-currency"; value: string }
  | { type: "set-recurring"; value: string }
  | { type: "set-placement"; value: string }
  | { type: "set-description"; value: string }
  | { type: "set-reason"; value: string }
  | { type: "set-economics-override-enabled"; value: boolean }
  | { type: "set-economics-override-reason"; value: string }
  | { type: "add-event"; event: BuilderEvent }
  | { type: "remove-event"; index: number }
  | { type: "move-event"; index: number; direction: -1 | 1 }
  | { type: "update-event"; index: number; update: Partial<Omit<BuilderEvent, "clientKey">> }
  | { type: "add-tier"; eventIndex: number }
  | { type: "remove-tier"; eventIndex: number; tierIndex: number }
  | { type: "update-tier"; eventIndex: number; tierIndex: number; update: Partial<NonNullable<BuilderEvent["tiers"]>[number]> }
  | { type: "add-highlight"; highlight: MerchantPricingBuilderHighlight }
  | { type: "remove-highlight"; index: number }
  | { type: "move-highlight"; index: number; direction: -1 | 1 }
  | { type: "update-highlight"; index: number; update: Partial<Omit<MerchantPricingBuilderHighlight, "contentKey">> };

export function sourceTypeKey(purposeKey: string, dataFormatKey: string): string {
  return `${purposeKey}\u001f${dataFormatKey}`;
}

export function retainInitialMerchantKnowledgeConfiguration(
  mappingCount: number,
  parsedConfiguration: MerchantKnowledgeFeatureConfiguration | null,
  activeSourceTypeKeys: ReadonlySet<string>,
): MerchantKnowledgeFeatureConfiguration | null {
  if (mappingCount !== 1 || !parsedConfiguration) return null;
  return parsedConfiguration.allowedSourceTypes.every(({ purposeKey, dataFormatKey }) =>
    activeSourceTypeKeys.has(sourceTypeKey(purposeKey, dataFormatKey)),
  )
    ? parsedConfiguration
    : null;
}

export function isFreePlanOptionDisabled(
  hasFreePlan: boolean,
  currentPlanKind: "FREE" | "PAID_METERED" | undefined,
): boolean {
  return hasFreePlan && currentPlanKind !== "FREE";
}

export function selectUnavailableCommerceModelId(
  commerceModelId: string,
  modelOptions: readonly { id: string }[],
): string | null {
  return commerceModelId && !modelOptions.some(({ id }) => id === commerceModelId)
    ? commerceModelId
    : null;
}

export function allocateUsageEventClientKey(
  currentEventCount: number,
  nextKey: number,
): { clientKey: string; nextKey: number } | null {
  if (currentEventCount >= 5) return null;
  return {
    clientKey: `new-usage-event-${nextKey}`,
    nextKey: nextKey + 1,
  };
}

export function isEconomicsOverrideReady(input: {
  overrideAvailable: boolean;
  enabled: boolean;
  reason: string;
}): boolean {
  const reason = input.reason.trim();
  return (
    input.overrideAvailable &&
    input.enabled &&
    Boolean(reason) &&
    reason.length <= 2000
  );
}

export function buildMerchantPricingPlanDraftFormFields(input: {
  isEditing: boolean;
  payload: unknown;
  translationRunId: string;
  economicsOverrideReady: boolean;
  economicsOverrideReason: string;
}): {
  intent: "create" | "update";
  payload: string;
  translationRunId: string;
  economicsOverrideRequested: "true" | "false";
  economicsOverrideReason: string;
} {
  return {
    intent: input.isEditing ? "update" : "create",
    payload: JSON.stringify(input.payload),
    translationRunId: input.translationRunId,
    economicsOverrideRequested: input.economicsOverrideReady ? "true" : "false",
    economicsOverrideReason: input.economicsOverrideReady
      ? input.economicsOverrideReason.trim()
      : "",
  };
}

export function createMerchantPricingPlanDraft({
  plan,
  hasFreePlan,
  initialPlacement,
  initialEvents,
  initialHighlights,
  initialKnowledgeConfiguration,
}: CreateMerchantPricingPlanDraftInput): MerchantPricingPlanDraft {
  return {
    isEditing: Boolean(plan),
    step: 0,
    name: plan?.displayName ?? "",
    handle: plan?.shopifyPlanHandle ?? "",
    planKind: plan?.planKind ?? (hasFreePlan ? "PAID_METERED" : "FREE"),
    isActive: plan?.isActive ?? false,
    featured: plan?.featured ?? false,
    commerceModelId: plan?.commerceModelId ?? "",
    maxKnowledgeSources: initialKnowledgeConfiguration
      ? String(initialKnowledgeConfiguration.maxKnowledgeSources)
      : "",
    maxContentUnitsPerSource: initialKnowledgeConfiguration
      ? String(initialKnowledgeConfiguration.maxContentUnitsPerSource)
      : "",
    allowedSourceTypeKeys:
      initialKnowledgeConfiguration?.allowedSourceTypes.map(({ purposeKey, dataFormatKey }) =>
        sourceTypeKey(purposeKey, dataFormatKey),
      ) ?? [],
    credits: plan?.includedRecoveryCredits ?? 0,
    recoveryUsageEventHandle: plan?.shopifyRecoveryUsageEventHandle ?? "",
    supportedFeatureKeys:
      plan?.features
        .map(({ feature }) => feature.key)
        .filter((key) => key !== MERCHANT_KNOWLEDGE_FEATURE_KEY) ?? [],
    currency: plan?.currency ?? "USD",
    recurring: plan ? `${Math.floor(plan.recurringAmountMinor / 100)}.${String(plan.recurringAmountMinor % 100).padStart(2, "0")}` : "0",
    placement: plan ? "UNCHANGED" : initialPlacement,
    description:
      plan?.translations.find((translation) => translation.locale === "en")
        ?.merchantDescription ?? "",
    reason: "",
    economicsOverrideEnabled: false,
    economicsOverrideReason: "",
    events: initialEvents,
    highlights: initialHighlights,
  };
}

function moveAt<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const nextIndex = index + direction;
  if (index < 0 || index >= items.length || nextIndex < 0 || nextIndex >= items.length) {
    return items;
  }
  const next = [...items];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
}

export function merchantPricingPlanDraftReducer(
  state: MerchantPricingPlanDraft,
  action: MerchantPricingPlanDraftAction,
): MerchantPricingPlanDraft {
  switch (action.type) {
    case "set-step":
      return { ...state, step: action.step };
    case "set-name":
      return { ...state, name: action.value };
    case "set-handle":
      return { ...state, handle: action.value };
    case "set-plan-kind":
      return {
        ...state,
        planKind: action.value,
        placement: state.isEditing ? state.placement : action.createPlacement,
      };
    case "set-active":
      return { ...state, isActive: action.value };
    case "set-featured":
      return { ...state, featured: action.value };
    case "set-commerce-model":
      return { ...state, commerceModelId: action.value };
    case "set-max-knowledge-sources":
      return { ...state, maxKnowledgeSources: action.value };
    case "set-max-content-units-per-source":
      return { ...state, maxContentUnitsPerSource: action.value };
    case "set-source-type":
      return {
        ...state,
        allowedSourceTypeKeys: action.selected
          ? [...state.allowedSourceTypeKeys, action.key]
          : state.allowedSourceTypeKeys.filter((key) => key !== action.key),
      };
    case "set-credits":
      return { ...state, credits: action.value };
    case "set-recovery-usage-event-handle":
      return { ...state, recoveryUsageEventHandle: action.value };
    case "set-supported-feature":
      return {
        ...state,
        supportedFeatureKeys: action.selected
          ? [...state.supportedFeatureKeys, action.key]
          : state.supportedFeatureKeys.filter((key) => key !== action.key),
      };
    case "replace-supported-features":
      return { ...state, supportedFeatureKeys: action.keys };
    case "set-currency":
      return { ...state, currency: action.value };
    case "set-recurring":
      return { ...state, recurring: action.value };
    case "set-placement":
      return { ...state, placement: action.value };
    case "set-description":
      return { ...state, description: action.value };
    case "set-reason":
      return { ...state, reason: action.value };
    case "set-economics-override-enabled":
      return { ...state, economicsOverrideEnabled: action.value };
    case "set-economics-override-reason":
      return { ...state, economicsOverrideReason: action.value };
    case "add-event":
      return state.events.length >= 5
        ? state
        : { ...state, events: [...state.events, action.event] };
    case "remove-event":
      return { ...state, events: state.events.filter((_, index) => index !== action.index) };
    case "move-event":
      return { ...state, events: moveAt(state.events, action.index, action.direction) };
    case "update-event":
      return {
        ...state,
        events: state.events.map((event, index) =>
          index === action.index ? { ...event, ...action.update } : event,
        ),
      };
    case "add-tier":
      return {
        ...state,
        events: state.events.map((event, index) => {
          if (index !== action.eventIndex || event.pricingMode === "FIXED" || (event.tiers?.length ?? 0) >= 6) {
            return event;
          }
          return {
            ...event,
            tiers: [...(event.tiers ?? []), { upTo: null, amountPerUnit: "0", flatAmount: "0" }],
          };
        }),
      };
    case "remove-tier":
      return {
        ...state,
        events: state.events.map((event, index) =>
          index === action.eventIndex
            ? { ...event, tiers: (event.tiers ?? []).filter((_, tierIndex) => tierIndex !== action.tierIndex) }
            : event,
        ),
      };
    case "update-tier":
      return {
        ...state,
        events: state.events.map((event, index) =>
          index === action.eventIndex
            ? {
                ...event,
                tiers: (event.tiers ?? []).map((tier, tierIndex) =>
                  tierIndex === action.tierIndex ? { ...tier, ...action.update } : tier,
                ),
              }
            : event,
        ),
      };
    case "add-highlight":
      return { ...state, highlights: [...state.highlights, action.highlight] };
    case "remove-highlight":
      return { ...state, highlights: state.highlights.filter((_, index) => index !== action.index) };
    case "move-highlight":
      return { ...state, highlights: moveAt(state.highlights, action.index, action.direction) };
    case "update-highlight":
      return {
        ...state,
        highlights: state.highlights.map((highlight, index) =>
          index === action.index ? { ...highlight, ...action.update } : highlight,
        ),
      };
  }
}

export type MerchantPricingPlanSaveBlocker = {
  step: number;
  message: string;
};

export function merchantPricingPlanSaveBlockers(input: {
  draft: Pick<
    MerchantPricingPlanDraft,
    | "handle"
    | "name"
    | "planKind"
    | "credits"
    | "recoveryUsageEventHandle"
    | "currency"
    | "description"
    | "reason"
    | "events"
    | "highlights"
  >;
  merchantKnowledgeConfigurationValid: boolean;
  economicsSatisfied: boolean;
}): MerchantPricingPlanSaveBlocker[] {
  const blockers: MerchantPricingPlanSaveBlocker[] = [];
  const { draft } = input;

  if (!draft.handle.trim()) {
    blockers.push({ step: 0, message: "Step 1 Plan: Shopify plan handle is required." });
  }
  if (!draft.name.trim()) {
    blockers.push({ step: 0, message: "Step 1 Plan: Display name is required." });
  }
  if (!Number.isSafeInteger(Number(draft.credits)) || Number(draft.credits) < 0) {
    blockers.push({
      step: 0,
      message: "Step 1 Plan: Included recovery credits must be a non-negative whole number.",
    });
  }
  if (!input.merchantKnowledgeConfigurationValid) {
    blockers.push({
      step: 0,
      message: "Step 1 Plan: Merchant Knowledge configuration is incomplete.",
    });
  }

  if (!/^[A-Z]{3}$/.test(draft.currency.trim().toUpperCase())) {
    blockers.push({
      step: 2,
      message: "Step 3 Shopify pricing: Currency must be a 3-letter code.",
    });
  }
  if (draft.planKind === "PAID_METERED" && !draft.recoveryUsageEventHandle.trim()) {
    blockers.push({
      step: 2,
      message: "Step 3 Shopify pricing: Recovery usage-event handle is required for a paid plan.",
    });
  }
  if (draft.planKind === "FREE" && draft.recoveryUsageEventHandle.trim()) {
    blockers.push({
      step: 2,
      message: "Step 3 Shopify pricing: Recovery usage-event handle must be empty for a FREE plan.",
    });
  }

  draft.events.forEach((event, index) => {
    if (!event.adminLabel.trim()) {
      blockers.push({
        step: 3,
        message: `Step 4 Usage events: Usage event ${index + 1} needs an admin label.`,
      });
    }
    if (!event.eventHandle.trim()) {
      blockers.push({
        step: 3,
        message: `Step 4 Usage events: Usage event ${index + 1} needs an event handle.`,
      });
    }
    if (!Number.isSafeInteger(event.creditsGrantedPerUnit) || event.creditsGrantedPerUnit < 1) {
      blockers.push({
        step: 3,
        message: `Step 4 Usage events: Usage event ${index + 1} credits per event must be at least 1.`,
      });
    }
  });

  const description = draft.description.trim();
  if (!description) {
    blockers.push({
      step: 4,
      message: "Step 5 Merchant content: English merchant description is required.",
    });
  } else if (description.length > 2000) {
    blockers.push({
      step: 4,
      message: "Step 5 Merchant content: English merchant description must be 2000 characters or fewer.",
    });
  }
  draft.highlights.forEach((highlight, index) => {
    const title = highlight.title.trim();
    const description = highlight.description.trim();
    if (!title) {
      blockers.push({
        step: 4,
        message: `Step 5 Merchant content: Highlight ${index + 1} title is required.`,
      });
    } else if (title.length > 120) {
      blockers.push({
        step: 4,
        message: `Step 5 Merchant content: Highlight ${index + 1} title must be 120 characters or fewer.`,
      });
    }
    if (!description) {
      blockers.push({
        step: 4,
        message: `Step 5 Merchant content: Highlight ${index + 1} description is required.`,
      });
    } else if (description.length > 500) {
      blockers.push({
        step: 4,
        message: `Step 5 Merchant content: Highlight ${index + 1} description must be 500 characters or fewer.`,
      });
    }
  });

  if (!input.economicsSatisfied) {
    blockers.push({
      step: 5,
      message: "Step 6 Portfolio economics: Resolve the economics validation or provide a valid override.",
    });
  }

  const reason = draft.reason.trim();
  if (!reason) {
    blockers.push({
      step: 6,
      message: "Step 7 Translations & review: Admin reason is required.",
    });
  } else if (reason.length > 2000) {
    blockers.push({
      step: 6,
      message: "Step 7 Translations & review: Admin reason must be 2000 characters or fewer.",
    });
  }

  return blockers;
}

export function canNavigateTo(input: {
  currentStep: number;
  targetStep: number;
  currentStepValid: boolean;
  hasUnboundedZeroCostFixedEvent: boolean;
  merchantContentValid: boolean;
  economicsSatisfied: boolean;
}): boolean {
  const { currentStep, targetStep } = input;
  if (targetStep <= currentStep) return true;
  if (targetStep > currentStep + 1) return false;
  if (!input.currentStepValid) return false;
  if (currentStep === 3 && input.hasUnboundedZeroCostFixedEvent) return false;
  if (currentStep === 4 && !input.merchantContentValid) return false;
  if (currentStep === 5 && !input.economicsSatisfied) return false;
  return true;
}

export function canSubmitMerchantPricingPlan(input: {
  requiredFieldsValid: boolean;
  merchantKnowledgeConfigurationValid: boolean;
  reason: string;
  economicsSatisfied: boolean;
}): boolean {
  const trimmedReason = input.reason.trim();
  return (
    input.requiredFieldsValid &&
    input.merchantKnowledgeConfigurationValid &&
    Boolean(trimmedReason) &&
    trimmedReason.length <= 2000 &&
    input.economicsSatisfied
  );
}

export function buildEconomicsConfigurationKey(input: {
  handle: string;
  credits: number;
  currency: string;
  recurring: string;
  effectivePlacement: string;
  minimumUpgradePremiumBps: number;
  serializedUsageEvents: MerchantPricingBuilderEvent[];
}): string {
  return JSON.stringify({
    handle: input.handle.trim(),
    credits: input.credits,
    currency: input.currency.trim().toUpperCase(),
    recurring: input.recurring,
    placement: input.effectivePlacement,
    minimumUpgradePremiumBps: input.minimumUpgradePremiumBps,
    usageEvents: input.serializedUsageEvents,
  });
}

export function buildMerchantPricingPlanDraftPayload(input: {
  draft: MerchantPricingPlanDraft;
  plan?: MerchantPricingPlanWithChildren;
  cataloguePlanIds: string[];
  effectivePlacement: string;
  merchantKnowledgeConfiguration: MerchantKnowledgeFeatureConfiguration;
  serializedUsageEvents: MerchantPricingBuilderEvent[];
}): {
  id: string | null;
  commerceModelId: string | null;
  shopifyPlanHandle: string;
  name: string;
  planKind: "FREE" | "PAID_METERED";
  shopifyRecoveryUsageEventHandle: string | null;
  supportedFeatureKeys: string[];
  merchantKnowledgeConfiguration: MerchantKnowledgeFeatureConfiguration;
  materializedAt: string | null;
  isActive: boolean;
  featured: boolean;
  includedRecoveryCredits: number;
  allowancePeriod: "LIFETIME" | "EVERY_30_DAYS";
  billingPeriod: "EVERY_30_DAYS";
  currency: string;
  recurringAmount: string;
  placement: string;
  catalogueOrderSnapshot: string[] | null;
  englishDescription: string;
  reason: string;
  usageEvents: MerchantPricingBuilderEvent[];
  highlights: MerchantPricingBuilderHighlight[];
} {
  const { draft, plan } = input;
  return {
    id: plan?.id ?? null,
    commerceModelId: draft.commerceModelId || null,
    shopifyPlanHandle: draft.handle,
    name: draft.name,
    planKind: draft.planKind,
    shopifyRecoveryUsageEventHandle:
      draft.planKind === "FREE" ? null : draft.recoveryUsageEventHandle,
    supportedFeatureKeys: [
      ...new Set([
        ...draft.supportedFeatureKeys,
        MERCHANT_KNOWLEDGE_FEATURE_KEY,
      ]),
    ],
    merchantKnowledgeConfiguration: input.merchantKnowledgeConfiguration,
    materializedAt: plan?.materializedAt?.toISOString() ?? null,
    isActive: draft.isActive,
    featured: draft.featured,
    includedRecoveryCredits: Number(draft.credits),
    allowancePeriod: draft.planKind === "FREE" ? "LIFETIME" : "EVERY_30_DAYS",
    billingPeriod: "EVERY_30_DAYS",
    currency: draft.currency.toUpperCase(),
    recurringAmount: draft.recurring,
    placement: input.effectivePlacement,
    catalogueOrderSnapshot: plan ? null : input.cataloguePlanIds,
    englishDescription: draft.description,
    reason: draft.reason,
    usageEvents: input.serializedUsageEvents,
    highlights: draft.highlights,
  };
}