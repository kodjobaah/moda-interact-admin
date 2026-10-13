"use client";

import { useState } from "react";
import { LivePlanPolicyControls } from "@/components/admin/commerce-model-policy/live-plan-policy";
import { CommerceAgentPolicyStep, createEmptyNewPlanBudgetDraft, isNewPlanBudgetDraftValid, serializeNewPlanBudgetDraft } from "./merchant-pricing-plan-builder/commerce-agent-policy-step";
import type { LivePlanPolicyHistoryEntry, LivePlanPolicyView } from "@/lib/admin/commerce-model-plan-policy";
import type { CommerceModelBudget } from "@/lib/admin/commerce-model-policy-fields";

import { mutateMerchantPricingPlanAction } from "@/app/actions/merchant-pricing-plan";
import type {
  MerchantKnowledgeSourceTypeOption,
  MerchantPricingPlanWithChildren,
} from "@/lib/admin/merchant/pricing-plan";
import type { MerchantPricingPlanModelOption } from "@/lib/admin/merchant/pricing-plan-model";
import type { Feature } from "@prisma/client";
import { useMerchantPricingPlanDraft } from "./merchant-pricing-plan-builder/use-merchant-pricing-plan-draft";
import { PlanStep } from "./merchant-pricing-plan-builder/plan-step";
import { CataloguePlacementStep } from "./merchant-pricing-plan-builder/catalogue-placement-step";
import { ShopifyPricingStep } from "./merchant-pricing-plan-builder/shopify-pricing-step";
import { UsageEventsStep } from "./merchant-pricing-plan-builder/usage-events-step";
import { MerchantContentStep } from "./merchant-pricing-plan-builder/merchant-content-step";
import { PortfolioEconomicsStep } from "./merchant-pricing-plan-builder/portfolio-economics-step";
import { TranslationsReviewStep } from "./merchant-pricing-plan-builder/translations-review-step";

export function MerchantPricingPlanBuilder({
  plan,
  planPolicy,
  createPlanPlatformPolicy = null,
  planPolicyHistory = [],
  planPolicyHistoryPage = 0,
  planPolicyHasMore = false,
  canEditPlanPolicy = false,
  initialPolicyStep = false,
  policyHistoryBaseHref = "/billing?view=plans",
  cataloguePlans = [],
  featureCatalogue = [],
  merchantKnowledgeSourceTypes = [],
  commerceModelOptions = [],
  minimumUpgradePremiumBps = 2000,
}: {
  plan?: MerchantPricingPlanWithChildren;
  planPolicy?: LivePlanPolicyView;
  createPlanPlatformPolicy?: CommerceModelBudget | null;
  planPolicyHistory?: LivePlanPolicyHistoryEntry[];
  planPolicyHistoryPage?: number;
  planPolicyHasMore?: boolean;
  canEditPlanPolicy?: boolean;
  initialPolicyStep?: boolean;
  policyHistoryBaseHref?: string;
  cataloguePlans?: MerchantPricingPlanWithChildren[];
  featureCatalogue?: Feature[];
  merchantKnowledgeSourceTypes?: MerchantKnowledgeSourceTypeOption[];
  commerceModelOptions?: MerchantPricingPlanModelOption[];
  minimumUpgradePremiumBps?: number;
}) {
  const controller = useMerchantPricingPlanDraft({
    plan,
    cataloguePlans,
    featureCatalogue,
    merchantKnowledgeSourceTypes,
    commerceModelOptions,
    minimumUpgradePremiumBps,
    initialPolicyStep,
  });
  const [policyDraft, setPolicyDraft] = useState(() => createEmptyNewPlanBudgetDraft(createPlanPlatformPolicy));
  const canLeavePolicyStep = Boolean(createPlanPlatformPolicy) && isNewPlanBudgetDraftValid(policyDraft);
  const canMoveTo = (target: number) =>
    (Boolean(plan) && target === 6 || controller.selectors.canNavigateTo(target)) && !(step === 6 && !plan && target > step && !canLeavePolicyStep);
  const navigate = (target: number | ((previous: number) => number)) => {
    const next = typeof target === "function" ? target(controller.draft.step) : target;
    if (canMoveTo(next)) controller.actions.setStep(next);
  };
  const planPolicySummary = plan
    ? planPolicy
      ? `Deadline: ${planPolicy.effective.deadlineMs} ms (${planPolicy.sources.deadlineMs}); output: ${planPolicy.effective.outputTokens} tokens (${planPolicy.sources.outputTokens})`
      : "Unavailable"
    : [
        `Deadline: ${policyDraft.overrides.deadlineMs ? `${policyDraft.values.deadlineMs} ms (Price Plan override)` : `${createPlanPlatformPolicy?.deadlineMs ?? "unavailable"} ms (Platform)`}`,
        `Output: ${policyDraft.overrides.outputTokens ? `${policyDraft.values.outputTokens} tokens (Price Plan override)` : `${createPlanPlatformPolicy?.outputTokens ?? "unavailable"} tokens (Platform)`}`,
      ].join("; ");
  const {
    step,
    name,
    handle,
    planKind,
    isActive,
    featured,
    commerceModelId,
    maxKnowledgeSources,
    maxContentUnitsPerSource,
    allowedSourceTypeKeys,
    credits,
    recoveryUsageEventHandle,
    currency,
    recurring,
    description,
    reason,
    economicsOverrideEnabled,
    economicsOverrideReason,
    events,
    highlights,
  } = controller.draft;
  const {
    setName,
    setHandle,
    handlePlanKindChange,
    setIsActive,
    setFeatured,
    setCommerceModelId,
    setMaxKnowledgeSources,
    setMaxContentUnitsPerSource,
    setSourceType,
    setCredits,
    setRecoveryUsageEventHandle,
    setSupportedFeature,
    setCurrency,
    setRecurring,
    setPlacement,
    setReason,
    setEconomicsOverrideEnabled,
    setEconomicsOverrideReason,
    retryAutomaticTranslation,
  } = controller.actions;
  const {
    freePlanAlreadyExists,
    unavailableCommerceModelId,
    supportedFeatureControls,
    effectivePlacement,
    placementLabel,
    merchantKnowledgeConfigurationValid,
    economicsState,
    economicsPreview,
    economicsPassed,
    economicsOverrideAssessment,
    economicsOverrideReady,
    failedEconomics,
    passedEconomics,
    unboundedZeroCostEventLabel,
    translationsRetained,
    automaticTranslation,
    activationLocked,
    saveBlockers,
    canSubmit,
    formFields,
    sourceTypeKey,
    formatBuilderEventPrice,
    formatMinorUnits,
  } = controller.selectors;

  return (
    <div className="space-y-6">
      <nav className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {[
          "Plan",
          "Catalogue placement",
          "Shopify pricing",
          "Usage events",
          "Merchant content",
          "Portfolio economics",
          "CommerceAgent Policy",
          "Translations & review",
        ].map((label, index) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              if (canMoveTo(index)) navigate(index);
            }}
            className={`rounded-md border px-2 py-2 text-left text-xs font-semibold ${step === index ? "border-[var(--brand-700)] bg-[var(--brand-50)] text-[var(--brand-800)]" : "border-gray-200 text-gray-600"}`}
          >
            {index + 1} {label}
          </button>
        ))}
      </nav>
      {step === 6 && plan ? (
        planPolicy ? <LivePlanPolicyControls
          key={`${plan.id}:${planPolicy.editVersion}`}
          policy={planPolicy} history={planPolicyHistory}
          page={planPolicyHistoryPage} hasMore={planPolicyHasMore}
          canEdit={canEditPlanPolicy} historyBaseHref={policyHistoryBaseHref}
        /> : <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm">This Price Plan’s LIVE execution policy is unavailable. Reload the drawer or contact a platform administrator.</p>
      ) : (
      <form action={mutateMerchantPricingPlanAction} className="space-y-6">
      <input type="hidden" name="intent" value={formFields.intent} />
      <input type="hidden" name="payload" value={formFields.payload} />
      <input
        type="hidden"
        name="translationRunId"
        value={formFields.translationRunId}
      />
      <input
        type="hidden"
        name="economicsOverrideRequested"
        value={formFields.economicsOverrideRequested}
      />

      <input
        type="hidden"
        name="economicsOverrideReason"
        value={formFields.economicsOverrideReason}
      />
      {!plan ? <input type="hidden" name="commercePolicyDraft" value={serializeNewPlanBudgetDraft(policyDraft)} /> : null}
      {step === 0 ? (
        <PlanStep
          commerceModelOptions={commerceModelOptions}
          merchantKnowledgeSourceTypes={merchantKnowledgeSourceTypes}
          draft={{
            isEditing: controller.draft.isEditing,
            name,
            handle,
            planKind,
            isActive,
            featured,
            commerceModelId,
            maxKnowledgeSources,
            maxContentUnitsPerSource,
            allowedSourceTypeKeys,
            credits,
          }}
          actions={{
            setName,
            setHandle,
            handlePlanKindChange,
            setIsActive,
            setFeatured,
            setCommerceModelId,
            setMaxKnowledgeSources,
            setMaxContentUnitsPerSource,
            setSourceType,
            setCredits,
            setSupportedFeature,
          }}
          selectors={{
            freePlanAlreadyExists,
            unavailableCommerceModelId,
            supportedFeatureControls,
            merchantKnowledgeConfigurationValid,
            activationLocked,
            sourceTypeKey,
          }}
        />
      ) : null}
      {step === 1 ? (
        <CataloguePlacementStep
          cataloguePlans={cataloguePlans}
          isEditing={Boolean(plan)}
          cataloguePosition={plan?.cataloguePosition ?? null}
          planKind={planKind}
          effectivePlacement={effectivePlacement}
          setPlacement={setPlacement}
        />
      ) : null}
      {step === 2 ? (
        <ShopifyPricingStep
          planKind={planKind}
          recoveryUsageEventHandle={recoveryUsageEventHandle}
          currency={currency}
          recurring={recurring}
          setRecoveryUsageEventHandle={setRecoveryUsageEventHandle}
          setCurrency={setCurrency}
          setRecurring={setRecurring}
        />
      ) : null}
      {step === 3 ? (
        <UsageEventsStep
          events={events}
          currency={currency}
          addEvent={controller.actions.addEvent}
          removeEvent={controller.actions.removeEvent}
          moveEvent={controller.actions.moveEvent}
          updateEvent={controller.actions.updateEvent}
          addTier={controller.actions.addTier}
          updateTier={controller.actions.updateTier}
          hasUnboundedZeroCostFixedEvent={
            controller.selectors.hasUnboundedZeroCostFixedEvent
          }
          ZERO_COST_USAGE_EVENT_MESSAGE={
            controller.selectors.ZERO_COST_USAGE_EVENT_MESSAGE
          }
        />
      ) : null}
      {step === 4 ? (
        <MerchantContentStep
          description={description}
          highlights={highlights}
          setDescription={controller.actions.setDescription}
          addHighlight={controller.actions.addHighlight}
          removeHighlight={controller.actions.removeHighlight}
          moveHighlight={controller.actions.moveHighlight}
          updateHighlight={controller.actions.updateHighlight}
          merchantContentValid={controller.selectors.merchantContentValid}
        />
      ) : null}
      {step === 5 ? (
        <PortfolioEconomicsStep
          currency={currency}
          economicsOverrideEnabled={economicsOverrideEnabled}
          economicsOverrideReason={economicsOverrideReason}
          setEconomicsOverrideEnabled={setEconomicsOverrideEnabled}
          setEconomicsOverrideReason={setEconomicsOverrideReason}
          economicsState={economicsState}
          economicsPreview={economicsPreview}
          economicsPassed={economicsPassed}
          economicsOverrideAssessment={economicsOverrideAssessment}
          failedEconomics={failedEconomics}
          passedEconomics={passedEconomics}
          unboundedZeroCostEventLabel={unboundedZeroCostEventLabel}
          formatMinorUnits={formatMinorUnits}
        />
      ) : null}
      {step === 6 && !plan ? (
        <CommerceAgentPolicyStep platform={createPlanPlatformPolicy} draft={policyDraft} onChange={setPolicyDraft} />
      ) : null}
      <TranslationsReviewStep
        step={step}
        planPolicySummary={planPolicySummary}
        name={name}
        handle={handle}
        recurring={recurring}
        currency={currency}
        credits={credits}
        description={description}
        highlights={highlights}
        events={events}
        economicsOverrideReason={economicsOverrideReason}
        reason={reason}
        setReason={setReason}
        retryAutomaticTranslation={retryAutomaticTranslation}
        translationsRetained={translationsRetained}
        automaticTranslation={automaticTranslation}
        saveBlockers={saveBlockers.concat(!plan && !canLeavePolicyStep ? [
          { step: 6, message: "Step 7 CommerceAgent Policy: Review the optional overrides or restore inheritance." },
        ] : [])}
        placementLabel={placementLabel}
        economicsPassed={economicsPassed}
        economicsOverrideReady={economicsOverrideReady}
        economicsOverrideAssessment={economicsOverrideAssessment}
        formatBuilderEventPrice={formatBuilderEventPrice}
        canSubmit={canSubmit && (Boolean(plan) || canLeavePolicyStep)}
        isUpdate={Boolean(plan)}
      />
      </form>
      )}
      <div className="flex justify-between gap-3">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => navigate((current) => Math.max(0, current - 1))}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold disabled:opacity-50"
        >
          Back
        </button>
        {step < 7 ? (
          <button
            type="button"
            disabled={!canMoveTo(step + 1)}
            onClick={() => navigate((current) => current + 1)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold disabled:opacity-50"
          >
            Next
          </button>
        ) : null}
      </div>
    </div>
  );
}
