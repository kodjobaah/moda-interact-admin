import {
  mutatePlatformBillingPolicyAction,
  mutateShopBillingOverrideAction,
} from "@/app/actions/billing-controls";
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

export function PlatformPolicyControls({
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
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-[var(--brand-900)]">
          {adminI18n.t("billingControls.platformTitle")}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
          {adminI18n.t("billingControls.platformDescription")}
        </p>
      </div>
      {!policy ? (
        <p
          role="status"
          className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          Platform policy is not configured yet. Enter the values below to create it.
        </p>
      ) : null}
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
            Minimum stay+top-up premium above next-plan upgrade
            <span className="mt-1 block text-xs font-normal text-gray-500">
              {((policy?.minimumUpgradePremiumBps ?? 2000) / 100).toFixed(2)}% (
              {policy?.minimumUpgradePremiumBps ?? 2000} bps)
            </span>
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
  const activeOverride = override && !expired ? override : null;
  const effectiveSoftLimit = activeOverride?.outboundSoftLimit ?? defaultSoftLimit;
  const effectiveHardLimit = activeOverride?.outboundHardLimit ?? defaultHardLimit;
  const overrideState = !override
    ? "Using plan defaults"
    : expired
      ? "Override expired"
      : "Override active";

  const booleanOverrideLabel = (value: boolean | null | undefined) =>
    value === null || value === undefined
      ? adminI18n.t("billingControls.inherit")
      : value
        ? adminI18n.t("billingControls.enabled")
        : adminI18n.t("billingControls.disabled");

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-950">
              {adminI18n.t("billingControls.shopTitle")}
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              {adminI18n.t("billingControls.shopDescription")}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              expired
                ? "bg-amber-50 text-amber-800"
                : override
                  ? "bg-blue-50 text-blue-700"
                  : "bg-gray-100 text-gray-700"
            }`}
          >
            {overrideState}
          </span>
        </div>

        <dl className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div>
            <dt className="text-xs font-medium text-gray-500">
              {adminI18n.t("billingControls.softLimit")}
            </dt>
            <dd className="mt-1 text-sm font-semibold text-gray-900">
              {effectiveSoftLimit}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500">
              {adminI18n.t("billingControls.hardLimit")}
            </dt>
            <dd className="mt-1 text-sm font-semibold text-gray-900">
              {effectiveHardLimit}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500">
              {adminI18n.t("billingControls.recoveryCeiling")}
            </dt>
            <dd className="mt-1 text-sm font-semibold text-gray-900">
              {activeOverride?.recoverySafetyCeiling ??
                adminI18n.t("billingControls.inherit")}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500">
              {adminI18n.t("billingControls.pauseNewRecoveries")}
            </dt>
            <dd className="mt-1 text-sm font-semibold text-gray-900">
              {booleanOverrideLabel(activeOverride?.pauseNewRecoveries)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500">
              {adminI18n.t("billingControls.pauseAutomatedWhatsapp")}
            </dt>
            <dd className="mt-1 text-sm font-semibold text-gray-900">
              {booleanOverrideLabel(activeOverride?.pauseAutomatedWhatsapp)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500">
              {adminI18n.t("billingControls.expiry")}
            </dt>
            <dd className="mt-1 text-sm font-semibold text-gray-900">
              {activeOverride?.expiresAt
                ? adminI18n.formatDateTime(activeOverride.expiresAt)
                : adminI18n.t("empty.notRecorded")}
            </dd>
          </div>
        </dl>

        {override?.reason ? (
          <p className="mt-4 rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">
            <span className="font-semibold text-gray-800">
              {adminI18n.t("billingControls.reason")}:
            </span>{" "}
            {override.reason}
          </p>
        ) : null}

        <details className="mt-5 border-t border-gray-100 pt-4">
          <summary className="cursor-pointer text-sm font-semibold text-[var(--brand-700)]">
            Edit shop billing controls
          </summary>
          {expired ? (
            <p className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
              {adminI18n.t("billingControls.expired")}
            </p>
          ) : null}
          <form action={mutateShopBillingOverrideAction} className="mt-4 space-y-4">
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
                defaultValue=""
                placeholder="Explain why these tenant-specific billing controls are required."
              />
            </label>
            <button
              className="rounded-md bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)]"
              type="submit"
            >
              {adminI18n.t("billingControls.saveShop")}
            </button>
          </form>
        </details>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-950">
              {adminI18n.t("billingControls.allowanceTitle")}
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              {adminI18n.t("billingControls.allowanceDescription")}
            </p>
          </div>
        </div>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <dt className="text-xs text-gray-500">
              {adminI18n.t("billingControls.baseAllowance")}
            </dt>
            <dd className="mt-1 text-lg font-semibold">
              {allowance.grantedAllowance ??
                adminI18n.t("billingControls.notApplicable")}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">
              {adminI18n.t("billing.remaining")}
            </dt>
            <dd className="mt-1 text-lg font-semibold">
              {allowance.remaining ??
                adminI18n.t("billingControls.notApplicable")}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">
              {adminI18n.t("billingControls.committed")}
            </dt>
            <dd className="mt-1 text-lg font-semibold">{allowance.committed}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">
              {adminI18n.t("billingControls.reserved")}
            </dt>
            <dd className="mt-1 text-lg font-semibold">{allowance.reserved}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
