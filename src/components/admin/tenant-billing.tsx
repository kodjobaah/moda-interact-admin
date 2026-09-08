import type { TenantBilling } from "@/lib/admin/types";
import { adminBillingReportStateLabel, adminI18n } from "@/i18n";
import { tenantBillingLedgerPresentation } from "@/lib/admin/billing-presentation.mjs";
import { Pagination } from "./pagination";

function Value({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-gray-900">{value}</dd>
    </div>
  );
}

export function TenantBillingView({
  billing,
  params,
}: {
  billing: TenantBilling;
  params: Record<string, string>;
}) {
  const subscription = billing.subscription;
  const quantity = (value: string) => adminI18n.formatNumber(Number(value));
  const empty = adminI18n.t("empty.notRecorded");
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-950">
          {adminI18n.t("billing.tenantSummary")}
        </h2>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Value
            label={adminI18n.t("tenant.plan")}
            value={subscription.plan?.name ?? adminI18n.t("tenant.noPlan")}
          />
          <Value
            label={adminI18n.t("tenant.subscriptionStatus")}
            value={subscription.status}
          />
          <Value
            label={adminI18n.t("billing.observedPlan")}
            value={
              subscription.observedShopifyPlanHandle ??
              adminI18n.t("empty.notRecorded")
            }
          />
          <Value
            label={adminI18n.t("billing.pendingPlan")}
            value={
              subscription.pendingPlan?.name ??
              adminI18n.t("empty.noneObserved")
            }
          />
          <Value
            label={adminI18n.t("tenant.currentPeriodStart")}
            value={
              subscription.currentPeriodStart
                ? adminI18n.formatDateTime(subscription.currentPeriodStart)
                : adminI18n.t("empty.notRecorded")
            }
          />
          <Value
            label={adminI18n.t("tenant.currentPeriodEnd")}
            value={
              subscription.currentPeriodEnd
                ? adminI18n.formatDateTime(subscription.currentPeriodEnd)
                : adminI18n.t("empty.notRecorded")
            }
          />
          <Value
            label={adminI18n.t("billing.pendingEffectiveAt")}
            value={
              subscription.pendingEffectiveAt
                ? adminI18n.formatDateTime(subscription.pendingEffectiveAt)
                : adminI18n.t("empty.notRecorded")
            }
          />
          <Value
            label={adminI18n.t("billing.lastSyncedAt")}
            value={
              subscription.lastSyncedAt
                ? adminI18n.formatDateTime(subscription.lastSyncedAt)
                : adminI18n.t("empty.notRecorded")
            }
          />
        </dl>
      </section>
      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-950">
          {adminI18n.t("billing.entitlements")}
        </h2>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Value
            label={adminI18n.t("billing.baseAllowance")}
            value={adminI18n.formatNumber(billing.allowance.base)}
          />
          <Value
            label={adminI18n.t("billing.adjustments")}
            value={adminI18n.formatNumber(billing.allowance.adjustments)}
          />
          <Value
            label={adminI18n.t("billing.committed")}
            value={adminI18n.formatNumber(billing.allowance.committed)}
          />
          <Value
            label={adminI18n.t("billing.reserved")}
            value={adminI18n.formatNumber(billing.allowance.reserved)}
          />
          <Value
            label={adminI18n.t("billing.remaining")}
            value={adminI18n.formatNumber(billing.allowance.remaining)}
          />
          <Value
            label={adminI18n.t("billing.paidRecoveryUsage")}
            value={quantity(billing.paidRecoveryUsage)}
          />
          <Value
            label={adminI18n.t("billing.automatedMessageUsage")}
            value={
              billing.currentPeriodAutomatedMessageQuantity === null
                ? adminI18n.t("empty.unavailable")
                : quantity(billing.currentPeriodAutomatedMessageQuantity)
            }
          />
          <Value
            label={adminI18n.t("billing.hardLimit")}
            value={
              billing.planDefaultOutboundHardLimit === null
                ? adminI18n.t("empty.unavailable")
                : adminI18n.formatNumber(billing.planDefaultOutboundHardLimit)
            }
          />
          <Value
            label={adminI18n.t("billing.platformOutboundHardCap")}
            value={
              billing.platformAbsoluteOutboundHardLimit === null
                ? adminI18n.t("empty.unavailable")
                : adminI18n.formatNumber(
                    billing.platformAbsoluteOutboundHardLimit,
                  )
            }
          />
          <Value
            label={adminI18n.t("billing.effectiveOutboundHardCap")}
            value={
              billing.effectiveOutboundHardCap === null
                ? adminI18n.t("empty.unavailable")
                : adminI18n.formatNumber(billing.effectiveOutboundHardCap)
            }
          />
        </dl>
      </section>
      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-950">
          {adminI18n.t("billing.override")}
        </h2>
        {billing.override ? (
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Value
              label={adminI18n.t("billing.outboundSoftLimit")}
              value={
                billing.override.outboundSoftLimit === null
                  ? adminI18n.t("empty.notRecorded")
                  : adminI18n.formatNumber(billing.override.outboundSoftLimit)
              }
            />
            <Value
              label={adminI18n.t("billing.outboundHardLimit")}
              value={
                billing.override.outboundHardLimit === null
                  ? adminI18n.t("empty.notRecorded")
                  : adminI18n.formatNumber(billing.override.outboundHardLimit)
              }
            />
            <Value
              label={adminI18n.t("billing.recoverySafetyCeiling")}
              value={
                billing.override.recoverySafetyCeiling === null
                  ? adminI18n.t("empty.notRecorded")
                  : adminI18n.formatNumber(
                      billing.override.recoverySafetyCeiling,
                    )
              }
            />
            <Value
              label={adminI18n.t("billing.overrideState")}
              value={
                billing.overrideState === "ACTIVE"
                  ? adminI18n.t("billing.overrideActive")
                  : adminI18n.t("billing.overrideExpired")
              }
            />
            <Value
              label={adminI18n.t("billing.overrideReason")}
              value={billing.override.reason ?? empty}
            />
            <Value
              label={adminI18n.t("billing.pauseNewRecoveries")}
              value={
                billing.override.pauseNewRecoveries === null
                  ? empty
                  : billing.override.pauseNewRecoveries
                    ? adminI18n.t("billingControls.enabled")
                    : adminI18n.t("billingControls.disabled")
              }
            />
            <Value
              label={adminI18n.t("billing.pauseAutomatedWhatsapp")}
              value={
                billing.override.pauseAutomatedWhatsapp === null
                  ? empty
                  : billing.override.pauseAutomatedWhatsapp
                    ? adminI18n.t("billingControls.enabled")
                    : adminI18n.t("billingControls.disabled")
              }
            />
            <Value
              label={adminI18n.t("billing.expiresAt")}
              value={
                billing.override.expiresAt
                  ? adminI18n.formatDateTime(billing.override.expiresAt)
                  : adminI18n.t("empty.notRecorded")
              }
            />
          </dl>
        ) : (
          <p className="text-sm text-gray-500">
            {adminI18n.t("billing.noOverride")}
          </p>
        )}
      </section>
      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-gray-950">
          {adminI18n.t("billing.reconciliation")}
        </h2>
        <p className="text-sm text-gray-600">
          {billing.discrepancy
            ? adminI18n.t("billing.discrepancyDetected")
            : adminI18n.t("billing.discrepancyUnavailable")}
        </p>
      </section>
      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-950">
            {adminI18n.t("billing.ledger")}
          </h2>
        </div>
        {billing.ledger.items.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {[
                    adminI18n.t("billing.occurredAt"),
                    adminI18n.t("billing.metric"),
                    adminI18n.t("billing.quantity"),
                    adminI18n.t("billing.reportStateLabel"),
                    adminI18n.t("billing.providerErrorCode"),
                    adminI18n.t("billing.providerResponse"),
                    adminI18n.t("billing.reportAttempts"),
                    adminI18n.t("billing.lastReportAttemptAt"),
                    adminI18n.t("billing.reportedAt"),
                    adminI18n.t("billing.shopifyEventHandle"),
                  ].map((heading) => (
                    <th
                      key={heading}
                      className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {billing.ledger.items.map((item) => {
                  const row = tenantBillingLedgerPresentation(item, {
                    empty,
                    formatDateTime: (value: Date) =>
                      adminI18n.formatDateTime(value),
                    formatNumber: (value: number) =>
                      adminI18n.formatNumber(value),
                    reportStateLabel: (value: string) =>
                      adminBillingReportStateLabel(value),
                  });
                  return (
                    <tr key={item.id}>
                      <td className="whitespace-nowrap px-5 py-3 text-sm text-gray-600">
                        {row.occurredAt}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-sm text-gray-600">
                        {row.metric}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-sm text-gray-600">
                        {row.quantity}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-sm text-gray-600">
                        {row.reportState}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-sm text-gray-600">
                        {row.providerErrorCode}
                      </td>
                      <td className="max-w-xs px-5 py-3 text-sm text-gray-600">
                        {row.providerResponseSummary}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-sm text-gray-600">
                        {row.reportAttemptCount}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-sm text-gray-600">
                        {row.lastReportAttemptAt}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-sm text-gray-600">
                        {row.reportedAt}
                      </td>
                      <td className="max-w-xs px-5 py-3 text-sm text-gray-600">
                        {row.shopifyEventHandle}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-8 text-sm text-gray-500">
            {adminI18n.t("billing.noLedger")}
          </p>
        )}
        <Pagination
          pathname="/"
          params={params}
          page={billing.ledger.page}
          totalPages={billing.ledger.totalPages}
          totalItems={billing.ledger.totalItems}
          pageParam="billingPage"
          countKey="pagination.items"
          resetParams={["billingPage"]}
        />
      </section>
    </div>
  );
}
