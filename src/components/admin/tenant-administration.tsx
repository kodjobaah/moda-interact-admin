import {
  updateTenantAction,
  upsertTenantRecoveryPolicyOverrideAction,
} from "@/app/actions/tenant";
import { formatDateTime } from "@/lib/admin/format";
import type { TenantDetail } from "@/lib/admin/types";
import { adminI18n, adminStatusLabel } from "@/i18n";
import { TenantBillingControls } from "./billing-controls";
import { TenantRecoveryPolicyClearForm } from "./tenant-recovery-policy-clear-form";

export function TenantAdministration({
  tenant,
  returnTo,
  saved,
}: {
  tenant: TenantDetail;
  returnTo: string;
  saved?: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <h4 className="mb-3 text-xs font-bold tracking-wider text-gray-400 uppercase">
            {adminI18n.t("tenant.lifecycleStatus")}
          </h4>
          <form action={updateTenantAction} className="space-y-4">
            <input type="hidden" name="shopId" value={tenant.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <div>
              <label
                className="mb-1 block text-xs font-medium text-gray-600"
                htmlFor={`status-${tenant.id}`}
              >
                {adminI18n.t("tenant.shopStatus")}
              </label>
              <select
                id={`status-${tenant.id}`}
                name="status"
                defaultValue={tenant.status}
                className="w-full rounded-md border border-gray-300 bg-white p-2 text-sm outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-200)]"
              >
                <option value="ACTIVE">{adminStatusLabel("ACTIVE")}</option>
                <option value="SUSPENDED">
                  {adminStatusLabel("SUSPENDED")}
                </option>
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <span className="block text-xs font-medium text-gray-500">
                  {adminI18n.t("tenant.installedAt")}
                </span>
                <p className="mt-0.5 text-sm font-medium text-gray-900">
                  {formatDateTime(tenant.installedAt)}
                </p>
              </div>
              <div>
                <span className="block text-xs font-medium text-gray-500">
                  {adminI18n.t("tenant.uninstalledAt")}
                </span>
                <p className="mt-0.5 text-sm font-medium text-gray-900">
                  {formatDateTime(tenant.uninstalledAt)}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-gray-100 pt-3">
              <span className="text-xs text-green-700" aria-live="polite">
                {saved ? adminI18n.t("tenant.saved") : ""}
              </span>
              <button
                type="submit"
                className="rounded-md bg-[var(--brand-700)] px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--brand-800)]"
              >
                {adminI18n.t("tenant.save")}
              </button>
            </div>
          </form>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <h4 className="mb-3 text-xs font-bold tracking-wider text-gray-400 uppercase">
            {adminI18n.t("tenant.billingOnboarding")}
          </h4>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-gray-500">
                {adminI18n.t("tenant.plan")}
              </dt>
              <dd className="mt-1 text-sm font-semibold text-gray-900">
                {tenant.planName ??
                  tenant.planHandle ??
                  adminI18n.t("tenant.noPlan")}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">
                {adminI18n.t("tenant.subscriptionStatus")}
              </dt>
              <dd className="mt-1 text-sm font-semibold text-gray-900">
                {adminStatusLabel(tenant.subscriptionStatus)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">
                {adminI18n.t("tenant.currentPeriodStart")}
              </dt>
              <dd className="mt-1 text-sm font-semibold text-gray-900">
                {formatDateTime(tenant.currentPeriodStart)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">
                {adminI18n.t("tenant.currentPeriodEnd")}
              </dt>
              <dd className="mt-1 text-sm font-semibold text-gray-900">
                {formatDateTime(tenant.currentPeriodEnd)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">
                {adminI18n.t("tenant.onboarding")}
              </dt>
              <dd className="mt-1 text-sm font-semibold text-gray-900">
                {adminI18n.t(
                  tenant.onboardingCompleted
                    ? "tenant.completed"
                    : "tenant.incomplete",
                )}
              </dd>
            </div>
          </dl>
        </div>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h4 className="mb-3 text-xs font-bold tracking-wider text-gray-400 uppercase">Recovery policy</h4>
        <div className="mb-5 grid gap-4 md:grid-cols-3">
          <PolicyColumn title="Merchant configured" policy={tenant.recoveryPolicy.merchant} />
          <PolicyColumn title={tenant.recoveryPolicy.overrideExpired ? "Admin override (expired)" : "Admin override"} policy={tenant.recoveryPolicy.override} />
          <PolicyColumn title="Effective" policy={tenant.recoveryPolicy.effective} />
        </div>
        <dl className="mb-5 grid gap-3 text-sm sm:grid-cols-4">
          <Metric label="Catalogue" value={tenant.recoveryPolicy.catalogue.status} />
          <Metric label="Last successful sync" value={formatDateTime(tenant.recoveryPolicy.catalogue.lastSuccessfulSyncAt)} />
          <Metric label="Running discounts" value={String(tenant.recoveryPolicy.catalogue.runningDiscountCount)} />
          <Metric label="Fixed selectable" value={String(tenant.recoveryPolicy.catalogue.fixedSelectableCount)} />
        </dl>
        <form action={upsertTenantRecoveryPolicyOverrideAction} className="grid gap-4 border-t border-gray-100 pt-5 md:grid-cols-2">
          <input type="hidden" name="shopId" value={tenant.id} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <label className="text-sm">Recovery start delay (minutes)<input className="mt-1 w-full rounded-md border border-gray-300 p-2" name="recoveryDelayMinutes" type="number" min={0} max={10080} defaultValue={tenant.recoveryPolicy.effective.recoveryDelayMinutes} required /></label>
          <label className="text-sm">Recovery offer mode<select className="mt-1 w-full rounded-md border border-gray-300 p-2" name="recoveryOfferMode" defaultValue={tenant.recoveryPolicy.effective.recoveryOfferMode}><option value="NONE">None</option><option value="FIXED">Fixed</option><option value="AI_BEST_APPLICABLE">AI best applicable</option></select></label>
          <label className="text-sm">Fixed Shopify discount<select className="mt-1 w-full rounded-md border border-gray-300 p-2" name="fixedShopifyDiscountId" defaultValue={tenant.recoveryPolicy.effective.fixedShopifyDiscountId ?? ""}><option value="">None</option>{tenant.recoveryPolicy.catalogue.selectableDiscounts.map((discount) => <option key={discount.id} value={discount.id}>{discount.title}</option>)}</select></label>
          <label className="text-sm">Follow-up delay (minutes)<input className="mt-1 w-full rounded-md border border-gray-300 p-2" name="followUpDelayMinutes" type="number" min={1} max={10080} defaultValue={tenant.recoveryPolicy.effective.followUpDelayMinutes ?? ""} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="hidden" name="followUpEnabled" value="false" /><input name="followUpEnabled" type="checkbox" value="true" defaultChecked={tenant.recoveryPolicy.effective.followUpEnabled} /><span>Enable no-response follow-up</span></label>
          <label className="text-sm">Expires at (optional)<input className="mt-1 w-full rounded-md border border-gray-300 p-2" name="expiresAt" type="datetime-local" defaultValue={tenant.recoveryPolicy.overrideExpiresAt?.toISOString().slice(0, 16) ?? ""} /></label>
          <label className="text-sm md:col-span-2">Reason<textarea className="mt-1 w-full rounded-md border border-gray-300 p-2" name="reason" minLength={1} maxLength={1000} required placeholder="Explain this tenant-specific override." /></label>
          <div className="flex flex-wrap gap-2 md:col-span-2"><button type="submit" className="rounded-md bg-[var(--brand-700)] px-4 py-2 text-xs font-semibold text-white">Save override</button></div>
        </form>
        {tenant.recoveryPolicy.override ? <TenantRecoveryPolicyClearForm shopId={tenant.id} returnTo={returnTo} /> : null}
        {tenant.recoveryPolicy.overrideReason ? <p className="mt-3 text-xs text-gray-500">Current override reason: {tenant.recoveryPolicy.overrideReason}</p> : null}
      </div>
      <TenantBillingControls
        shopId={tenant.id}
        controls={tenant.billingControls}
        defaultSoftLimit={tenant.defaultOutboundSoftLimit}
        defaultHardLimit={tenant.defaultOutboundHardLimit}
      />
    </div>
  );
}
function PolicyColumn({ title, policy }: { title: string; policy: TenantDetail["recoveryPolicy"]["merchant"] | null }) {
  return <div className="rounded-md border border-gray-200 p-3"><h5 className="text-xs font-semibold text-gray-500">{title}</h5>{policy ? <dl className="mt-2 space-y-1 text-sm"><Metric label="Delay" value={`${policy.recoveryDelayMinutes} min`} /><Metric label="Offer" value={policy.recoveryOfferMode} /><Metric label="Fixed discount" value={policy.fixedShopifyDiscountId ?? "None"} /><Metric label="Follow-up" value={policy.followUpEnabled ? `${policy.followUpDelayMinutes ?? "?"} min` : "Off"} /></dl> : <p className="mt-2 text-sm text-gray-500">None</p>}</div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-gray-500">{label}</dt><dd className="font-medium text-gray-900">{value}</dd></div>;
}
