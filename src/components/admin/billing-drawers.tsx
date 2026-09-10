import type { BillingPlanRow } from "@/lib/admin/billing-plan";
import type { BillingLedgerItem, RecoveryCreditPurchaseItem } from "@/lib/admin/types";
import { adminBillingReportStateLabel, adminI18n } from "@/i18n";
import { withParamUpdates } from "@/lib/admin/query";
import { AdminDetailDrawer } from "./admin-detail-drawer";
import { PlanForm } from "./billing-plan-catalog";

function DetailList({
  items,
}: {
  items: Array<[string, string | number | null]>;
}) {
  return (
    <dl className="space-y-4">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
            {label}
          </dt>
          <dd className="mt-1 break-words text-sm text-gray-900">
            {value ?? adminI18n.t("empty.notRecorded")}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function BillingPlanDrawer({
  plan,
  params,
  register = false,
}: {
  plan?: BillingPlanRow;
  params: Record<string, string>;
  register?: boolean;
}) {
  const closeHref = withParamUpdates("/billing", params, {
    planId: null,
    drawer: null,
  });
  return (
    <AdminDetailDrawer
      title={adminI18n.t(register ? "billing.newPlan" : "billing.planDetails")}
      closeHref={closeHref}
    >
      <PlanForm plan={plan} />
    </AdminDetailDrawer>
  );
}

export function RecoveryCreditPurchaseDrawer({
  purchase,
  params,
}: {
  purchase: RecoveryCreditPurchaseItem;
  params: Record<string, string>;
}) {
  const closeHref = withParamUpdates("/billing", params, { purchaseId: null });
  const event = purchase.usageEvent;
  const eventReported = event.shopifyReportState === "REPORTED";
  return (
    <AdminDetailDrawer
      title={adminI18n.t("billing.recoveryPackDetails")}
      closeHref={closeHref}
    >
      <DetailList
        items={[
          [adminI18n.t("billing.purchaseId"), purchase.id],
          [adminI18n.t("billing.shop"), purchase.shop.domain],
          [adminI18n.t("billing.status"), adminI18n.t(`billing.packStatus.${purchase.status}`)],
          [adminI18n.t("billing.creditsGranted"), purchase.creditsGranted],
          [adminI18n.t("billing.createdAt"), adminI18n.formatDateTime(purchase.createdAt)],
          [adminI18n.t("billing.activatedAt"), purchase.activatedAt ? adminI18n.formatDateTime(purchase.activatedAt) : null],
          [adminI18n.t("billing.planSnapshot"), purchase.shopifyPlanHandleSnapshot],
          [adminI18n.t("billing.packMeterSnapshot"), purchase.shopifyEventHandleSnapshot],
          [adminI18n.t("billing.usageEventId"), event.id],
          [adminI18n.t("billing.metric"), event.metric],
          [adminI18n.t("billing.quantity"), event.quantity],
          [adminI18n.t("billing.reportStateLabel"), adminBillingReportStateLabel(event.shopifyReportState)],
          [adminI18n.t("billing.submittedAt"), event.reportedAt ? adminI18n.formatDateTime(event.reportedAt) : null],
          [adminI18n.t("billing.reportAttempts"), event.reportAttemptCount],
          [adminI18n.t("billing.lastReportAttemptAt"), event.lastReportAttemptAt ? adminI18n.formatDateTime(event.lastReportAttemptAt) : null],
          [adminI18n.t("billing.providerErrorCode"), event.providerErrorCode],
          [adminI18n.t("billing.providerResponse"), event.providerResponseSummary],
        ]}
      />
      {eventReported ? (
        <p className="mt-6 rounded-md bg-blue-50 p-4 text-sm text-blue-900">
          {adminI18n.t("billing.asyncReceiptHelp")}
        </p>
      ) : null}
      {eventReported && purchase.status === "PENDING_BILLING" ? (
        <p className="mt-3 rounded-md bg-amber-50 p-4 text-sm text-amber-900">
          {adminI18n.t("billing.devDashboardHelp")}
        </p>
      ) : null}
    </AdminDetailDrawer>
  );
}

export function BillingEventDrawer({
  event,
  params,
}: {
  event: BillingLedgerItem;
  params: Record<string, string>;
}) {
  const closeHref = withParamUpdates("/billing", params, { eventId: null });
  return (
    <AdminDetailDrawer
      title={adminI18n.t("billing.eventDetails")}
      closeHref={closeHref}
    >
      <DetailList
        items={[
          [adminI18n.t("billing.shop"), event.shop.domain],
          [adminI18n.t("billing.metric"), event.metric],
          [adminI18n.t("billing.quantity"), event.quantity],
          [adminI18n.t("billing.reportStateLabel"), adminBillingReportStateLabel(event.shopifyReportState)],
          [adminI18n.t("billing.occurredAt"), adminI18n.formatDateTime(event.occurredAt)],
          [adminI18n.t("billing.reportAttempts"), event.reportAttemptCount],
          [adminI18n.t("billing.lastReportAttemptAt"), event.lastReportAttemptAt ? adminI18n.formatDateTime(event.lastReportAttemptAt) : null],
          [adminI18n.t("billing.submittedAt"), event.reportedAt ? adminI18n.formatDateTime(event.reportedAt) : null],
          [adminI18n.t("billing.providerErrorCode"), event.providerErrorCode],
          [adminI18n.t("billing.providerResponse"), event.providerResponseSummary],
          [adminI18n.t("billing.shopifyEventHandle"), event.shopifyEventHandle],
          [adminI18n.t("billing.usageEventId"), event.id],
        ]}
      />
      {event.shopifyReportState === "REPORTED" ? (
        <p className="mt-6 rounded-md bg-blue-50 p-4 text-sm text-blue-900">
          {adminI18n.t("billing.asyncReceiptHelp")}
        </p>
      ) : null}
    </AdminDetailDrawer>
  );
}
