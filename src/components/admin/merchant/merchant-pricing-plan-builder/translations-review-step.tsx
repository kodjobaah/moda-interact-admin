import type { MerchantPricingPlanDraftController } from "./use-merchant-pricing-plan-draft";
import { MerchantPricingPlanSubmitButton } from "../merchant-pricing-plan-submit-button";
import { MerchantPricingAutomaticTranslationStatus } from "./merchant-pricing-automatic-translation-status";

type Controller = MerchantPricingPlanDraftController;

type TranslationsReviewStepProps = Pick<
  Controller["draft"],
  | "step"
  | "name"
  | "handle"
  | "recurring"
  | "currency"
  | "credits"
  | "description"
  | "highlights"
  | "events"
  | "economicsOverrideReason"
  | "reason"
> &
  Pick<Controller["actions"], "setReason" | "retryAutomaticTranslation"> &
  Pick<
    Controller["selectors"],
    | "translationsRetained"
    | "automaticTranslation"
    | "translationRunAvailable"
    | "placementLabel"
    | "economicsPassed"
    | "economicsOverrideReady"
    | "economicsOverrideAssessment"
    | "formatBuilderEventPrice"
    | "canSubmit"
  > & {
    isUpdate: boolean;
  };

const inputClass =
  "w-full rounded-md border border-gray-300 bg-white p-2 text-sm";

export function TranslationsReviewStep({
  step,
  name,
  handle,
  recurring,
  currency,
  credits,
  description,
  highlights,
  events,
  economicsOverrideReason,
  reason,
  setReason,
  retryAutomaticTranslation,
  translationsRetained,
  automaticTranslation,
  translationRunAvailable,
  placementLabel,
  economicsPassed,
  economicsOverrideReady,
  economicsOverrideAssessment,
  formatBuilderEventPrice,
  canSubmit,
  isUpdate,
}: TranslationsReviewStepProps) {
  if (step !== 6) return null;

  return (
    <>
      <MerchantPricingAutomaticTranslationStatus
        translationsRetained={translationsRetained}
        translation={{
          ...automaticTranslation,
          retry: retryAutomaticTranslation,
        }}
      />

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
              {event.adminLabel}: {event.creditsGrantedPerUnit} credits per event
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
            : automaticTranslation.run?.status === "FAILED"
              ? `Failed — ${automaticTranslation.run.failureCode ?? "TRANSLATION_FAILED"}`
              : automaticTranslation.ready
                ? `${automaticTranslation.run?.completeLocaleCount ?? 0}/${automaticTranslation.run?.localeCount ?? 20} ready`
                : automaticTranslation.run
                  ? `${automaticTranslation.run.completeLocaleCount}/${automaticTranslation.run.localeCount} translating`
                  : "Creating durable translation request"}
        </p>
      </section>

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

      {!translationsRetained ? (
        <p className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800">
          {translationRunAvailable
            ? isUpdate
              ? "You can save this draft now. It will remain inactive until automatic translation and finalisation complete."
              : "You can create this plan now. It will appear in the catalogue as a Draft and remain inactive until automatic translation and finalisation complete."
            : "Save is waiting for a durable automatic translation request to be created."}
        </p>
      ) : null}

      <MerchantPricingPlanSubmitButton
        disabled={!canSubmit}
        isUpdate={isUpdate}
        draftMode={!translationsRetained}
      />
    </>
  );
}
