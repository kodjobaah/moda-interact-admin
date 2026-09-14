import Link from "next/link";
import type {
  PageResult,
  RecoveryCreditRefundDetail,
  RecoveryCreditRefundItem,
  RecoveryCreditRefundQueueStatus,
} from "@/lib/admin/types";
import { buildUrl, withParamUpdates } from "@/lib/admin/query";
import { adminI18n } from "@/i18n";
import { AdminDetailDrawer } from "./admin-detail-drawer";
import { Pagination } from "./pagination";

const statuses: RecoveryCreditRefundQueueStatus[] = [
  "REQUESTED",
  "READY_FOR_PROVIDER_ACTION",
  "WAITING_FOR_RESERVATIONS",
  "PROVIDER_ACTION_REQUIRED",
  "NEEDS_ATTENTION",
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
];

function label(status: string) {
  return status.replaceAll("_", " ");
}

function DetailList({ items }: { items: Array<[string, string | number | null]> }) {
  return (
    <dl className="space-y-3">
      {items.map(([name, value]) => (
        <div key={name}>
          <dt className="text-xs font-semibold tracking-wide text-gray-500 uppercase">{name}</dt>
          <dd className="mt-1 break-words text-sm text-gray-900">{value ?? adminI18n.t("empty.notRecorded")}</dd>
        </div>
      ))}
    </dl>
  );
}

function stateNotice(refund: RecoveryCreditRefundItem) {
  if (refund.queueStatus === "WAITING_FOR_RESERVATIONS") {
    return "Waiting for in-flight conversations to settle. Provider refund action must not start yet.";
  }
  if (refund.queueStatus === "READY_FOR_PROVIDER_ACTION") {
    return "Ready for provider action. Final credit quantity will be locked by the settlement workflow from the live current amount.";
  }
  if (refund.status === "REQUESTED") {
    return "Data integrity attention: this request is not in a valid withdrawn-purchase state.";
  }
  return null;
}

export function RecoveryCreditRefundQueue({
  refunds,
  params,
}: {
  refunds: PageResult<RecoveryCreditRefundItem>;
  params: Record<string, string>;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-5 py-4">
        <h2 className="text-lg font-semibold text-gray-950">Recovery-credit refund requests</h2>
        <p className="mt-1 text-sm text-gray-500">Read-only triage of merchant-created requests. The exact purchase lot remains the authority.</p>
      </div>
      <form method="get" className="flex flex-wrap items-end gap-3 border-b border-gray-200 bg-gray-50 px-5 py-4">
        <input type="hidden" name="view" value="refunds" />
        <label className="text-xs font-semibold text-gray-600">Queue status<select name="refundStatus" defaultValue={params.refundStatus ?? ""} className="mt-1 block rounded-md border border-gray-300 bg-white p-2 text-sm font-normal">
          <option value="">All requests</option>
          {statuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}
        </select></label>
        <button type="submit" className="rounded-md bg-[var(--brand-700)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)]">Apply filter</button>
      </form>
      {refunds.items.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50"><tr>{["Shop", "Request", "Purchase", "Live credits", "Created", "Details"].map((heading) => <th key={heading} className="px-5 py-3 text-left text-xs font-semibold tracking-wide text-gray-500 uppercase">{heading}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-200">
              {refunds.items.map((refund) => (
                <tr key={refund.id}>
                  <td className="px-5 py-3 text-sm font-medium text-gray-900">{refund.shop.domain}</td>
                  <td className="px-5 py-3 text-sm text-gray-600"><span className="font-semibold">{label(refund.queueStatus)}</span><span className="mt-1 block text-xs text-gray-500">{label(refund.status)}</span></td>
                  <td className="px-5 py-3 text-sm text-gray-600"><span className="font-mono text-xs">{refund.purchase.id}</span><span className="mt-1 block text-xs">{label(refund.purchase.status)}</span></td>
                  <td className="px-5 py-3 text-sm text-gray-600">{refund.purchase.currentAmount} current / {refund.purchase.reservedAmount} reserved</td>
                  <td className="px-5 py-3 text-sm text-gray-600">{adminI18n.formatDateTime(refund.createdAt)}</td>
                  <td className="px-5 py-3 text-sm"><Link className="font-semibold text-[var(--brand-700)] hover:underline" href={buildUrl("/billing", { ...params, view: "refunds", refundId: refund.id })}>View request</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="px-5 py-8 text-sm text-gray-500">No refund requests match the current filter.</p>}
      <Pagination pathname="/billing" params={params} page={refunds.page} totalPages={refunds.totalPages} totalItems={refunds.totalItems} pageParam="refundPage" countKey="pagination.items" resetParams={["refundPage"]} />
    </section>
  );
}

export function RecoveryCreditRefundDrawer({
  refund,
  params,
}: {
  refund: RecoveryCreditRefundDetail;
  params: Record<string, string>;
}) {
  const notice = stateNotice(refund);
  const providerSnapshot = JSON.stringify(refund.purchase.providerPriceSnapshot)?.slice(0, 2000) ?? null;
  return (
    <AdminDetailDrawer title="Refund request details" closeHref={withParamUpdates("/billing", params, { refundId: null })}>
      {notice ? <p className={`mb-6 rounded-md p-4 text-sm ${refund.queueStatus === "READY_FOR_PROVIDER_ACTION" ? "bg-blue-50 text-blue-900" : "bg-amber-50 text-amber-900"}`}>{notice}</p> : null}
      <DetailList items={[
        ["Refund ID", refund.id],
        ["Shop", refund.shop.domain],
        ["Request status", label(refund.status)],
        ["Queue status", label(refund.queueStatus)],
        ["Source", refund.source],
        ["Requested by Shopify user", refund.requestedByShopifyUserId],
        ["Purchase ID", refund.purchase.id],
        ["Purchase status", label(refund.purchase.status)],
        ["Purchase created", adminI18n.formatDateTime(refund.purchase.createdAt)],
        ["Purchase activated", refund.purchase.activatedAt ? adminI18n.formatDateTime(refund.purchase.activatedAt) : null],
        ["Credits granted at request", refund.purchaseCreditsGrantedSnapshot],
        ["Current amount at request", refund.currentAmountAtRequestSnapshot],
        ["Reserved at request", refund.reservedAmountAtRequestSnapshot],
        ["Available at request", refund.availableAmountAtRequestSnapshot],
        ["Current purchase amount", refund.purchase.currentAmount],
        ["Current reserved amount", refund.purchase.reservedAmount],
        ["Current unreserved amount", refund.purchase.currentAmount - refund.purchase.reservedAmount],
        ["Purchase amount / currency", refund.purchase.providerPurchaseAmount ? `${refund.purchase.providerPurchaseAmount} ${refund.purchase.providerPurchaseCurrency ?? ""}` : null],
        ["Purchase provider amount snapshot", `${refund.purchaseProviderAmountSnapshot} ${refund.purchaseProviderCurrencySnapshot}`],
        ["Billing period snapshot", refund.billingPeriodIdSnapshot],
        ["Provider subscription snapshot", refund.providerSubscriptionIdSnapshot],
        ["Plan handle snapshot", refund.planHandleSnapshot],
        ["Event handle snapshot", refund.eventHandleSnapshot],
        ["Billing period", refund.purchase.billingPeriod ? `${refund.purchase.billingPeriod.planNameSnapshot ?? "Unnamed plan"} (${adminI18n.formatDateTime(refund.purchase.billingPeriod.periodStart)} - ${adminI18n.formatDateTime(refund.purchase.billingPeriod.periodEnd)})` : null],
        ["Plan provenance", refund.purchase.planName],
        ["Usage quantity before", refund.purchase.providerUsageQuantityBeforeSnapshot],
        ["Usage cost before", `${refund.purchase.providerUsageCostBeforeSnapshot} ${refund.purchase.providerUsageCostCurrencyBeforeSnapshot}`],
        ["Usage quantity after", refund.purchase.providerUsageQuantityAfterSnapshot],
        ["Usage cost after", refund.purchase.providerUsageCostAfterSnapshot ? `${refund.purchase.providerUsageCostAfterSnapshot} ${refund.purchase.providerUsageCostCurrencyAfterSnapshot ?? ""}` : null],
        ["Provider valuation confirmed", refund.purchase.providerValuationConfirmedAt ? adminI18n.formatDateTime(refund.purchase.providerValuationConfirmedAt) : null],
        ["Provider price evidence", providerSnapshot],
        ["Reason", refund.reason],
        ["Support context message", refund.sourceMessage?.id ?? null],
      ]} />
      <h3 className="mt-8 border-t border-gray-200 pt-6 text-sm font-semibold text-gray-950">Reservations still linked to this purchase</h3>
      <p className="mt-2 text-sm text-gray-600">{refund.reservations.length ? refund.reservations.map((reservation) => `${reservation.quantity} ${label(reservation.status)}`).join(" · ") : "No reservations in the bounded history."}</p>
      <h3 className="mt-8 border-t border-gray-200 pt-6 text-sm font-semibold text-gray-950">Refund workflow history</h3>
      <div className="mt-2 space-y-2 text-sm text-gray-600">
        {refund.refundHistory.length ? refund.refundHistory.map((entry) => (
          <p key={entry.id}>{adminI18n.formatDateTime(entry.createdAt)} · {label(entry.status)} · {entry.finalCreditQuantity ?? "quantity not locked"} credits · {entry.providerAmount ? `${entry.providerAmount} ${entry.providerCurrency ?? ""}` : "provider amount not recorded"} · {entry.reason ?? "no reason recorded"}</p>
        )) : <p>No prior refund history.</p>}
      </div>
      <p className="mt-6 rounded-md bg-gray-50 p-4 text-xs text-gray-600">The current plan or top-up price is evidence only and is not refund authority. This view does not calculate, approve, or settle a provider refund.</p>
    </AdminDetailDrawer>
  );
}

export function parseRecoveryCreditRefundStatus(value: string | undefined): RecoveryCreditRefundQueueStatus | undefined {
  return value && statuses.includes(value as RecoveryCreditRefundQueueStatus) ? value as RecoveryCreditRefundQueueStatus : undefined;
}