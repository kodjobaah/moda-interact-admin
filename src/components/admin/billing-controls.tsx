import Link from "next/link";
import {
  addFreeAllowanceAdjustmentAction,
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

export function PlatformBillingControls({
  policy,
}: {
  policy: {
    globalPauseNewRecoveries: boolean;
    globalPauseAutomatedWhatsapp: boolean;
    absoluteOutboundHardLimit: number;
    defaultWarningPercent: number;
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
        </div>
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
              {allowance.baseAllowance ??
                adminI18n.t("billingControls.notApplicable")}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">
              {adminI18n.t("billingControls.adjustments")}
            </dt>
            <dd className="text-lg font-semibold">
              {allowance.totalAdjustments}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">
              {adminI18n.t("billingControls.effectiveRemaining")}
            </dt>
            <dd className="text-lg font-semibold">
              {allowance.effectiveRemaining ??
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
          <div>
            <dt className="text-xs text-gray-500">
              {adminI18n.t("billingControls.effectiveAllowance")}
            </dt>
            <dd className="text-lg font-semibold">
              {allowance.effectiveAllowance ??
                adminI18n.t("billingControls.notApplicable")}
            </dd>
          </div>
        </dl>
        <form
          action={addFreeAllowanceAdjustmentAction}
          className="grid gap-4 sm:grid-cols-[10rem_1fr_auto] sm:items-end"
        >
          <input type="hidden" name="shopId" value={shopId} />
          <label className="text-sm font-medium text-gray-700">
            {adminI18n.t("billingControls.adjustmentQuantity")}
            <input
              className={inputClass}
              type="number"
              name="quantity"
              required
            />
          </label>
          <label className="text-sm font-medium text-gray-700">
            {adminI18n.t("billingControls.reason")}
            <input className={inputClass} name="reason" required />
          </label>
          <button
            className="rounded-md border border-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-[var(--brand-700)] hover:bg-gray-50"
            type="submit"
          >
            {adminI18n.t("billingControls.addAdjustment")}
          </button>
        </form>
      </section>
    </div>
  );
}
