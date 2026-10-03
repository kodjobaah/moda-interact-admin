import type { MerchantPricingPlanDraftController } from "./use-merchant-pricing-plan-draft";

const inputClass =
  "w-full rounded-md border border-gray-300 bg-white p-2 text-sm";

type Controller = MerchantPricingPlanDraftController;

type ShopifyPricingStepProps = Pick<
  Controller["draft"],
  "planKind" | "recoveryUsageEventHandle" | "currency" | "recurring"
> &
  Pick<
    Controller["actions"],
    "setRecoveryUsageEventHandle" | "setCurrency" | "setRecurring"
  >;

export function ShopifyPricingStep({
  planKind,
  recoveryUsageEventHandle,
  currency,
  recurring,
  setRecoveryUsageEventHandle,
  setCurrency,
  setRecurring,
}: ShopifyPricingStepProps) {
  return (
    <section className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-medium text-gray-700 sm:col-span-2">
        Recovery usage-event handle
        <input
          className={inputClass}
          value={recoveryUsageEventHandle}
          required={planKind === "PAID_METERED"}
          disabled={planKind === "FREE"}
          onChange={(event) =>
            setRecoveryUsageEventHandle(event.target.value)
          }
        />
        <span className="mt-1 block text-xs font-normal text-gray-500">
          Normal paid recovery meter copied to
          BillingPlan.shopifyUsageEventHandle. Usage events below are top-up
          offers.
        </span>
      </label>
      <label className="text-sm font-medium text-gray-700">
        Currency
        <input
          className={inputClass}
          value={currency}
          onChange={(event) => setCurrency(event.target.value.toUpperCase())}
          maxLength={3}
        />
      </label>
      <label className="text-sm font-medium text-gray-700">
        Recurring amount
        <input
          className={inputClass}
          value={recurring}
          onChange={(event) => setRecurring(event.target.value)}
          inputMode="decimal"
        />
      </label>
      <p className="text-sm text-gray-600 sm:col-span-2">
        Billing period: EVERY_30_DAYS
      </p>
    </section>
  );
}