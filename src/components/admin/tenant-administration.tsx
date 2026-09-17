import { updateTenantAction } from "@/app/actions/tenant";
import { formatDateTime } from "@/lib/admin/format";
import type { TenantDetail } from "@/lib/admin/types";
import { adminI18n, adminStatusLabel } from "@/i18n";

function SummaryValue({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-gray-900">{value}</dd>
    </div>
  );
}

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
    <div className="space-y-5">
      {saved ? (
        <p
          role="status"
          className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800"
        >
          {adminI18n.t("tenant.saved")}
        </p>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-950">
                {adminI18n.t("tenant.lifecycleStatus")}
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {adminI18n.t("tenant.lifecycleSummaryHelp")}
              </p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                tenant.status === "ACTIVE"
                  ? "bg-green-50 text-green-700"
                  : "bg-amber-50 text-amber-800"
              }`}
            >
              {adminStatusLabel(tenant.status)}
            </span>
          </div>

          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <SummaryValue
              label={adminI18n.t("tenant.installedAt")}
              value={formatDateTime(tenant.installedAt)}
            />
            <SummaryValue
              label={adminI18n.t("tenant.uninstalledAt")}
              value={formatDateTime(tenant.uninstalledAt)}
            />
          </dl>

          <details className="mt-5 border-t border-gray-100 pt-4">
            <summary className="cursor-pointer text-sm font-semibold text-[var(--brand-700)]">
              {adminI18n.t("tenant.changeShopStatus")}
            </summary>
            <form action={updateTenantAction} className="mt-4 space-y-4">
              <input type="hidden" name="shopId" value={tenant.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <label
                className="block text-sm font-medium text-gray-700"
                htmlFor={`status-${tenant.id}`}
              >
                {adminI18n.t("tenant.shopStatus")}
                <select
                  id={`status-${tenant.id}`}
                  name="status"
                  defaultValue={tenant.status}
                  className="mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-200)]"
                >
                  <option value="ACTIVE">{adminStatusLabel("ACTIVE")}</option>
                  <option value="SUSPENDED">
                    {adminStatusLabel("SUSPENDED")}
                  </option>
                </select>
              </label>
              <button
                type="submit"
                className="rounded-md bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-800)]"
              >
                {adminI18n.t("tenant.save")}
              </button>
            </form>
          </details>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-base font-semibold text-gray-950">
              {adminI18n.t("tenant.billingOnboarding")}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {adminI18n.t("tenant.billingSummaryHelp")}
            </p>
          </div>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <SummaryValue
              label={adminI18n.t("tenant.plan")}
              value={
                tenant.planName ??
                tenant.planHandle ??
                adminI18n.t("tenant.noPlan")
              }
            />
            <SummaryValue
              label={adminI18n.t("tenant.subscriptionStatus")}
              value={adminStatusLabel(tenant.subscriptionStatus)}
            />
            <SummaryValue
              label={adminI18n.t("tenant.currentPeriodStart")}
              value={formatDateTime(tenant.currentPeriodStart)}
            />
            <SummaryValue
              label={adminI18n.t("tenant.currentPeriodEnd")}
              value={formatDateTime(tenant.currentPeriodEnd)}
            />
            <SummaryValue
              label={adminI18n.t("tenant.onboarding")}
              value={adminI18n.t(
                tenant.onboardingCompleted
                  ? "tenant.completed"
                  : "tenant.incomplete",
              )}
            />
          </dl>
        </section>
      </div>

      <section className="rounded-lg border border-gray-200 bg-gray-50 px-5 py-4">
        <h3 className="text-sm font-semibold text-gray-900">
          {adminI18n.t("tenant.whereToManage")}
        </h3>
        <p className="mt-1 text-sm leading-6 text-gray-600">
          {adminI18n.t("tenant.whereToManageHelp")}
        </p>
      </section>
    </div>
  );
}
