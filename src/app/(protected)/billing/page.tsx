import { AdminShell } from "@/components/admin/admin-shell";
import { BillingPlanCatalog } from "@/components/admin/billing-plan-catalog";
import { BillingTabs, type BillingView } from "@/components/admin/billing-tabs";
import {
  BillingEventDrawer,
  BillingPlanDrawer,
  RecoveryCreditPurchaseDrawer,
} from "@/components/admin/billing-drawers";
import { BillingRecoveryPacks, parseRecoveryPackStatus } from "@/components/admin/billing-recovery-packs";
import { requirePlatformAdminPage } from "@/lib/auth/platform-admin";
import { getBillingPlanById, getBillingPlans } from "@/lib/admin/billing-plan";
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
import { PlatformBillingControls } from "@/components/admin/billing-controls";
import { getPlatformBillingPolicy } from "@/lib/admin/billing-controls";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<SearchParamRecord> };

export default async function BillingPage({ searchParams }: PageProps) {
  await requirePlatformAdminPage();
  const rawParams = await searchParams;
  const params = paramsToRecord(rawParams);
  const allowedViews: BillingView[] = ["overview", "plans", "packs", "events", "controls"];
  const rawView = firstParam(rawParams.view) as BillingView | undefined;
  const view = allowedViews.includes(rawView ?? "overview") ? rawView ?? "overview" : "overview";
  const rawState = firstParam(rawParams.state);
  const state = Object.values(ShopifyReportState).includes(
    rawState as ShopifyReportState,
  )
    ? (rawState as ShopifyReportState)
    : undefined;
  const plans = view === "plans" ? await getBillingPlans() : null;
  const selectedPlan = view === "plans" && firstParam(rawParams.planId)
    ? await getBillingPlanById(firstParam(rawParams.planId) as string)
    : null;
  const policy = view === "controls" ? await getPlatformBillingPolicy() : null;
  const overview = view === "overview" ? await getBillingOverview() : null;
  const packs = view === "packs"
    ? await getRecoveryCreditPurchases({
        page: positiveInt(rawParams.packPage),
        pageSize: 20,
        status: parseRecoveryPackStatus(firstParam(rawParams.packStatus)),
      })
    : null;
  const selectedPurchase = view === "packs" && firstParam(rawParams.purchaseId)
    ? await getRecoveryCreditPurchaseDetail(firstParam(rawParams.purchaseId) as string)
    : null;
  const ledger = view === "events"
    ? await getBillingLedger({
        page: positiveInt(rawParams.eventPage),
        pageSize: 20,
        state,
        shopId: firstParam(rawParams.shopId),
        from: firstParam(rawParams.from),
        to: firstParam(rawParams.to),
      })
    : null;
  const selectedEvent = view === "events" && firstParam(rawParams.eventId)
    ? await getBillingLedgerItem(firstParam(rawParams.eventId) as string)
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
        {view === "overview" && overview ? <BillingOverviewCards overview={overview} /> : null}
        {view === "plans" && plans ? <BillingPlanCatalog plans={plans} /> : null}
        {view === "packs" && packs ? <BillingRecoveryPacks purchases={packs} params={params} /> : null}
        {view === "events" && ledger ? <BillingLedger ledger={ledger} params={params} /> : null}
        {view === "controls" && policy ? <PlatformBillingControls policy={policy} /> : null}
        {view === "plans" && (params.drawer === "register-plan" || selectedPlan) ? (
          <BillingPlanDrawer plan={selectedPlan ?? undefined} params={params} register={params.drawer === "register-plan"} />
        ) : null}
        {view === "packs" && selectedPurchase ? <RecoveryCreditPurchaseDrawer purchase={selectedPurchase} params={params} /> : null}
        {view === "events" && selectedEvent ? <BillingEventDrawer event={selectedEvent} params={params} /> : null}
      </div>
    </AdminShell>
  );
}
