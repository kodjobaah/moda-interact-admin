import type { MerchantPricingPlanDraftController } from "./use-merchant-pricing-plan-draft";

const inputClass =
  "w-full rounded-md border border-gray-300 bg-white p-2 text-sm";

type Controller = MerchantPricingPlanDraftController;

type UsageEventsStepProps = Pick<Controller["draft"], "events" | "currency"> &
  Pick<
    Controller["actions"],
    | "addEvent"
    | "removeEvent"
    | "moveEvent"
    | "updateEvent"
    | "addTier"
    | "updateTier"
  > &
  Pick<
    Controller["selectors"],
    "hasUnboundedZeroCostFixedEvent" | "ZERO_COST_USAGE_EVENT_MESSAGE"
  >;

export function UsageEventsStep({
  events,
  currency,
  addEvent,
  removeEvent,
  moveEvent,
  updateEvent,
  addTier,
  updateTier,
  hasUnboundedZeroCostFixedEvent,
  ZERO_COST_USAGE_EVENT_MESSAGE,
}: UsageEventsStepProps) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">
          Usage events ({events.length}/5)
        </h3>
        <button
          type="button"
          disabled={events.length >= 5}
          onClick={addEvent}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold"
        >
          Add usage event
        </button>
      </div>
      {events.map((event, index) => (
        <div
          key={event.clientKey}
          className="space-y-3 rounded-md border border-gray-200 p-3"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-gray-700">
              Admin label
              <input
                className={inputClass}
                value={event.adminLabel}
                onChange={(input) =>
                  updateEvent(index, { adminLabel: input.target.value })
                }
              />
            </label>
            <label className="text-sm font-medium text-gray-700">
              Shopify usage-event handle
              <input
                className={inputClass}
                value={event.eventHandle}
                onChange={(input) =>
                  updateEvent(index, { eventHandle: input.target.value })
                }
              />
            </label>
            <label className="text-sm font-medium text-gray-700">
              Recovery credits granted per event
              <input
                className={inputClass}
                type="number"
                min="1"
                value={event.creditsGrantedPerUnit}
                onChange={(input) =>
                  updateEvent(index, {
                    creditsGrantedPerUnit: Number(input.target.value),
                  })
                }
              />
            </label>
            <label className="text-sm font-medium text-gray-700">
              Maximum uses per billing period (optional)
              <input
                className={inputClass}
                type="number"
                min="1"
                value={event.maximumUnitsPerBillingPeriod ?? ""}
                onChange={(input) =>
                  updateEvent(index, {
                    maximumUnitsPerBillingPeriod: input.target.value
                      ? Number(input.target.value)
                      : null,
                  })
                }
              />
            </label>
            <label className="text-sm font-medium text-gray-700">
              Pricing model
              <select
                className={inputClass}
                value={event.pricingMode}
                onChange={(input) =>
                  updateEvent(index, {
                    pricingMode: input.target.value as typeof event.pricingMode,
                  })
                }
              >
                <option value="FIXED">Fixed price</option>
                <option value="GRADUATED">Graduated pricing</option>
                <option value="VOLUME">Volume pricing</option>
              </select>
            </label>
            {event.pricingMode === "FIXED" ? (
              <label className="text-sm font-medium text-gray-700">
                Price per usage event ({currency.toUpperCase()})
                <input
                  className={inputClass}
                  type="text"
                  inputMode="decimal"
                  value={event.fixedUnitAmount ?? ""}
                  onChange={(input) =>
                    updateEvent(index, {
                      fixedUnitAmount: input.target.value,
                    })
                  }
                />
              </label>
            ) : null}
          </div>
          {hasUnboundedZeroCostFixedEvent(event) ? (
            <p className="text-sm font-medium text-red-700">
              {ZERO_COST_USAGE_EVENT_MESSAGE}
            </p>
          ) : null}
          {event.pricingMode !== "FIXED" ? (
            <div className="space-y-2 rounded-md bg-gray-50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">
                  Tiers ({event.tiers?.length ?? 0}/6)
                </span>
                <button
                  type="button"
                  disabled={(event.tiers?.length ?? 0) >= 6}
                  onClick={() => addTier(index)}
                  className="rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold"
                >
                  Add tier
                </button>
              </div>
              {(event.tiers ?? []).map((tier, tierIndex) => (
                <div
                  key={`${index}-${tierIndex}`}
                  className="grid gap-2 sm:grid-cols-4"
                >
                  <label className="text-sm font-medium text-gray-700">
                    Up to quantity
                    {tierIndex === (event.tiers?.length ?? 1) - 1 ? (
                      <span className="ml-1 font-normal">(Unlimited)</span>
                    ) : null}
                    <input
                      className={inputClass}
                      type="number"
                      min="1"
                      value={tier.upTo ?? ""}
                      disabled={tierIndex === (event.tiers?.length ?? 1) - 1}
                      onChange={(input) =>
                        updateTier(index, tierIndex, {
                          upTo: input.target.value
                            ? Number(input.target.value)
                            : null,
                        })
                      }
                    />
                  </label>
                  <label className="text-sm font-medium text-gray-700">
                    Price per unit ({currency.toUpperCase()})
                    <input
                      className={inputClass}
                      type="text"
                      inputMode="decimal"
                      value={tier.amountPerUnit}
                      onChange={(input) =>
                        updateTier(index, tierIndex, {
                          amountPerUnit: input.target.value,
                        })
                      }
                    />
                  </label>
                  <label className="text-sm font-medium text-gray-700">
                    Additional flat charge ({currency.toUpperCase()})
                    <input
                      className={inputClass}
                      type="text"
                      inputMode="decimal"
                      value={tier.flatAmount}
                      onChange={(input) =>
                        updateTier(index, tierIndex, {
                          flatAmount: input.target.value,
                        })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    disabled={(event.tiers?.length ?? 0) <= 1}
                    onClick={() =>
                      updateEvent(index, {
                        tiers: event.tiers?.filter(
                          (_, currentTierIndex) =>
                            currentTierIndex !== tierIndex,
                        ),
                      })
                    }
                    className="text-xs font-semibold text-red-700"
                  >
                    Remove tier
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={index === 0}
              onClick={() => moveEvent(index, -1)}
              className="text-sm font-semibold text-gray-700"
            >
              Move up
            </button>
            <button
              type="button"
              disabled={index === events.length - 1}
              onClick={() => moveEvent(index, 1)}
              className="text-sm font-semibold text-gray-700"
            >
              Move down
            </button>
          </div>
          <button
            type="button"
            onClick={() => removeEvent(index)}
            className="text-sm font-semibold text-red-700"
          >
            Remove usage event
          </button>
        </div>
      ))}
    </section>
  );
}