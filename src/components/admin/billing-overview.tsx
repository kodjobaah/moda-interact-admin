import type {
  BillingLedgerItem,
  BillingOverview,
  PageResult,
} from "@/lib/admin/types";
import Link from "next/link";
import { adminBillingReportStateLabel, adminI18n } from "@/i18n";
import { buildUrl } from "@/lib/admin/query";
import { Pagination } from "./pagination";

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-[var(--brand-900)]">{value}</p>
    </div>
  );
}

export function BillingOverviewCards({
  overview,
}: {
  overview: BillingOverview;
}) {
  return (
    <section
      className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      aria-label={adminI18n.t("billing.overview")}
    >
      <Metric
        label={adminI18n.t("billing.freeTenants")}
        value={adminI18n.formatNumber(overview.planDistribution.free)}
      />
      <Metric
        label={adminI18n.t("billing.paidTenants")}
        value={adminI18n.formatNumber(overview.planDistribution.paid)}
      />
      <Metric
        label={adminI18n.t("billing.freeExhausted")}
        value={
          overview.freeExhausted === null
            ? adminI18n.t("empty.unavailable")
            : adminI18n.formatNumber(overview.freeExhausted)
        }
      />
      <Metric
        label={adminI18n.t("billing.paidRecoveryUsage")}
        value={adminI18n.formatNumber(Number(overview.paidRecoveryUsage))}
      />
      <Metric
        label={adminI18n.t("billing.unmappedSubscriptions")}
        value={adminI18n.formatNumber(overview.planDistribution.unmapped)}
      />
      <Metric
        label={adminI18n.t("billing.syncErrors")}
        value={adminI18n.formatNumber(overview.planDistribution.syncError)}
      />
    </section>
  );
}

export function BillingLedger({
  ledger,
  params,
}: {
  ledger: PageResult<BillingLedgerItem>;
  params: Record<string, string>;
}) {
  const quantity = (value: string) => adminI18n.formatNumber(Number(value));
  return (
    <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-5 py-4">
        <h2 className="text-lg font-semibold text-gray-950">
          {adminI18n.t("billing.ledger")}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          {adminI18n.t("billing.ledgerDescription")}
        </p>
      </div>
      <form
        method="get"
        className="grid gap-3 border-b border-gray-200 bg-gray-50 px-5 py-4 sm:grid-cols-4"
      >
        <input type="hidden" name="view" value="events" />
        <label className="text-xs font-semibold text-gray-600">
          {adminI18n.t("billing.shopId")}
          <input
            name="shopId"
            defaultValue={params.shopId}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm font-normal"
          />
        </label>
        <label className="text-xs font-semibold text-gray-600">
          {adminI18n.t("billing.reportStateLabel")}
          <select
            name="state"
            defaultValue={params.state ?? ""}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm font-normal"
          >
            <option value="">{adminI18n.t("billing.allStates")}</option>
            {[
              "PENDING",
              "IN_FLIGHT",
              "RETRYABLE",
              "REPORTED",
              "NEEDS_ATTENTION",
            ].map((state) => (
              <option key={state} value={state}>
                {adminBillingReportStateLabel(state)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-gray-600">
          {adminI18n.t("billing.from")}
          <input
            type="date"
            name="from"
            defaultValue={params.from}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm font-normal"
          />
        </label>
        <label className="text-xs font-semibold text-gray-600">
          {adminI18n.t("billing.to")}
          <input
            type="date"
            name="to"
            defaultValue={params.to}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm font-normal"
          />
        </label>
        <button
          type="submit"
          className="w-fit rounded-md bg-[var(--brand-700)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)] sm:col-span-4"
        >
          {adminI18n.t("billing.applyFilters")}
        </button>
      </form>
      {ledger.items.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {["billing.shop", "billing.metric", "billing.quantity", "billing.reportStateLabel", "billing.occurredAt", "billing.viewDetails"].map((key) => (
                  <th
                    key={key}
                    className="px-5 py-3 text-left text-xs font-semibold tracking-wide text-gray-500 uppercase"
                  >
                    {adminI18n.t(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {ledger.items.map((item) => (
                <tr key={item.id}>
                  <td className="whitespace-nowrap px-5 py-3 text-sm font-medium text-gray-900">
                    {item.shop.domain}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-sm text-gray-600">
                    {item.metric}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-sm text-gray-600">
                    {quantity(item.quantity)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-sm text-gray-600">
                    {adminBillingReportStateLabel(item.shopifyReportState)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-sm text-gray-600">
                    {adminI18n.formatDateTime(item.occurredAt)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-sm">
                    <Link className="font-semibold text-[var(--brand-700)] hover:underline" href={buildUrl("/billing", { ...params, view: "events", eventId: item.id })}>
                      {adminI18n.t("billing.viewDetails")}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-8 text-sm text-gray-500">
          {adminI18n.t("billing.noLedger")}
        </p>
      )}
      <Pagination
        pathname="/billing"
        params={params}
        page={ledger.page}
        totalPages={ledger.totalPages}
        totalItems={ledger.totalItems}
        pageParam="eventPage"
        countKey="pagination.items"
        resetParams={["eventPage"]}
      />
    </section>
  );
}
