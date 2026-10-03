import type { MerchantPricingPlanDraftController } from "./use-merchant-pricing-plan-draft";
import { MerchantPricingTranslationWorkbook } from "../merchant-pricing-translation-workbook";
import { MerchantPricingPlanSubmitButton } from "../merchant-pricing-plan-submit-button";

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
  | "translationResult"
> &
  Pick<Controller["actions"], "onWorkbookChange" | "setReason"> &
  Pick<
    Controller["selectors"],
    | "retainedTemplate"
    | "currentTemplate"
    | "translationsRetained"
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
  translationResult,
  onWorkbookChange,
  setReason,
  retainedTemplate,
  currentTemplate,
  translationsRetained,
  placementLabel,
  economicsPassed,
  economicsOverrideReady,
  economicsOverrideAssessment,
  formatBuilderEventPrice,
  canSubmit,
  isUpdate,
}: TranslationsReviewStepProps) {
  return (
    <>
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
            Portfolio economics: {" "}
            {economicsPassed
              ? "PASS"
              : economicsOverrideReady
                ? "OVERRIDE REQUESTED"
                : "NOT PASS"}
          </p>

          {economicsOverrideReady ? (
            <>
              <p>
                Override failures: {" "}
                {economicsOverrideAssessment.failureCodes.join(", ")}
              </p>
              <p>Override reason: {economicsOverrideReason.trim()}</p>
            </>
          ) : null}
          <p>
            Translation state: {" "}
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
          isUpdate={isUpdate}
        />
      ) : null}
    </>
  );
}