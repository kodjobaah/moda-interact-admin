import { AdminShell } from "@/components/admin/admin-shell";
import { MerchantPricingPlanCatalog } from "@/components/admin/merchant/merchant-pricing-plan-catalog";
import { BillingTabs, type BillingView } from "@/components/admin/billing-tabs";
import { BillingUnmappedSubscriptions, UnmappedSubscriptionDrawer } from "@/components/admin/billing-unmapped-subscriptions";
import { BillingReconciliationConsoleDebug } from "@/components/admin/billing-reconciliation-console-debug";
import {
  BillingEventDrawer,
  MerchantPricingPlanDrawer,
  RecoveryCreditPurchaseDrawer,
} from "@/components/admin/billing-drawers";
import {
  BillingRecoveryPacks,
  parseRecoveryPackStatus,
} from "@/components/admin/billing-recovery-packs";
import { requirePlatformAdminPage } from "@/lib/auth/platform-admin";
import {
  getMerchantPricingCatalogueContext,
  getMerchantPricingPlanById,
  getMerchantPricingPlans,
} from "@/lib/admin/merchant/pricing-plan";
import {
  getBillingLedger,
  getBillingLedgerItem,
  getBillingOverview,
  getRecoveryCreditPurchaseDetail,
  getRecoveryCreditPurchases,
} from "@/lib/admin/billing";
import { adminI18n } from "@/i18n";
import {
  BillingLedger,
  BillingOverviewCards,
} from "@/components/admin/billing-overview";
import {
  firstParam,
  paramsToRecord,
  positiveInt,
  type SearchParamRecord,
} from "@/lib/admin/query";
import { ShopifyReportState } from "@prisma/client";
import { getPlatformBillingPolicy } from "@/lib/admin/billing-controls";
import { getFeatureCatalogue } from "@/lib/admin/feature-catalogue";
import { FeatureCatalogue } from "@/components/admin/feature-catalogue";
import { BillingPlansNavigation, type BillingPlansSection } from "@/components/admin/billing-plans-navigation";
import { redirect } from "next/navigation";
import { getUnmappedSubscriptionDetail, getUnmappedSubscriptions } from "@/lib/admin/unmapped-subscriptions";
import {
  RecoveryCreditRefundDrawer,
  RecoveryCreditRefundQueue,
  parseRecoveryCreditRefundStatus,
} from "@/components/admin/recovery-credit-refunds";
import {
  getRecoveryCreditRefundDetail,
  getRecoveryCreditRefunds,
} from "@/lib/admin/recovery-credit-refunds";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<SearchParamRecord> };

export default async function BillingPage({ searchParams }: PageProps) {
  const principal = await requirePlatformAdminPage();
  const rawParams = await searchParams;
  const params = paramsToRecord(rawParams);
  const rawRequestedView = firstParam(rawParams.view);
  if (rawRequestedView === "controls") {
    redirect("/system-controls/platform-policy");
  }

  const allowedViews: BillingView[] = [
    "overview",
    "plans",
    "packs",
    "refunds",
    "events",
    "unmapped",
  ];
  const rawView = rawRequestedView as BillingView | undefined;
  const view = allowedViews.includes(rawView ?? "overview")
    ? (rawView ?? "overview")
    : "overview";
  const pricingError = firstParam(rawParams.pricingError);
  const rawPlanSection = firstParam(rawParams.section);
  const planSection: BillingPlansSection =
    rawPlanSection === "features" ? "features" : "pricing";
  const reconciliationDebugSubscriptionId = firstParam(
    rawParams.reconciliationDebugSubscriptionId,
  );
  const rawState = firstParam(rawParams.state);
  const state = Object.values(ShopifyReportState).includes(
    rawState as ShopifyReportState,
  )
    ? (rawState as ShopifyReportState)
    : undefined;
  const plans =
    view === "plans" && planSection === "pricing"
      ? await getMerchantPricingPlans({
          page: positiveInt(rawParams.planPage),
          pageSize: positiveInt(rawParams.planPageSize, 5),
        })
      : null;
  const selectedPlan =
    view === "plans" &&
    planSection === "pricing" &&
    firstParam(rawParams.planId)
      ? await getMerchantPricingPlanById(firstParam(rawParams.planId) as string)
      : null;
  const planDrawerOpen =
    view === "plans" &&
    planSection === "pricing" &&
    (params.drawer === "register-plan" || Boolean(selectedPlan));
  const features =
    view === "plans" && (planSection === "features" || planDrawerOpen)
      ? await getFeatureCatalogue()
      : null;
  const plansPolicy = planDrawerOpen ? await getPlatformBillingPolicy() : null;
  const cataloguePlans = planDrawerOpen
    ? await getMerchantPricingCatalogueContext()
    : null;
  const overview = view === "overview" ? await getBillingOverview() : null;
  const packs =
    view === "packs"
      ? await getRecoveryCreditPurchases({
          page: positiveInt(rawParams.packPage),
          pageSize: 20,
          status: parseRecoveryPackStatus(firstParam(rawParams.packStatus)),
        })
      : null;
  const selectedPurchase =
    view === "packs" && firstParam(rawParams.purchaseId)
      ? await getRecoveryCreditPurchaseDetail(
          firstParam(rawParams.purchaseId) as string,
        )
      : null;
  const refunds =
    view === "refunds"
      ? await getRecoveryCreditRefunds({
          page: positiveInt(rawParams.refundPage),
          pageSize: 20,
          status: parseRecoveryCreditRefundStatus(
            firstParam(rawParams.refundStatus),
          ),
        })
      : null;
  const selectedRefund =
    view === "refunds" && firstParam(rawParams.refundId)
      ? await getRecoveryCreditRefundDetail(
          firstParam(rawParams.refundId) as string,
        )
      : null;
  const ledger =
    view === "events"
      ? await getBillingLedger({
          page: positiveInt(rawParams.eventPage),
          pageSize: 20,
          state,
          shopId: firstParam(rawParams.shopId),
          from: firstParam(rawParams.from),
          to: firstParam(rawParams.to),
        })
      : null;
  const selectedEvent =
    view === "events" && firstParam(rawParams.eventId)
      ? await getBillingLedgerItem(firstParam(rawParams.eventId) as string)
      : null;
  const unmapped =
    view === "unmapped"
      ? await getUnmappedSubscriptions({
          page: positiveInt(rawParams.unmappedPage),
          pageSize: 20,
        })
      : null;
  const selectedUnmapped =
    view === "unmapped" && firstParam(rawParams.subscriptionId)
      ? await getUnmappedSubscriptionDetail(
          firstParam(rawParams.subscriptionId) as string,
        )
      : null;

  return (
    <AdminShell active="billing">
      <div className="flex-1 overflow-auto p-4 sm:p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[var(--brand-900)]">
            {adminI18n.t("billing.title")}
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-500">
            {adminI18n.t("billing.description")}
          </p>
        </div>
        <BillingTabs current={view} params={params} />
        {view === "plans" && pricingError ? (
          <div
            role="alert"
            className="mb-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            <p className="font-semibold">Plan could not be activated</p>
            <p className="mt-1">{pricingError}</p>
          </div>
        ) : null}
        {view === "overview" && overview ? (
          <BillingOverviewCards overview={overview} />
        ) : null}
        {view === "plans" ? (
          <>
            <BillingPlansNavigation current={planSection} params={params} />
            {planSection === "pricing" && plans ? (
              <MerchantPricingPlanCatalog plans={plans} params={params} />
            ) : null}
            {planSection === "features" ? (
              <FeatureCatalogue features={features ?? []} params={params} />
            ) : null}
          </>
        ) : null}
        {view === "packs" && packs ? (
          <BillingRecoveryPacks purchases={packs} params={params} />
        ) : null}
        {view === "events" && ledger ? (
          <BillingLedger ledger={ledger} params={params} />
        ) : null}
        {view === "unmapped" && firstParam(rawParams.mappingResolved) ? (
          <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            Operational mapping repaired. Reconciliation has been requested; Shopify remains authoritative until the subscription is re-projected.
          </div>
        ) : null}
        {view === "unmapped" &&
        firstParam(rawParams.mappingResolved) &&
        reconciliationDebugSubscriptionId ? (
          <BillingReconciliationConsoleDebug
            subscriptionId={reconciliationDebugSubscriptionId}
          />
        ) : null}
        {view === "unmapped" && unmapped ? (
          <BillingUnmappedSubscriptions subscriptions={unmapped} params={params} />
        ) : null}
        {view === "plans" &&
        planSection === "pricing" &&
        (params.drawer === "register-plan" || selectedPlan) ? (
          <MerchantPricingPlanDrawer
            plan={selectedPlan ?? undefined}
            cataloguePlans={cataloguePlans ?? []}
            featureCatalogue={features ?? []}
            minimumUpgradePremiumBps={
              plansPolicy?.minimumUpgradePremiumBps ?? 2000
            }
            params={params}
            register={params.drawer === "register-plan"}
          />
        ) : null}
        {view === "packs" && selectedPurchase ? (
          <RecoveryCreditPurchaseDrawer
            purchase={selectedPurchase}
            params={params}
          />
        ) : null}
        {view === "refunds" && refunds ? (
          <RecoveryCreditRefundQueue refunds={refunds} params={params} />
        ) : null}
        {view === "refunds" && selectedRefund ? (
          <RecoveryCreditRefundDrawer
            refund={selectedRefund}
            params={params}
            canSettle={principal.role === "SUPER_ADMIN"}
          />
        ) : null}
        {view === "events" && selectedEvent ? (
          <BillingEventDrawer event={selectedEvent} params={params} />
        ) : null}
        {view === "unmapped" && selectedUnmapped ? (
          <UnmappedSubscriptionDrawer detail={selectedUnmapped} params={params} />
        ) : null}
      </div>
    </AdminShell>
  );
}
