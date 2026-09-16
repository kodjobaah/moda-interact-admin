import Link from "next/link";
import { RecoveryCreditProviderActionKind, RecoveryCreditRefundStatus } from "@prisma/client";
import type {
  PageResult,
  RecoveryCreditRefundDetail,
  RecoveryCreditRefundItem,
  RecoveryCreditRefundQueueStatus,
} from "@/lib/admin/types";
import { recordRecoveryCreditProviderEvidenceAction } from "@/app/actions/recovery-credit-refunds";
import { buildUrl, withParamUpdates } from "@/lib/admin/query";
import { adminI18n } from "@/i18n";
import { AdminDetailDrawer } from "./admin-detail-drawer";
import { Pagination } from "./pagination";

const statuses: RecoveryCreditRefundQueueStatus[] = [
  "REQUESTED",
  "READY_FOR_REFUND_PROCESSING",
  "WAITING_FOR_RESERVATIONS",
  "PROVIDER_ACTION_REQUIRED",
  "NEEDS_ATTENTION",
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
];

function label(status: string) {
  const key = `billing.refund.status.${status}`;
  return adminI18n.t(key) === key ? status.replaceAll("_", " ") : adminI18n.t(key);
}

function refundText(key: string) {
  return adminI18n.t(`billing.refund.${key}`);
}

function isAutomaticCompleted(refund: RecoveryCreditRefundItem) {
  return refund.status === RecoveryCreditRefundStatus.COMPLETED
    && refund.automaticCorrectionUsageEventId !== null
    && refund.providerActionKind === null;
}

function isManualCompleted(refund: RecoveryCreditRefundItem) {
  return refund.status === RecoveryCreditRefundStatus.COMPLETED
    && refund.automaticCorrectionUsageEventId === null
    && (refund.providerActionKind === RecoveryCreditProviderActionKind.REFUND
      || refund.providerActionKind === RecoveryCreditProviderActionKind.CREDIT);
}

function isManualFallback(refund: RecoveryCreditRefundItem) {
  return refund.status === RecoveryCreditRefundStatus.PROVIDER_ACTION_REQUIRED
    && refund.automaticCorrectionUsageEventId === null;
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
  if (refund.status === RecoveryCreditRefundStatus.NEEDS_ATTENTION) {
    return refundText("needsAttention");
  }
  if (isAutomaticCompleted(refund)) {
    return refundText("completedAutomatic");
  }
  if (isManualCompleted(refund)) {
    return refundText("completedManual");
  }
  if (refund.status === RecoveryCreditRefundStatus.COMPLETED) {
    return null;
  }
  if (refund.automaticCorrectionUsageEventId !== null) {
    return refund.automaticCorrection?.shopifyReportState === "REPORTED"
      ? refundText("awaitingReconciliation")
      : refundText("automaticInProgress");
  }
  if (isManualFallback(refund)) {
    return refundText("manualRequired");
  }
  if (refund.queueStatus === "WAITING_FOR_RESERVATIONS") {
    return refundText("waitingForReservations");
  }
  if (refund.queueStatus === "READY_FOR_REFUND_PROCESSING") {
    return refundText("readyForProcessing");
  }
  if (refund.status === "REQUESTED") {
    return refundText("awaitingAssessment");
  }
  return null;
}

function SettlementActions({ refund, canSettle }: { refund: RecoveryCreditRefundDetail; canSettle: boolean }) {
  if (!canSettle || refund.status !== RecoveryCreditRefundStatus.PROVIDER_ACTION_REQUIRED || refund.automaticCorrectionUsageEventId !== null) return null;
  return <ProviderEvidenceForm refund={refund} />;
}

function ProviderEvidenceForm({ refund }: { refund: RecoveryCreditRefundDetail }) {
  return (
    <div className="mt-8 border-t border-gray-200 pt-6">
      <h3 className="text-sm font-semibold text-gray-950">{refundText("manualEvidence")}</h3>
      <form action={async (formData) => {
        await recordRecoveryCreditProviderEvidenceAction({
          refundId: refund.id,
          actionKind: String(formData.get("actionKind")) as RecoveryCreditProviderActionKind,
          providerReference: String(formData.get("providerReference") ?? ""),
          providerAmount: String(formData.get("providerAmount") ?? ""),
          providerCurrency: String(formData.get("providerCurrency") ?? ""),
          confirmed: formData.get("confirmed") === "on",
        });
      }} className="mt-3 grid gap-3 sm:grid-cols-2">
        <select name="actionKind" defaultValue={refund.providerActionKind ?? RecoveryCreditProviderActionKind.REFUND} className="rounded-md border border-gray-300 p-2 text-sm">
          <option value={RecoveryCreditProviderActionKind.REFUND}>REFUND</option>
          <option value={RecoveryCreditProviderActionKind.CREDIT}>CREDIT</option>
        </select>
        <input name="providerReference" required maxLength={512} defaultValue={refund.providerReference ?? ""} placeholder="Provider reference" className="rounded-md border border-gray-300 p-2 text-sm" />
        <input name="providerAmount" required defaultValue={refund.providerAmount ?? refund.expectedProviderAmount ?? ""} placeholder="Provider amount" className="rounded-md border border-gray-300 p-2 text-sm" />
        <input name="providerCurrency" required maxLength={3} defaultValue={refund.providerCurrency ?? refund.expectedProviderCurrency ?? ""} placeholder="Provider currency" className="rounded-md border border-gray-300 p-2 text-sm" />
        <label className="flex items-center gap-2 text-sm text-gray-700 sm:col-span-2"><input name="confirmed" type="checkbox" required /> {refundText("confirmProviderAction")}</label>
        <button type="submit" className="rounded-md bg-[var(--brand-700)] px-3 py-2 text-sm font-semibold text-white sm:col-span-2">{refundText("recordProviderEvidence")}</button>
      </form>
    </div>
  );
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
        <p className="mt-1 text-sm text-gray-500">{refundText("description")}</p>
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
      ) : <p className="px-5 py-8 text-sm text-gray-500">{refundText("noMatching")}</p>}
      <Pagination pathname="/billing" params={params} page={refunds.page} totalPages={refunds.totalPages} totalItems={refunds.totalItems} pageParam="refundPage" countKey="pagination.items" resetParams={["refundPage"]} />
    </section>
  );
}

export function RecoveryCreditRefundDrawer({
  refund,
  params,
  canSettle,
}: {
  refund: RecoveryCreditRefundDetail;
  params: Record<string, string>;
  canSettle: boolean;
}) {
  const notice = stateNotice(refund);
  const providerSnapshot = JSON.stringify(refund.purchase.providerPriceSnapshot)?.slice(0, 2000) ?? null;
  const automatic = refund.automaticCorrectionUsageEventId !== null;
  const automaticCompleted = isAutomaticCompleted(refund);
  const manualCompleted = isManualCompleted(refund);
  const manualFallback = isManualFallback(refund);
  const manualEvidence = manualCompleted || (refund.status === RecoveryCreditRefundStatus.NEEDS_ATTENTION && refund.providerActionKind !== null);
  const routeAutomatic = automatic && (refund.status !== RecoveryCreditRefundStatus.COMPLETED || automaticCompleted);
  const routeManual = manualFallback || manualCompleted;
  return (
    <AdminDetailDrawer title="Refund request details" closeHref={withParamUpdates("/billing", params, { refundId: null })}>
      {notice ? <p className="mb-6 rounded-md bg-amber-50 p-4 text-sm text-amber-900">{notice}</p> : null}
      {automatic && refund.status === RecoveryCreditRefundStatus.PROVIDER_ACTION_REQUIRED ? <p className="mb-6 rounded-md bg-red-50 p-4 text-sm text-red-900">{refundText("automaticSafetyWarning")}</p> : null}
      <h3 className="text-sm font-semibold text-gray-950">{refundText("settlementSummary")}</h3>
      <DetailList items={[
        ["Refund ID", refund.id],
        ["Shop", refund.shop.domain],
        ["Request status", label(refund.status)],
        ["Queue status", label(refund.queueStatus)],
        ["Final refundable credits", refund.finalCreditQuantity],
        ["Expected provider amount", refund.expectedProviderAmount ? `${refund.expectedProviderAmount} ${refund.expectedProviderCurrency ?? ""}` : null],
        ["Purchase ID", refund.purchase.id],
        ["Original plan handle", refund.planHandleSnapshot],
        ["Original event handle", refund.eventHandleSnapshot],
      ]} />
      <h3 className="mt-8 border-t border-gray-200 pt-6 text-sm font-semibold text-gray-950">{refundText("settlementRoute")}</h3>
      <p className="mt-2 text-sm text-gray-700">{routeAutomatic ? refundText("routeAutomatic") : routeManual ? refundText("routeManual") : refundText("routePending")}</p>
      {automatic ? <div className="mt-4"><h3 className="text-sm font-semibold text-gray-950">{refundText("automaticEvidence")}</h3><DetailList items={[["Correction UsageEvent ID", refund.automaticCorrection?.id ?? refund.automaticCorrectionUsageEventId], ["Correction quantity", refund.automaticCorrection?.quantity ?? null], ["Shopify report state", refund.automaticCorrection?.shopifyReportState ?? null], ["Provider quantity before correction", refund.providerUsageQuantityBeforeCorrection], ["Provider cost before correction", refund.providerUsageCostBeforeCorrection], ["Expected provider quantity after correction", refund.expectedProviderUsageQuantityAfterCorrection], ["Expected provider cost after correction", refund.expectedProviderUsageCostAfterCorrection], ["Expected refund amount/currency", refund.expectedProviderAmount ? `${refund.expectedProviderAmount} ${refund.expectedProviderCurrency ?? ""}` : null], ["Shopify event handle", refund.automaticCorrection?.shopifyEventHandle ?? null], ["Shopify idempotency key", refund.automaticCorrection?.shopifyIdempotencyKey ?? null], ["Report attempts", refund.automaticCorrection?.reportAttemptCount ?? null], ["Last report attempt", refund.automaticCorrection?.lastReportAttemptAt ? adminI18n.formatDateTime(refund.automaticCorrection.lastReportAttemptAt) : null], ["Reported at", refund.automaticCorrection?.reportedAt ? adminI18n.formatDateTime(refund.automaticCorrection.reportedAt) : null]]} /><Link className="mt-4 inline-block font-semibold text-[var(--brand-700)] hover:underline" href={buildUrl("/billing", { view: "events", eventId: refund.automaticCorrectionUsageEventId })}>{refundText("viewAppEvent")}</Link></div> : null}
      <details className="mt-8 border-t border-gray-200 pt-6"><summary className="cursor-pointer text-sm font-semibold text-gray-950">{refundText("purchaseProvenance")}</summary><div className="mt-4"><DetailList items={[["Billing period snapshot", refund.billingPeriodIdSnapshot], ["Provider subscription snapshot", refund.providerSubscriptionIdSnapshot], ["Plan handle snapshot", refund.planHandleSnapshot], ["Event handle snapshot", refund.eventHandleSnapshot], ["Purchase provider amount/currency", `${refund.purchaseProviderAmountSnapshot} ${refund.purchaseProviderCurrencySnapshot}`], ["Usage quantity before", refund.purchase.providerUsageQuantityBeforeSnapshot], ["Usage cost before", `${refund.purchase.providerUsageCostBeforeSnapshot} ${refund.purchase.providerUsageCostCurrencyBeforeSnapshot}`], ["Usage quantity after", refund.purchase.providerUsageQuantityAfterSnapshot], ["Usage cost after", refund.purchase.providerUsageCostAfterSnapshot ? `${refund.purchase.providerUsageCostAfterSnapshot} ${refund.purchase.providerUsageCostCurrencyAfterSnapshot ?? ""}` : null], ["Provider valuation confirmed at", refund.purchase.providerValuationConfirmedAt ? adminI18n.formatDateTime(refund.purchase.providerValuationConfirmedAt) : null], ["Provider price evidence", providerSnapshot], ["Credits granted at request", refund.purchaseCreditsGrantedSnapshot], ["Current amount at request", refund.currentAmountAtRequestSnapshot], ["Reserved amount at request", refund.reservedAmountAtRequestSnapshot], ["Available amount at request", refund.availableAmountAtRequestSnapshot], ["Source", refund.source], ["Requested by Shopify user", refund.requestedByShopifyUserId], ["Source message", refund.sourceMessage?.id ?? null]]} /></div></details>
      <details className="mt-8 border-t border-gray-200 pt-6"><summary className="cursor-pointer text-sm font-semibold text-gray-950">Reservations and history</summary><div className="mt-4 space-y-2 text-sm text-gray-600"><p>{refund.reservations.length ? refund.reservations.map((reservation) => `${reservation.quantity} ${label(reservation.status)}`).join(" · ") : "No reservations in the bounded history."}</p>{refund.refundHistory.map((entry) => <p key={entry.id}>{adminI18n.formatDateTime(entry.createdAt)} · {label(entry.status)} · {entry.finalCreditQuantity ?? "quantity not locked"} credits · {entry.providerAmount ? `${entry.providerAmount} ${entry.providerCurrency ?? ""}` : "provider amount not recorded"}</p>)}</div></details>
      {manualEvidence ? <div className="mt-8 border-t border-gray-200 pt-6"><h3 className="text-sm font-semibold text-gray-950">{refundText("manualEvidence")}</h3><DetailList items={[["Recorded provider action", refund.providerActionKind], ["Provider reference", refund.providerReference], ["Recorded provider amount", refund.providerAmount ? `${refund.providerAmount} ${refund.providerCurrency ?? ""}` : null]]} /></div> : null}
      <SettlementActions refund={refund} canSettle={canSettle} />
    </AdminDetailDrawer>
  );
}

export function parseRecoveryCreditRefundStatus(value: string | undefined): RecoveryCreditRefundQueueStatus | undefined {
  return value && statuses.includes(value as RecoveryCreditRefundQueueStatus) ? value as RecoveryCreditRefundQueueStatus : undefined;
}