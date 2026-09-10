import Link from "next/link";
import type {
  BillingLedgerItem,
  PageResult,
  RecoveryCreditPurchaseItem,
  TenantBilling,
} from "@/lib/admin/types";
import { adminBillingReportStateLabel, adminI18n } from "@/i18n";
import { withParamUpdates } from "@/lib/admin/query";
import { Pagination } from "./pagination";
import {
  BillingEventDrawer,
  RecoveryCreditPurchaseDrawer,
} from "./billing-drawers";

type BillingView = "overview" | "usage" | "shopify" | "activity";

function Value({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-xs font-semibold tracking-wide text-gray-500 uppercase">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900">{value}</dd>
    </div>
  );
}

function BillingTabs({ view, params }: { view: BillingView; params: Record<string, string> }) {
  const tabs: Array<[BillingView, string]> = [
    ["overview", "billing.tab.overview"],
    ["usage", "billing.tab.usage"],
    ["shopify", "billing.tab.shopify"],
    ["activity", "billing.tab.activity"],
  ];
  return (
    <nav aria-label={adminI18n.t("billing.tabs")} className="mb-6 flex gap-6 border-b border-gray-200">
      {tabs.map(([value, label]) => (
        <Link
          key={value}
          href={withParamUpdates("/", params, {
            tab: "billing",
            billingView: value,
            billingPage: value === "activity" ? 1 : null,
            packPage: value === "activity" ? 1 : null,
            purchaseId: null,
            eventId: null,
          })}
          aria-current={view === value ? "page" : undefined}
          className={view === value ? "border-b-2 border-[var(--brand-700)] pb-2 font-semibold text-[var(--brand-700)]" : "border-b-2 border-transparent pb-2 font-medium text-gray-500 hover:text-gray-700"}
        >
          {adminI18n.t(label)}
        </Link>
      ))}
    </nav>
  );
}

function Overview({ billing }: { billing: TenantBilling }) {
  const subscription = billing.subscription;
  return (
    <div className="space-y-6">
      {subscription.status === "SYNC_ERROR" ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {adminI18n.t("billing.billingHealth")}: {subscription.status}
        </p>
      ) : null}
      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-950">{adminI18n.t("billing.tenantSummary")}</h2>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Value label={adminI18n.t("tenant.plan")} value={subscription.plan?.name ?? adminI18n.t("tenant.noPlan")} />
          <Value label={adminI18n.t("tenant.subscriptionStatus")} value={subscription.status} />
          <Value label={adminI18n.t("billing.billingHealth")} value={subscription.lastSyncErrorCode ?? subscription.status} />
          <Value label={adminI18n.t("billing.remaining")} value={adminI18n.formatNumber(billing.allowance.remaining)} />
          <Value label={adminI18n.t("tenant.currentPeriodStart")} value={subscription.billingPeriod ? adminI18n.formatDateTime(subscription.billingPeriod.periodStart) : adminI18n.t("empty.notRecorded")} />
          <Value label={adminI18n.t("tenant.currentPeriodEnd")} value={subscription.billingPeriod ? adminI18n.formatDateTime(subscription.billingPeriod.periodEnd) : adminI18n.t("empty.notRecorded")} />
          <Value label={adminI18n.t("billing.pendingPlan")} value={subscription.pendingPlan?.name ?? adminI18n.t("empty.noneObserved")} />
          <Value label={adminI18n.t("billing.lastSyncedAt")} value={subscription.lastSyncedAt ? adminI18n.formatDateTime(subscription.lastSyncedAt) : adminI18n.t("empty.notRecorded")} />
        </dl>
        <p className="mt-5 border-t border-gray-100 pt-4 text-sm text-gray-600">
          {billing.overrideState === "ACTIVE" ? adminI18n.t("billing.overrideActiveWarning") : adminI18n.t("billing.defaultPolicy")}
        </p>
      </section>
    </div>
  );
}

function Usage({ billing }: { billing: TenantBilling }) {
  const quantity = (value: string) => adminI18n.formatNumber(Number(value));
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-gray-950">{adminI18n.t("billing.entitlements")}</h2>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Value label={adminI18n.t("billing.baseAllowance")} value={adminI18n.formatNumber(billing.allowance.base)} />
        <Value label={adminI18n.t("billing.adjustments")} value={adminI18n.formatNumber(billing.allowance.adjustments)} />
        <Value label={adminI18n.t("billing.committed")} value={adminI18n.formatNumber(billing.allowance.committed)} />
        <Value label={adminI18n.t("billing.reserved")} value={adminI18n.formatNumber(billing.allowance.reserved)} />
        <Value label={adminI18n.t("billing.remaining")} value={adminI18n.formatNumber(billing.allowance.remaining)} />
        <Value label={adminI18n.t("billing.paidRecoveryUsage")} value={quantity(billing.paidRecoveryUsage)} />
        <Value label={adminI18n.t("billing.automatedMessageUsage")} value={billing.currentPeriodAutomatedMessageQuantity === null ? adminI18n.t("empty.unavailable") : quantity(billing.currentPeriodAutomatedMessageQuantity)} />
        <Value label={adminI18n.t("billing.effectiveOutboundHardCap")} value={billing.effectiveOutboundHardCap === null ? adminI18n.t("empty.unavailable") : adminI18n.formatNumber(billing.effectiveOutboundHardCap)} />
      </dl>
      <details className="mt-6 border-t border-gray-100 pt-4">
        <summary className="cursor-pointer text-sm font-semibold text-gray-700">{adminI18n.t("billing.advancedLimits")}</summary>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <Value label={adminI18n.t("billing.hardLimit")} value={billing.planDefaultOutboundHardLimit === null ? adminI18n.t("empty.unavailable") : adminI18n.formatNumber(billing.planDefaultOutboundHardLimit)} />
          <Value label={adminI18n.t("billing.platformOutboundHardCap")} value={billing.platformAbsoluteOutboundHardLimit === null ? adminI18n.t("empty.unavailable") : adminI18n.formatNumber(billing.platformAbsoluteOutboundHardLimit)} />
          <Value label={adminI18n.t("billing.overrideState")} value={billing.overrideState === "ACTIVE" ? adminI18n.t("billing.overrideActive") : billing.overrideState === "EXPIRED" ? adminI18n.t("billing.overrideExpired") : adminI18n.t("billing.defaultPolicy")} />
          {billing.overrideState === "ACTIVE" && billing.override ? <Value label={adminI18n.t("billing.overrideReason")} value={billing.override.reason} /> : null}
        </dl>
      </details>
    </section>
  );
}

function Shopify({ billing }: { billing: TenantBilling }) {
  const subscription = billing.subscription;
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-gray-950">{adminI18n.t("billing.tab.shopify")}</h2>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Value label={adminI18n.t("billing.observedPlan")} value={subscription.observedShopifyPlanHandle ?? adminI18n.t("empty.notRecorded")} />
        <Value label={adminI18n.t("billing.pendingPlan")} value={subscription.pendingShopifyPlanHandle ?? adminI18n.t("empty.noneObserved")} />
        <Value label={adminI18n.t("billing.pendingEffectiveAt")} value={subscription.pendingEffectiveAt ? adminI18n.formatDateTime(subscription.pendingEffectiveAt) : adminI18n.t("empty.notRecorded")} />
        <Value label={adminI18n.t("billing.lastSyncedAt")} value={subscription.lastSyncedAt ? adminI18n.formatDateTime(subscription.lastSyncedAt) : adminI18n.t("empty.notRecorded")} />
        <Value label={adminI18n.t("billing.providerStatus")} value={subscription.lastSyncErrorCode ?? subscription.status} />
      </dl>
      <p className="mt-6 border-t border-gray-100 pt-4 text-sm text-gray-600">
        {billing.discrepancy ? adminI18n.t("billing.discrepancyDetected") : adminI18n.t("billing.reconciliationUnavailableShort")}
      </p>
    </section>
  );
}

function Activity({ packs, events, params }: { packs: PageResult<RecoveryCreditPurchaseItem>; events: PageResult<BillingLedgerItem>; params: Record<string, string> }) {
  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-5 py-4"><h2 className="text-lg font-semibold text-gray-950">{adminI18n.t("billing.tab.recoveryPacks")}</h2></div>
        {packs.items.length ? <div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-200"><thead className="bg-gray-50"><tr>{["billing.createdAt", "billing.status", "billing.creditsGranted", "billing.activatedAt", "billing.details"].map((key) => <th key={key} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{adminI18n.t(key)}</th>)}</tr></thead><tbody className="divide-y divide-gray-200">{packs.items.map((purchase) => <tr key={purchase.id}><td className="px-5 py-3 text-sm text-gray-600">{adminI18n.formatDateTime(purchase.createdAt)}</td><td className="px-5 py-3 text-sm text-gray-600">{adminI18n.t(`billing.packStatus.${purchase.status}`)}</td><td className="px-5 py-3 text-sm text-gray-600">{adminI18n.formatNumber(purchase.creditsGranted)}</td><td className="px-5 py-3 text-sm text-gray-600">{purchase.activatedAt ? adminI18n.formatDateTime(purchase.activatedAt) : adminI18n.t("empty.notRecorded")}</td><td className="px-5 py-3 text-sm"><Link className="font-semibold text-[var(--brand-700)] hover:underline" href={withParamUpdates("/", params, { billingView: "activity", purchaseId: purchase.id })}>{adminI18n.t("billing.details")}</Link></td></tr>)}</tbody></table></div> : <p className="px-5 py-6 text-sm text-gray-500">{adminI18n.t("billing.noRecoveryPacks")}</p>}
        <Pagination pathname="/" params={params} page={packs.page} totalPages={packs.totalPages} totalItems={packs.totalItems} pageParam="packPage" countKey="pagination.items" resetParams={["packPage", "purchaseId"]} />
      </section>
      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-5 py-4"><h2 className="text-lg font-semibold text-gray-950">{adminI18n.t("billing.tab.appEvents")}</h2></div>
        {events.items.length ? <div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-200"><thead className="bg-gray-50"><tr>{["billing.occurredAt", "billing.metric", "billing.quantity", "billing.reportStateLabel", "billing.details"].map((key) => <th key={key} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{adminI18n.t(key)}</th>)}</tr></thead><tbody className="divide-y divide-gray-200">{events.items.map((event) => <tr key={event.id}><td className="whitespace-nowrap px-5 py-3 text-sm text-gray-600">{adminI18n.formatDateTime(event.occurredAt)}</td><td className="px-5 py-3 text-sm text-gray-600">{event.metric}</td><td className="px-5 py-3 text-sm text-gray-600">{event.quantity}</td><td className="px-5 py-3 text-sm text-gray-600">{adminBillingReportStateLabel(event.shopifyReportState)}</td><td className="px-5 py-3 text-sm"><Link className="font-semibold text-[var(--brand-700)] hover:underline" href={withParamUpdates("/", params, { billingView: "activity", eventId: event.id })}>{adminI18n.t("billing.details")}</Link></td></tr>)}</tbody></table></div> : <p className="px-5 py-6 text-sm text-gray-500">{adminI18n.t("billing.noLedger")}</p>}
        <Pagination pathname="/" params={params} page={events.page} totalPages={events.totalPages} totalItems={events.totalItems} pageParam="billingPage" countKey="pagination.items" resetParams={["billingPage", "eventId"]} />
      </section>
    </div>
  );
}

export function TenantBillingView({ billing, params, billingView, packs, events, selectedPurchase, selectedEvent }: { billing: TenantBilling; params: Record<string, string>; billingView: BillingView; packs: PageResult<RecoveryCreditPurchaseItem> | null; events: PageResult<BillingLedgerItem> | null; selectedPurchase: RecoveryCreditPurchaseItem | null; selectedEvent: BillingLedgerItem | null }) {
  return (
    <div>
      <BillingTabs view={billingView} params={params} />
      {billingView === "overview" ? <Overview billing={billing} /> : null}
      {billingView === "usage" ? <Usage billing={billing} /> : null}
      {billingView === "shopify" ? <Shopify billing={billing} /> : null}
      {billingView === "activity" && packs && events ? <Activity packs={packs} events={events} params={params} /> : null}
      {selectedPurchase ? <RecoveryCreditPurchaseDrawer purchase={selectedPurchase} params={params} returnPath="/" /> : null}
      {selectedEvent ? <BillingEventDrawer event={selectedEvent} params={params} returnPath="/" /> : null}
    </div>
  );
}
