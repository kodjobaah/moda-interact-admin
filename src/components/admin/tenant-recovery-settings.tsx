import { upsertTenantRecoveryPolicyOverrideAction } from "@/app/actions/tenant";
import { formatDateTime } from "@/lib/admin/format";
import type { TenantDetail } from "@/lib/admin/types";
import { adminI18n } from "@/i18n";
import { TenantRecoveryPolicyClearForm } from "./tenant-recovery-policy-clear-form";

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500">{label}</dt>
      <dd className="mt-1 font-medium text-gray-900">{value}</dd>
    </div>
  );
}

function PolicyColumn({
  title,
  policy,
  emphasized = false,
}: {
  title: string;
  policy: TenantDetail["recoveryPolicy"]["merchant"] | null;
  emphasized?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        emphasized
          ? "border-[var(--brand-200)] bg-[var(--brand-50)]"
          : "border-gray-200 bg-white"
      }`}
    >
      <h3 className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
        {title}
      </h3>
      {policy ? (
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <Metric label="Delay" value={`${policy.recoveryDelayMinutes} min`} />
          <Metric label="Offer" value={policy.recoveryOfferMode} />
          <Metric
            label="Fixed discount"
            value={policy.fixedShopifyDiscountId ?? "None"}
          />
          <Metric
            label="Follow-up"
            value={
              policy.followUpEnabled
                ? `${policy.followUpDelayMinutes ?? "?"} min`
                : "Off"
            }
          />
        </dl>
      ) : (
        <p className="mt-3 text-sm text-gray-500">None</p>
      )}
    </div>
  );
}

export function TenantRecoverySettings({
  tenant,
  returnTo,
  saved,
}: {
  tenant: TenantDetail;
  returnTo: string;
  saved?: boolean;
}) {
  const policy = tenant.recoveryPolicy;
  const sourceLabel =
    policy.effective.source === "ADMIN_OVERRIDE"
      ? policy.overrideExpired
        ? "Expired admin override"
        : "Admin override"
      : "Merchant configuration";

  return (
    <div className="space-y-5">
      {saved ? (
        <p
          role="status"
          className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800"
        >
          {adminI18n.t("tenant.saved")}
        </p>
      ) : null}

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-950">
              {adminI18n.t("tenant.effectiveRecoveryPolicy")}
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              {adminI18n.t("tenant.effectiveRecoveryPolicyHelp")}
            </p>
          </div>
          <span className="rounded-full bg-[var(--brand-50)] px-3 py-1 text-xs font-semibold text-[var(--brand-800)]">
            {sourceLabel}
          </span>
        </div>
        <div className="mt-5">
          <PolicyColumn
            title={adminI18n.t("tenant.effective")}
            policy={policy.effective}
            emphasized
          />
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-gray-950">
          {adminI18n.t("tenant.policyProvenance")}
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          {adminI18n.t("tenant.policyProvenanceHelp")}
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <PolicyColumn title="Merchant configured" policy={policy.merchant} />
          <PolicyColumn
            title={
              policy.overrideExpired
                ? "Admin override (expired)"
                : "Admin override"
            }
            policy={policy.override}
          />
        </div>
        {policy.overrideReason ? (
          <p className="mt-4 rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">
            <span className="font-semibold text-gray-800">Current override reason:</span>{" "}
            {policy.overrideReason}
          </p>
        ) : null}
        <dl className="mt-5 grid gap-4 border-t border-gray-100 pt-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Catalogue" value={policy.catalogue.status} />
          <Metric
            label="Last successful sync"
            value={formatDateTime(policy.catalogue.lastSuccessfulSyncAt)}
          />
          <Metric
            label="Running discounts"
            value={String(policy.catalogue.runningDiscountCount)}
          />
          <Metric
            label="Fixed selectable"
            value={String(policy.catalogue.fixedSelectableCount)}
          />
        </dl>
      </section>

      <details className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-[var(--brand-700)] marker:hidden">
          {adminI18n.t("tenant.editRecoveryOverride")}
          <span className="ml-2 font-normal text-gray-500">
            {adminI18n.t("tenant.editRecoveryOverrideHelp")}
          </span>
        </summary>
        <div className="border-t border-gray-100 p-5">
          <form
            action={upsertTenantRecoveryPolicyOverrideAction}
            className="grid gap-4 md:grid-cols-2"
          >
            <input type="hidden" name="shopId" value={tenant.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <label className="text-sm font-medium text-gray-700">
              Recovery start delay (minutes)
              <input
                className="mt-1 w-full rounded-md border border-gray-300 p-2"
                name="recoveryDelayMinutes"
                type="number"
                min={0}
                max={10080}
                defaultValue={policy.effective.recoveryDelayMinutes}
                required
              />
            </label>
            <label className="text-sm font-medium text-gray-700">
              Recovery offer mode
              <select
                className="mt-1 w-full rounded-md border border-gray-300 p-2"
                name="recoveryOfferMode"
                defaultValue={policy.effective.recoveryOfferMode}
              >
                <option value="NONE">None</option>
                <option value="FIXED">Fixed</option>
                <option value="AI_BEST_APPLICABLE">AI best applicable</option>
              </select>
            </label>
            <label className="text-sm font-medium text-gray-700">
              Fixed Shopify discount
              <select
                className="mt-1 w-full rounded-md border border-gray-300 p-2"
                name="fixedShopifyDiscountId"
                defaultValue={policy.effective.fixedShopifyDiscountId ?? ""}
              >
                <option value="">None</option>
                {policy.catalogue.selectableDiscounts.map((discount) => (
                  <option key={discount.id} value={discount.id}>
                    {discount.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-gray-700">
              Follow-up delay (minutes)
              <input
                className="mt-1 w-full rounded-md border border-gray-300 p-2"
                name="followUpDelayMinutes"
                type="number"
                min={1}
                max={10080}
                defaultValue={policy.effective.followUpDelayMinutes ?? ""}
              />
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <input type="hidden" name="followUpEnabled" value="false" />
              <input
                name="followUpEnabled"
                type="checkbox"
                value="true"
                defaultChecked={policy.effective.followUpEnabled}
              />
              <span>Enable no-response follow-up</span>
            </label>
            <label className="text-sm font-medium text-gray-700">
              Expires at (optional)
              <input
                className="mt-1 w-full rounded-md border border-gray-300 p-2"
                name="expiresAt"
                type="datetime-local"
                defaultValue={
                  policy.overrideExpiresAt?.toISOString().slice(0, 16) ?? ""
                }
              />
            </label>
            <label className="text-sm font-medium text-gray-700 md:col-span-2">
              Mutation reason
              <textarea
                className="mt-1 w-full rounded-md border border-gray-300 p-2"
                name="reason"
                minLength={1}
                maxLength={1000}
                required
                placeholder="Explain this tenant-specific override."
              />
            </label>
            <div className="md:col-span-2">
              <button
                type="submit"
                className="rounded-md bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white"
              >
                Save recovery override
              </button>
            </div>
          </form>

          {policy.override ? (
            <div className="mt-5 border-t border-gray-100 pt-4">
              <p className="mb-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">
                Remove current override
              </p>
              <TenantRecoveryPolicyClearForm
                shopId={tenant.id}
                returnTo={returnTo}
              />
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
}
