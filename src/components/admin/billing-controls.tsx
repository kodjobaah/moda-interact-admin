import Link from "next/link";
import {
  mutatePlatformBillingPolicyAction,
  mutateShopBillingOverrideAction,
} from "@/app/actions/billing-controls";
import {
  mutateUpgradeEdgeAction,
  recordEconomicsSnapshotAction,
} from "@/app/actions/billing-economics";
import type { TenantBillingControls } from "@/lib/admin/types";
import { adminI18n } from "@/i18n";

const inputClass =
  "w-full rounded-md border border-gray-300 bg-white p-2 text-sm outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-200)]";

function dateValue(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : "";
}

function OverrideSelect({
  name,
  label,
  value,
}: {
  name: string;
  label: string;
  value: boolean | null;
}) {
  return (
    <label className="text-sm font-medium text-gray-700">
      {label}
      <select
        className={inputClass}
        name={name}
        defaultValue={value === null ? "inherit" : value ? "on" : "off"}
      >
        <option value="inherit">
          {adminI18n.t("billingControls.inherit")}
        </option>
        <option value="on">{adminI18n.t("billingControls.enabled")}</option>
        <option value="off">{adminI18n.t("billingControls.disabled")}</option>
      </select>
    </label>
  );
}

export function PlatformBillingControls({
  policy,
}: {
  policy: {
    globalPauseNewRecoveries: boolean;
    globalPauseAutomatedWhatsapp: boolean;
    absoluteOutboundHardLimit: number;
    defaultWarningPercent: number;
    lifetimeFreeRecoveryAllowance: number;
    minimumUpgradePremiumBps: number;
  } | null;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-950">
            {adminI18n.t("billingControls.platformTitle")}
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            {adminI18n.t("billingControls.platformDescription")}
          </p>
        </div>
        <Link
          className="text-sm font-semibold text-[var(--brand-700)] hover:underline"
          href="/billing?view=overview"
        >
          {adminI18n.t("billingControls.backToCatalog")}
        </Link>
      </div>
      <form action={mutatePlatformBillingPolicyAction} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-gray-700">
            {adminI18n.t("billingControls.absoluteHardLimit")}
            <input
              className={inputClass}
              type="number"
              min="1"
              name="absoluteOutboundHardLimit"
              defaultValue={policy?.absoluteOutboundHardLimit ?? ""}
              required
            />
          </label>
          <label className="text-sm font-medium text-gray-700">
            Minimum upgrade premium (basis points)
            <input
              className={inputClass}
              type="number"
              min="0"
              max="10000"
              step="1"
              name="minimumUpgradePremiumBps"
              defaultValue={policy?.minimumUpgradePremiumBps ?? 2000}
              required
            />
          </label>
          <label className="text-sm font-medium text-gray-700">
            {adminI18n.t("billingControls.warningPercent")}
            <input
              className={inputClass}
              type="number"
              min="0"
              max="100"
              name="defaultWarningPercent"
              defaultValue={policy?.defaultWarningPercent ?? 80}
              required
            />
          </label>
          <label className="text-sm font-medium text-gray-700">
            {adminI18n.t("billingControls.lifetimeFreeRecoveryAllowance")}
            <input
              className={inputClass}
              type="number"
              min="0"
              step="1"
              name="lifetimeFreeRecoveryAllowance"
              defaultValue={policy?.lifetimeFreeRecoveryAllowance ?? ""}
              required
            />
          </label>
        </div>
        <p className="text-sm text-gray-600">
          {adminI18n.t("billingControls.lifetimeFreeRecoveryAllowanceHelp")}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              name="globalPauseNewRecoveries"
              defaultChecked={policy?.globalPauseNewRecoveries ?? false}
            />
            {adminI18n.t("billingControls.pauseNewRecoveries")}
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              name="globalPauseAutomatedWhatsapp"
              defaultChecked={policy?.globalPauseAutomatedWhatsapp ?? false}
            />
            {adminI18n.t("billingControls.pauseAutomatedWhatsapp")}
          </label>
        </div>
        <label className="text-sm font-medium text-gray-700">
          {adminI18n.t("billingControls.reason")}
          <textarea className={inputClass} name="reason" rows={2} required />
        </label>
        <button
          className="rounded-md bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)]"
          type="submit"
        >
          {adminI18n.t("billingControls.savePlatform")}
        </button>
      </form>
    </section>
  );
}

export function TenantBillingControls({
  shopId,
  controls,
  defaultSoftLimit,
  defaultHardLimit,
}: {
  shopId: string;
  controls: TenantBillingControls;
  defaultSoftLimit: number;
  defaultHardLimit: number;
}) {
  const override = controls.override;
  const allowance = controls.allowance;
  const expired = Boolean(
    override?.expiresAt && override.expiresAt < new Date(),
  );
  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h4 className="mb-1 text-lg font-semibold text-gray-950">
          {adminI18n.t("billingControls.shopTitle")}
        </h4>
        <p className="mb-5 text-sm text-gray-600">
          {adminI18n.t("billingControls.shopDescription")}
        </p>
        {expired ? (
          <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
            {adminI18n.t("billingControls.expired")}
          </p>
        ) : null}
        <form action={mutateShopBillingOverrideAction} className="space-y-4">
          <input type="hidden" name="shopId" value={shopId} />
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="text-sm font-medium text-gray-700">
              {adminI18n.t("billingControls.softLimit")}
              <input
                className={inputClass}
                type="number"
                min="1"
                name="outboundSoftLimit"
                defaultValue={override?.outboundSoftLimit ?? ""}
                placeholder={String(defaultSoftLimit)}
              />
            </label>
            <label className="text-sm font-medium text-gray-700">
              {adminI18n.t("billingControls.hardLimit")}
              <input
                className={inputClass}
                type="number"
                min="1"
                name="outboundHardLimit"
                defaultValue={override?.outboundHardLimit ?? ""}
                placeholder={String(defaultHardLimit)}
              />
            </label>
            <label className="text-sm font-medium text-gray-700">
              {adminI18n.t("billingControls.recoveryCeiling")}
              <input
                className={inputClass}
                type="number"
                min="1"
                name="recoverySafetyCeiling"
                defaultValue={override?.recoverySafetyCeiling ?? ""}
              />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <OverrideSelect
              name="pauseNewRecoveries"
              label={adminI18n.t("billingControls.pauseNewRecoveries")}
              value={override?.pauseNewRecoveries ?? null}
            />
            <OverrideSelect
              name="pauseAutomatedWhatsapp"
              label={adminI18n.t("billingControls.pauseAutomatedWhatsapp")}
              value={override?.pauseAutomatedWhatsapp ?? null}
            />
            <label className="text-sm font-medium text-gray-700">
              {adminI18n.t("billingControls.expiry")}
              <input
                className={inputClass}
                type="date"
                name="expiresAt"
                defaultValue={dateValue(override?.expiresAt ?? null)}
              />
            </label>
          </div>
          <label className="text-sm font-medium text-gray-700">
            {adminI18n.t("billingControls.reason")}
            <textarea
              className={inputClass}
              name="reason"
              rows={2}
              required
              defaultValue={override?.reason ?? ""}
            />
          </label>
          <button
            className="rounded-md bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)]"
            type="submit"
          >
            {adminI18n.t("billingControls.saveShop")}
          </button>
        </form>
      </section>
      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h4 className="mb-1 text-lg font-semibold text-gray-950">
          {adminI18n.t("billingControls.allowanceTitle")}
        </h4>
        <p className="mb-4 text-sm text-gray-600">
          {adminI18n.t("billingControls.allowanceDescription")}
        </p>
        <dl className="mb-5 grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-gray-500">
              {adminI18n.t("billingControls.baseAllowance")}
            </dt>
            <dd className="text-lg font-semibold">
              {allowance.grantedAllowance ??
                adminI18n.t("billingControls.notApplicable")}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">
              {adminI18n.t("billing.remaining")}
            </dt>
            <dd className="text-lg font-semibold">
              {allowance.remaining ??
                adminI18n.t("billingControls.notApplicable")}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">
              {adminI18n.t("billingControls.committed")}
            </dt>
            <dd className="text-lg font-semibold">{allowance.committed}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">
              {adminI18n.t("billingControls.reserved")}
            </dt>
            <dd className="text-lg font-semibold">{allowance.reserved}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

export function BillingEconomicsControls({
  data,
}: {
  data: {
    plans: Array<{
      id: string;
      name: string;
      shopifyPlanHandle: string;
      includedRecoveryConversationAllowance: number | null;
      recoveryCreditPackEnabled: boolean;
      recoveryCreditsPerPack: number | null;
      shopifyRecoveryCreditPackEventHandle: string | null;
    }>;
    edges: Array<{
      id: string;
      lowerPlan: { id: string; name: string };
      higherPlan: { id: string; name: string };
    }>;
    snapshots: Array<{
      id: string;
      billingPlan: { name: string };
      monthlyRecurringAmountMinor: number;
      currency: string;
      verifiedAt: Date;
      recoveryCreditPackEnabledSnapshot: boolean;
    }>;
  };
}) {
  const { plans, edges, snapshots } = data;
  return (
    <div className="mt-6 space-y-5">
      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-950">Upgrade ladder</h2>
        <p className="mt-1 text-sm text-gray-600">
          Configure exact durable plan edges. The higher plan must provide a larger monthly recovery allowance.
        </p>
        <form action={mutateUpgradeEdgeAction} className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="text-sm font-medium text-gray-700">
            Lower plan
            <select className={inputClass} name="lowerPlanId" required>
              <option value="">Select plan</option>
              {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700">
            Higher plan
            <select className={inputClass} name="higherPlanId" required>
              <option value="">Select plan</option>
              {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700">
            Reason
            <input className={inputClass} name="reason" required />
          </label>
          <input type="hidden" name="intent" value="create" />
          <button className="w-fit rounded-md bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)]" type="submit">Save edge</button>
        </form>
        <ul className="mt-5 space-y-2 text-sm text-gray-700">
          {edges.map((edge) => (
            <li key={edge.id} className="flex items-center justify-between border-t border-gray-100 pt-2">
              <span>{edge.lowerPlan.name} → {edge.higherPlan.name}</span>
              <form action={mutateUpgradeEdgeAction}>
                <input type="hidden" name="intent" value="deactivate" />
                <input type="hidden" name="id" value={edge.id} />
                <input type="hidden" name="lowerPlanId" value={edge.lowerPlan.id} />
                <input type="hidden" name="higherPlanId" value={edge.higherPlan.id} />
                <input type="hidden" name="reason" value="Deactivated upgrade edge" />
                <button className="text-xs font-semibold text-red-700 hover:underline" type="submit">Deactivate</button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-950">Verified Shopify App Pricing economics</h2>
        <p className="mt-1 text-sm text-gray-600">
          Verified Shopify App Pricing economics used by Moda&apos;s Admin guardrail. Shopify remains the charging authority.
        </p>
        <form action={recordEconomicsSnapshotAction} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-gray-700">Billing plan<select className={inputClass} name="billingPlanId" required><option value="">Select plan</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} ({plan.shopifyPlanHandle})</option>)}</select></label>
            <label className="text-sm font-medium text-gray-700">Shopify plan handle<input className={inputClass} name="shopifyPlanHandleSnapshot" required /></label>
            <label className="text-sm font-medium text-gray-700">Monthly recurring amount (minor units)<input className={inputClass} type="number" min="0" name="monthlyRecurringAmountMinor" required /></label>
            <label className="text-sm font-medium text-gray-700">Currency<input className={inputClass} name="currency" maxLength={3} required /></label>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700"><input type="checkbox" name="recoveryCreditPackEnabledSnapshot" /> Recovery-credit packs enabled</label>
            <label className="text-sm font-medium text-gray-700">Credits per pack<input className={inputClass} type="number" min="1" name="recoveryCreditsPerPackSnapshot" /></label>
            <label className="text-sm font-medium text-gray-700">Pack meter handle<input className={inputClass} name="shopifyRecoveryCreditPackEventHandleSnapshot" /></label>
            <label className="text-sm font-medium text-gray-700">Usage pricing mode<select className={inputClass} name="usagePricingMode"><option value="">No pricing evidence</option><option value="FIXED">FIXED</option><option value="GRADUATED">GRADUATED</option><option value="VOLUME">VOLUME</option></select></label>
            <label className="text-sm font-medium text-gray-700">Usage pricing currency<input className={inputClass} name="usagePricingCurrency" maxLength={3} /></label>
            <label className="text-sm font-medium text-gray-700">Fixed unit amount (minor units)<input className={inputClass} type="number" min="0" name="usageUnitAmountMinor" /></label>
          </div>
          <label className="text-sm font-medium text-gray-700">Tier JSON for GRADUATED/VOLUME<input className={inputClass} name="usageTiersJson" placeholder='[{"upTo":100,"amountPerUnitMinor":1000,"flatAmountMinor":0},{"upTo":null,"amountPerUnitMinor":900,"flatAmountMinor":0}]' /></label>
          <label className="text-sm font-medium text-gray-700">Verification reason<textarea className={inputClass} name="verificationReason" rows={2} required /></label>
          <button className="rounded-md bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)]" type="submit">Record verified snapshot</button>
        </form>
        <ul className="mt-5 space-y-2 text-xs text-gray-600">
          {snapshots.map((snapshot) => <li key={snapshot.id} className="border-t border-gray-100 pt-2">{snapshot.billingPlan.name}: {snapshot.monthlyRecurringAmountMinor} {snapshot.currency}, verified {snapshot.verifiedAt.toISOString()} {snapshot.recoveryCreditPackEnabledSnapshot ? "with packs" : "without packs"}</li>)}
        </ul>
      </section>
    </div>
  );
}
