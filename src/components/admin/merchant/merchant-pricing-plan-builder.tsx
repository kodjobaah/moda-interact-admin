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
import { MerchantPricingTranslationWorkbook } from "./merchant-pricing-translation-workbook";
import { MerchantPricingPlanSubmitButton } from "./merchant-pricing-plan-submit-button";

const inputClass =
  "w-full rounded-md border border-gray-300 bg-white p-2 text-sm";

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
    translationResult,
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
    onWorkbookChange,
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
    retainedTemplate,
    currentTemplate,
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
        name="translationJson"
        value={formFields.translationJson}
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
        <section
          className={`space-y-3 rounded-md border p-4 text-sm ${
            economicsPassed
              ? "border-green-200 bg-green-50 text-green-900"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          <div>
            <h3 className="font-semibold">
              {economicsPassed
                ? "Portfolio economics passed"
                : "This pricing configuration cannot be saved"}
            </h3>

            <p className="mt-2">
              {economicsPassed
                ? "All required plan comparisons satisfy the pricing policy."
                : "One or more required plan comparisons need attention before you can continue."}
            </p>
          </div>

          {failedEconomics.length ? (
            <ul className="space-y-2">
              {failedEconomics.map(({ result, presentation }) => (
                <li
                  key={`${result.lowerPlanId}-${result.higherPlanId}`}
                  className="rounded border border-amber-200 bg-white p-3"
                >
                  {result.code === "UNBOUNDED_ZERO_COST_USAGE_EVENT" ? (
                    <div className="space-y-1">
                      <h4 className="font-semibold">
                        Usage-event pricing needs attention
                      </h4>
                      <p>
                        {unboundedZeroCostEventLabel
                          ? `${unboundedZeroCostEventLabel} gives recovery credits for free with no usage limit.`
                          : "One of the usage events gives recovery credits for free with no usage limit."}{" "}
                        Enter a price greater than 0 or set a maximum number of
                        uses per billing period.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <h4 className="font-semibold">{presentation.title}</h4>

                      <p>{presentation.description}</p>

                      {presentation.guidance ? (
                        <p>
                          <span className="font-semibold">What to change:</span>{" "}
                          {presentation.guidance}
                        </p>
                      ) : null}
                    </div>
                  )}

                  <details className="mt-2 text-xs">
                    <summary>Technical details</summary>

                    <div className="mt-1">
                      {result.lowerPlanId} to {result.higherPlanId}; additional
                      credits: {result.additionalCreditsNeeded}; code:{" "}
                      {result.code}; status: {result.status}
                    </div>

                    <div>
                      Quantities:{" "}
                      {result.summary.length
                        ? result.summary
                            .map(
                              (row) =>
                                `${row.eventHandle} x${row.quantity} (${row.creditsGranted} credits, ${row.costMinor} minor)`,
                            )
                            .join(", ")
                        : "none"}
                    </div>

                    <div>
                      Stay + top-up:{" "}
                      {formatMinorUnits(result.stayAndTopUpCostMinor, currency)}
                      ; higher recurring:{" "}
                      {formatMinorUnits(result.upgradeCostMinor, currency)};
                      premium:{" "}
                      {Number.isFinite(result.premiumBps)
                        ? `${result.premiumBps} bps`
                        : "infinity/not applicable"}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          ) : null}

          {passedEconomics.length ? (
            <details className="rounded border border-gray-200 bg-white p-3 text-gray-700">
              <summary className="cursor-pointer font-medium">
                {passedEconomics.length}{" "}
                {passedEconomics.length === 1 ? "comparison" : "comparisons"}{" "}
                passed
              </summary>

              <ul className="mt-2 space-y-1 text-xs">
                {passedEconomics.map(({ result }) => {
                  const lowerPlan =
                    economicsState.plansById[result.lowerPlanId];
                  const higherPlan =
                    economicsState.plansById[result.higherPlanId];

                  return (
                    <li key={`${result.lowerPlanId}-${result.higherPlanId}`}>
                      {lowerPlan?.name ?? result.lowerPlanId} →{" "}
                      {higherPlan?.name ?? result.higherPlanId}
                    </li>
                  );
                })}
              </ul>
            </details>
          ) : null}

          {economicsPreview.length ? (
            <ul className="space-y-2">
              {economicsPreview.map((result) => (
                <li
                  key={`${result.lowerPlanId}-${result.higherPlanId}`}
                  className="rounded border border-amber-200 bg-white p-2"
                >
                  {/* existing economics result content */}
                </li>
              ))}
            </ul>
          ) : (
            <p>No active plan pair requires comparison yet.</p>
          )}

          {economicsOverrideAssessment.kind === "OVERRIDEABLE" ? (
            <div className="space-y-3 rounded-md border border-amber-300 bg-white p-4">
              <div>
                <p className="font-semibold text-amber-900">
                  Economics policy override available
                </p>

                <p className="mt-1 text-sm text-amber-800">
                  These failures are commercial-policy exceptions and may be
                  overridden by a SUPER_ADMIN.
                </p>
              </div>

              <label className="flex items-start gap-2 text-sm font-medium text-gray-800">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={economicsOverrideEnabled}
                  onChange={(event) =>
                    setEconomicsOverrideEnabled(event.target.checked)
                  }
                />

                <span>
                  Override the portfolio economics policy for this pricing
                  configuration
                </span>
              </label>

              {economicsOverrideEnabled ? (
                <label className="block text-sm font-medium text-gray-700">
                  Override reason
                  <textarea
                    className={`${inputClass} mt-1`}
                    rows={3}
                    maxLength={2000}
                    value={economicsOverrideReason}
                    onChange={(event) =>
                      setEconomicsOverrideReason(event.target.value)
                    }
                    placeholder="Explain why this commercial exception is being approved."
                  />
                  {!economicsOverrideReason.trim() ? (
                    <span className="mt-1 block text-sm font-medium text-red-700">
                      An override reason is required.
                    </span>
                  ) : null}
                </label>
              ) : null}
            </div>
          ) : null}

          {economicsOverrideAssessment.kind === "HARD_FAIL" &&
          !economicsPassed ? (
            <div className="rounded-md border border-red-300 bg-red-50 p-4">
              <p className="font-semibold text-red-800">
                This economics failure cannot be overridden.
              </p>

              <p className="mt-1 text-sm text-red-700">
                Correct the pricing configuration before continuing.
              </p>
            </div>
          ) : null}
        </section>
      ) : null}
      <div className={step === 6 ? "" : "hidden"}>
        <MerchantPricingTranslationWorkbook
          planHandle={handle}
          canonicalTemplate={retainedTemplate ?? currentTemplate}
          highlights={highlights}
          translationsRetained={translationsRetained}
          onChange={onWorkbookChange}
        />
      </div>
      {step === 6 ? (
        <section className="space-y-2 rounded-md border border-gray-200 p-4 text-sm">
          <h3 className="font-semibold">Final review</h3>
          <p>
            {name} ({handle})
          </p>
          <p>Catalogue placement: {placementLabel}</p>
          <p>
            Recurring pricing: {recurring} {currency}
          </p>
          <p>Allowance: {credits} recovery credits</p>
          <p>Usage events: {events.length}</p>
          <ul className="list-disc pl-5">
            {events.map((event) => (
              <li key={event.clientKey}>
                {event.adminLabel}: {event.creditsGrantedPerUnit} credits per
                event
                {event.pricingMode === "FIXED"
                  ? ` · ${formatBuilderEventPrice(event, currency)} per event · ${event.maximumUnitsPerBillingPeriod ?? "Unlimited"}`
                  : ` · ${event.pricingMode === "GRADUATED" ? "graduated pricing" : "volume pricing"} across ${event.tiers?.length ?? 0} tiers`}
              </li>
            ))}
          </ul>
          <p>English merchant description: {description}</p>
          <ul className="list-disc pl-5">
            {highlights.map((highlight) => (
              <li key={highlight.contentKey}>
                {highlight.title}: {highlight.description}
              </li>
            ))}
          </ul>
          <p>
            Portfolio economics:{" "}
            {economicsPassed
              ? "PASS"
              : economicsOverrideReady
                ? "OVERRIDE REQUESTED"
                : "NOT PASS"}
          </p>

          {economicsOverrideReady ? (
            <>
              <p>
                Override failures:{" "}
                {economicsOverrideAssessment.failureCodes.join(", ")}
              </p>
              <p>Override reason: {economicsOverrideReason.trim()}</p>
            </>
          ) : null}
          <p>
            Translation state:{" "}
            {translationsRetained
              ? "20/20 retained"
              : translationResult?.valid
                ? "20/20 validated"
                : "Not validated"}
          </p>
        </section>
      ) : null}
      {step === 6 ? (
        <label className="block text-sm font-medium text-gray-700">
          Admin reason
          <textarea
            className={`${inputClass} mt-1`}
            rows={2}
            maxLength={2000}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
      ) : null}
      {step === 6 ? (
        <MerchantPricingPlanSubmitButton
          disabled={!canSubmit}
          isUpdate={Boolean(plan)}
        />
      ) : null}
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
