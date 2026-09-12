import { mutateBillingPlanAction } from "@/app/actions/billing-plan";
import Link from "next/link";
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

export function PlanForm({ plan }: { plan?: BillingPlanRow }) {
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
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 sm:col-span-2">
          <input
            type="checkbox"
            name="recoveryCreditPackEnabled"
            defaultChecked={plan?.recoveryCreditPackEnabled ?? false}
          />
          {adminI18n.t("billing.recoveryCreditPackEnabled")}
        </label>
        <label className="text-sm font-medium text-gray-700">
          {adminI18n.t("billing.recoveryCreditsPerPack")}
          <input
            className={inputClass}
            name="recoveryCreditsPerPack"
            type="number"
            min="1"
            defaultValue={plan?.recoveryCreditsPerPack ?? ""}
          />
        </label>
        <label className="text-sm font-medium text-gray-700">
          {adminI18n.t("billing.recoveryCreditPackEventHandle")}
          <input
            className={inputClass}
            name="shopifyRecoveryCreditPackEventHandle"
            defaultValue={plan?.shopifyRecoveryCreditPackEventHandle ?? ""}
          />
        </label>
        <label className="text-sm font-medium text-gray-700">
          {adminI18n.t("billing.includedRecoveryAllowance")}
          <input
            className={inputClass}
            name="includedRecoveryConversationAllowance"
            type="number"
            min="0"
            defaultValue={plan?.includedRecoveryConversationAllowance ?? ""}
          />
        </label>
        <p className="text-sm text-gray-600 sm:col-span-2">
          {adminI18n.t("billing.recoveryCreditPackHelp")}
        </p>
        <p className="text-sm text-gray-600 sm:col-span-2">
          {adminI18n.t("billing.recoveryCreditPackRateHelp")}
        </p>
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
    <div className="space-y-4">
      <section className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-gray-950">
            {adminI18n.t("billing.tab.plans")}
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            {adminI18n.t("billing.plansDescription")}
          </p>
        </div>
        <Link
          href="/billing?view=plans&drawer=register-plan"
          className="rounded-md bg-[var(--brand-700)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)]"
        >
          {adminI18n.t("billing.registerPlanAction")}
        </Link>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        {plans.map((plan) => (
          <article
            key={plan.id}
            className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
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
              <div className="flex items-center gap-2">
                <Link
                  href={`/billing?view=plans&planId=${encodeURIComponent(plan.id)}`}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  {adminI18n.t("billing.editPlanAction")}
                </Link>
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
                  <input
                    type="hidden"
                    name="recoveryCreditPackEnabled"
                    value={plan.recoveryCreditPackEnabled ? "on" : "off"}
                  />
                  <input
                    type="hidden"
                    name="recoveryCreditsPerPack"
                    value={plan.recoveryCreditsPerPack ?? ""}
                  />
                  <input
                    type="hidden"
                    name="shopifyRecoveryCreditPackEventHandle"
                    value={plan.shopifyRecoveryCreditPackEventHandle ?? ""}
                  />
                  <input
                    type="hidden"
                    name="includedRecoveryConversationAllowance"
                    value={plan.includedRecoveryConversationAllowance ?? ""}
                  />
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
            </div>
            <dl className="mt-5 grid gap-3 border-t border-gray-100 pt-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-gray-500">
                  {adminI18n.t("billing.kind")}
                </dt>
                <dd className="font-medium text-gray-900">{plan.kind}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">
                  {adminI18n.t("billing.usageHandle")}
                </dt>
                <dd className="break-words font-mono text-xs text-gray-900">
                  {plan.shopifyUsageEventHandle ??
                    adminI18n.t("empty.notRecorded")}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">
                  {adminI18n.t("billing.includedRecoveryAllowance")}
                </dt>
                <dd className="font-medium text-gray-900">
                  {plan.includedRecoveryConversationAllowance ??
                    adminI18n.t("empty.notRecorded")}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">
                  {adminI18n.t("billing.recoveryCreditPackEnabled")}
                </dt>
                <dd className="font-medium text-gray-900">
                  {plan.recoveryCreditPackEnabled
                    ? adminI18n.t("billing.active")
                    : adminI18n.t("billing.inactive")}
                </dd>
              </div>
              {plan.recoveryCreditsPerPack !== null ? (
                <div>
                  <dt className="text-xs text-gray-500">
                    {adminI18n.t("billing.recoveryCreditsPerPack")}
                  </dt>
                  <dd className="font-medium text-gray-900">
                    {adminI18n.formatNumber(plan.recoveryCreditsPerPack)}
                  </dd>
                </div>
              ) : null}
            </dl>
          </article>
        ))}
      </section>
    </div>
  );
}
