import { mutateBillingPlanAction } from "@/app/actions/billing-plan";
import type { BillingPlanRow } from "@/lib/admin/billing-plan";
import { BILLING_FEATURES } from "@/lib/admin/billing-plan-validation";
import { adminI18n } from "@/i18n";

const inputClass =
  "w-full rounded-md border border-gray-300 bg-white p-2 text-sm outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-200)]";

function FeatureToggles({ plan }: { plan?: BillingPlanRow }) {
  const enabled = new Set(
    plan?.features
      .filter((feature) => feature.enabled)
      .map((feature) => feature.feature),
  );
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-semibold text-gray-600">
        {adminI18n.t("billing.features")}
      </legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {BILLING_FEATURES.map((feature) => (
          <label
            key={feature}
            className="flex items-center gap-2 text-sm text-gray-700"
          >
            <input
              type="checkbox"
              name={`feature_${feature}`}
              defaultChecked={enabled.has(feature)}
            />
            {adminI18n.t(`billing.feature.${feature}`)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function PlanForm({ plan }: { plan?: BillingPlanRow }) {
  const intent = plan ? "update" : "create";
  return (
    <form action={mutateBillingPlanAction} className="space-y-4">
      <input type="hidden" name="intent" value={intent} />
      {plan ? <input type="hidden" name="id" value={plan.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-gray-700">
          {adminI18n.t("billing.planHandle")}
          <input
            className={inputClass}
            name="shopifyPlanHandle"
            defaultValue={plan?.shopifyPlanHandle}
            readOnly={Boolean(plan)}
            required
          />
        </label>
        <label className="text-sm font-medium text-gray-700">
          {adminI18n.t("billing.displayName")}
          <input
            className={inputClass}
            name="name"
            defaultValue={plan?.name}
            required
          />
        </label>
        <label className="text-sm font-medium text-gray-700">
          {adminI18n.t("billing.kind")}
          <select
            className={inputClass}
            name="kind"
            defaultValue={plan?.kind ?? "FREE"}
          >
            <option value="FREE">FREE</option>
            <option value="PAID_METERED">PAID_METERED</option>
          </select>
        </label>
        <label className="text-sm font-medium text-gray-700">
          {adminI18n.t("billing.usageHandle")}
          <input
            className={inputClass}
            name="shopifyUsageEventHandle"
            defaultValue={plan?.shopifyUsageEventHandle ?? ""}
          />
        </label>
        <label className="text-sm font-medium text-gray-700">
          {adminI18n.t("billing.freeAllowance")}
          <input
            className={inputClass}
            name="freeLifetimeConversationAllowance"
            type="number"
            min="1"
            defaultValue={
              plan ? (plan.freeLifetimeConversationAllowance ?? "") : 5
            }
          />
        </label>
        <label className="text-sm font-medium text-gray-700">
          {adminI18n.t("billing.softLimit")}
          <input
            className={inputClass}
            name="defaultOutboundSoftLimit"
            type="number"
            min="1"
            defaultValue={plan?.defaultOutboundSoftLimit ?? 10}
            required
          />
        </label>
        <label className="text-sm font-medium text-gray-700">
          {adminI18n.t("billing.hardLimit")}
          <input
            className={inputClass}
            name="defaultOutboundHardLimit"
            type="number"
            min="2"
            defaultValue={plan?.defaultOutboundHardLimit ?? 20}
            required
          />
        </label>
        <label className="text-sm font-medium text-gray-700">
          {adminI18n.t("billing.terminalSlots")}
          <input
            className={inputClass}
            name="terminalMessageReservedSlots"
            type="number"
            min="1"
            defaultValue={plan?.terminalMessageReservedSlots ?? 1}
            required
          />
        </label>
      </div>
      <FeatureToggles plan={plan} />
      {plan ? (
        <label className="flex items-start gap-2 text-sm text-amber-800">
          <input
            type="checkbox"
            name="confirmUsageHandleChange"
            className="mt-1"
          />
          {adminI18n.t("billing.confirmUsageChange")}
        </label>
      ) : null}
      <label className="text-sm font-medium text-gray-700">
        {adminI18n.t("billing.reason")}
        <textarea
          className={inputClass}
          name="reason"
          rows={2}
          required
          placeholder={adminI18n.t("billing.reasonPlaceholder")}
        />
      </label>
      <button
        type="submit"
        className="rounded-md bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)]"
      >
        {plan
          ? adminI18n.t("billing.savePlan")
          : adminI18n.t("billing.createPlan")}
      </button>
    </form>
  );
}

export function BillingPlanCatalog({ plans }: { plans: BillingPlanRow[] }) {
  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-lg font-semibold text-gray-950">
          {adminI18n.t("billing.newPlan")}
        </h2>
        <p className="mb-5 text-sm text-gray-600">
          {adminI18n.t("billing.newPlanDescription")}
        </p>
        <PlanForm />
      </section>
      <section className="space-y-4">
        {plans.map((plan) => (
          <article
            key={plan.id}
            className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
          >
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-gray-950">
                    {plan.name}
                  </h2>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${plan.active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}
                  >
                    {plan.active
                      ? adminI18n.t("billing.active")
                      : adminI18n.t("billing.inactive")}
                  </span>
                </div>
                <p className="mt-1 font-mono text-xs text-gray-500">
                  {plan.shopifyPlanHandle}
                </p>
              </div>
              <form action={mutateBillingPlanAction}>
                <input type="hidden" name="intent" value="toggle" />
                <input type="hidden" name="id" value={plan.id} />
                <input type="hidden" name="kind" value={plan.kind} />
                <input
                  type="hidden"
                  name="shopifyPlanHandle"
                  value={plan.shopifyPlanHandle}
                />
                <input type="hidden" name="name" value={plan.name} />
                <input
                  type="hidden"
                  name="defaultOutboundSoftLimit"
                  value={plan.defaultOutboundSoftLimit}
                />
                <input
                  type="hidden"
                  name="defaultOutboundHardLimit"
                  value={plan.defaultOutboundHardLimit}
                />
                <input
                  type="hidden"
                  name="terminalMessageReservedSlots"
                  value={plan.terminalMessageReservedSlots}
                />
                {plan.kind === "FREE" ? (
                  <input
                    type="hidden"
                    name="freeLifetimeConversationAllowance"
                    value={plan.freeLifetimeConversationAllowance ?? ""}
                  />
                ) : null}
                {plan.kind === "PAID_METERED" ? (
                  <input
                    type="hidden"
                    name="shopifyUsageEventHandle"
                    value={plan.shopifyUsageEventHandle ?? ""}
                  />
                ) : null}
                <input
                  type="hidden"
                  name="reason"
                  value={
                    plan.active
                      ? "Deactivated from billing catalog"
                      : "Activated in billing catalog"
                  }
                />
                <button
                  type="submit"
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  {plan.active
                    ? adminI18n.t("billing.deactivate")
                    : adminI18n.t("billing.activate")}
                </button>
              </form>
            </div>
            <PlanForm plan={plan} />
          </article>
        ))}
      </section>
    </div>
  );
}
