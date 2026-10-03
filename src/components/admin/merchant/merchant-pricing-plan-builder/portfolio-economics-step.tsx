import type { MerchantPricingPlanDraftController } from "./use-merchant-pricing-plan-draft";

type Controller = MerchantPricingPlanDraftController;

type PortfolioEconomicsStepProps =
  Pick<
    Controller["draft"],
    "currency" | "economicsOverrideEnabled" | "economicsOverrideReason"
  > &
  Pick<
    Controller["actions"],
    "setEconomicsOverrideEnabled" | "setEconomicsOverrideReason"
  > &
  Pick<
    Controller["selectors"],
    | "economicsState"
    | "economicsPreview"
    | "economicsPassed"
    | "economicsOverrideAssessment"
    | "failedEconomics"
    | "passedEconomics"
    | "unboundedZeroCostEventLabel"
    | "formatMinorUnits"
  >;

const inputClass =
  "w-full rounded-md border border-gray-300 bg-white p-2 text-sm";

export function PortfolioEconomicsStep({
  currency,
  economicsOverrideEnabled,
  economicsOverrideReason,
  setEconomicsOverrideEnabled,
  setEconomicsOverrideReason,
  economicsState,
  economicsPreview,
  economicsPassed,
  economicsOverrideAssessment,
  failedEconomics,
  passedEconomics,
  unboundedZeroCostEventLabel,
  formatMinorUnits,
}: PortfolioEconomicsStepProps) {
  return (
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
                      : "One of the usage events gives recovery credits for free with no usage limit."} Enter a price greater than 0 or set a maximum number of uses per billing period.
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
                  credits: {result.additionalCreditsNeeded}; code: {result.code};
                  status: {result.status}
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
                  {formatMinorUnits(result.stayAndTopUpCostMinor, currency)};
                  higher recurring:{" "}
                  {formatMinorUnits(result.upgradeCostMinor, currency)}; premium:{" "}
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

      {economicsOverrideAssessment.kind === "HARD_FAIL" && !economicsPassed ? (
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
  );
}