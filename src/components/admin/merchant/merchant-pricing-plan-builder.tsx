"use client";

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
  cataloguePlans = [],
  featureCatalogue = [],
  merchantKnowledgeSourceTypes = [],
  commerceModelOptions = [],
  minimumUpgradePremiumBps = 2000,
}: {
  plan?: MerchantPricingPlanWithChildren;
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
  });
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
    setStep,
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
    canNavigateTo,
    formFields,
    sourceTypeKey,
    formatBuilderEventPrice,
    formatMinorUnits,
  } = controller.selectors;

  return (
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
      <nav className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {[
          "Plan",
          "Catalogue placement",
          "Shopify pricing",
          "Usage events",
          "Merchant content",
          "Portfolio economics",
          "Translations & review",
        ].map((label, index) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              if (canNavigateTo(index)) setStep(index);
            }}
            className={`rounded-md border px-2 py-2 text-left text-xs font-semibold ${step === index ? "border-[var(--brand-700)] bg-[var(--brand-50)] text-[var(--brand-800)]" : "border-gray-200 text-gray-600"}`}
          >
            {index + 1} {label}
          </button>
        ))}
      </nav>
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
      <TranslationsReviewStep
        step={step}
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
        saveBlockers={saveBlockers}
        placementLabel={placementLabel}
        economicsPassed={economicsPassed}
        economicsOverrideReady={economicsOverrideReady}
        economicsOverrideAssessment={economicsOverrideAssessment}
        formatBuilderEventPrice={formatBuilderEventPrice}
        canSubmit={canSubmit}
        isUpdate={Boolean(plan)}
      />
      <div className="flex justify-between gap-3">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => setStep((current) => Math.max(0, current - 1))}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold disabled:opacity-50"
        >
          Back
        </button>
        {step < 6 ? (
          <button
            type="button"
            disabled={!canNavigateTo(step + 1)}
            onClick={() => setStep((current) => current + 1)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold disabled:opacity-50"
          >
            Next
          </button>
        ) : null}
      </div>
    </form>
  );
}
