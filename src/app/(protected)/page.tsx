import { AdminShell } from "@/components/admin/admin-shell";
import { SearchInput } from "@/components/admin/search-input";
import { requirePlatformAdminPage } from "@/lib/auth/platform-admin";
import { KpiCard } from "@/components/admin/kpi-card";
import {
  RecoveryDrawer,
  type DrawerTab,
} from "@/components/admin/recovery-drawer";
import { TenantTable } from "@/components/admin/tenant-table";
import {
  getCustomerRecoveries,
  getRecoveryDetail,
  getTenantCustomers,
  getTenantDetail,
  getTenantDirectory,
} from "@/lib/admin/data";
import {
  getBillingLedger,
  getBillingLedgerItem,
  getRecoveryCreditPurchaseDetail,
  getRecoveryCreditPurchases,
  getTenantBilling,
} from "@/lib/admin/billing";
import type {
  BillingLedgerItem,
  CustomerListItem,
  PageResult,
  RecoveryCreditPurchaseItem,
  RecoveryListItem,
} from "@/lib/admin/types";
import { adminI18n } from "@/i18n";
import {
  cleanSearch,
  firstParam,
  paramsToRecord,
  positiveInt,
  withParamUpdates,
  type SearchParamRecord,
} from "@/lib/admin/query";

export const dynamic = "force-dynamic";

const TENANT_PAGE_SIZE = 10;
const CUSTOMER_PAGE_SIZE = 8;
const RECOVERY_PAGE_SIZE = 8;
const MESSAGE_PAGE_SIZE = 20;
const BILLING_PAGE_SIZE = 10;

const billingViews = ["overview", "usage", "shopify", "activity"] as const;
type BillingView = (typeof billingViews)[number];

type PageProps = {
  searchParams: Promise<SearchParamRecord>;
};

export default async function Home({ searchParams }: PageProps) {
  await requirePlatformAdminPage();
  const rawParams = await searchParams;
  const params = paramsToRecord(rawParams);
  const search = cleanSearch(rawParams.q);
  const tenantPage = positiveInt(rawParams.page);
  const tenantId = firstParam(rawParams.tenant) ?? null;
  const rawTab = firstParam(rawParams.tab);
  const tab =
    rawTab === "recovery" || rawTab === "logs" || rawTab === "billing"
      ? rawTab
      : "admin";
  const rawBillingView = firstParam(rawParams.billingView);
  const billingView: BillingView = billingViews.includes(
    rawBillingView as BillingView,
  )
    ? (rawBillingView as BillingView)
    : "overview";
  const customerSearch = cleanSearch(rawParams.customerSearch);
  const customerPage = positiveInt(rawParams.customerPage);
  const customerId = firstParam(rawParams.customerId) ?? null;
  const recoveryPage = positiveInt(rawParams.recoveryPage);
  const recoveryId = firstParam(rawParams.recoveryId) ?? null;
  const messagePage = positiveInt(rawParams.messagePage);
  const rawDrawerTab = firstParam(rawParams.drawerTab);
  const drawerTab: DrawerTab =
    rawDrawerTab === "cart" || rawDrawerTab === "lifecycle"
      ? rawDrawerTab
      : "conversation";
  const saved = firstParam(rawParams.saved) === "1";
  const discountSyncRequested =
    firstParam(rawParams.discountSyncRequested) === "1";
  const purchaseId = firstParam(rawParams.purchaseId) ?? null;
  const eventId = firstParam(rawParams.eventId) ?? null;

  const directory = await getTenantDirectory({
    page: tenantPage,
    pageSize: TENANT_PAGE_SIZE,
    search,
  });


  const selectedTenant = tenantId ? await getTenantDetail(tenantId) : null;
  const tenantBilling =
    selectedTenant && tab === "billing"
      ? await getTenantBilling(
          selectedTenant.id,
          positiveInt(rawParams.billingPage),
          BILLING_PAGE_SIZE,
          false,
        )
      : null;

  let billingPacks: PageResult<RecoveryCreditPurchaseItem> | null = null;
  let billingEvents: PageResult<BillingLedgerItem> | null = null;
  let selectedPurchase: RecoveryCreditPurchaseItem | null = null;
  let selectedEvent: BillingLedgerItem | null = null;

  if (selectedTenant && tab === "billing" && billingView === "activity") {
    [billingPacks, billingEvents] = await Promise.all([
      getRecoveryCreditPurchases({
        shopId: selectedTenant.id,
        page: positiveInt(rawParams.packPage),
        pageSize: BILLING_PAGE_SIZE,
      }),
      getBillingLedger({
        shopId: selectedTenant.id,
        page: positiveInt(rawParams.billingPage),
        pageSize: BILLING_PAGE_SIZE,
      }),
    ]);
    [selectedPurchase, selectedEvent] = await Promise.all([
      purchaseId
        ? getRecoveryCreditPurchaseDetail(purchaseId, selectedTenant.id)
        : Promise.resolve(null),
      eventId
        ? getBillingLedgerItem(eventId, selectedTenant.id)
        : Promise.resolve(null),
    ]);
  }

  let customers: PageResult<CustomerListItem> | null = null;
  let selectedCustomer: CustomerListItem | null = null;
  let recoveries: PageResult<RecoveryListItem> | null = null;

  if (selectedTenant && tab === "logs") {
    customers = await getTenantCustomers({
      shopId: selectedTenant.id,
      page: customerPage,
      pageSize: CUSTOMER_PAGE_SIZE,
      search: customerSearch,
    });

    if (customerId) {
      const recoveryData = await getCustomerRecoveries({
        shopId: selectedTenant.id,
        customerId,
        page: recoveryPage,
        pageSize: RECOVERY_PAGE_SIZE,
      });
      selectedCustomer = recoveryData.customer;
      recoveries = recoveryData.recoveries;
    }
  }

  const recovery =
    selectedTenant && recoveryId
      ? await getRecoveryDetail({
          shopId: selectedTenant.id,
          recoveryId,
          messagePage,
          messagePageSize: MESSAGE_PAGE_SIZE,
        })
      : null;

  const returnTo = withParamUpdates("/", params, {
    saved: null,
    discountSyncRequested: null,
  });

  return (
    <AdminShell
      active="tenants"
      header={
        <div className="w-full max-w-2xl">
          <SearchInput defaultValue={search} />
        </div>
      }
    >
      <div className="flex-1 overflow-auto p-4 sm:p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[var(--brand-900)]">
            {adminI18n.t("nav.tenantDirectory")}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {adminI18n.t("tenant.directoryDescription")}
          </p>
        </div>

        <section
          className="mb-8"
          aria-label={adminI18n.t("tenant.platformSummary")}
        >
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                {adminI18n.t("tenant.platformSummary")}
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                {adminI18n.t("tenant.platformSummaryHelp")}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            <KpiCard
              label={adminI18n.t("tenant.activeTenants")}
              value={adminI18n.formatNumber(directory.kpis.activeTenants)}
            />
            <KpiCard
              label={adminI18n.t("tenant.activeRecoveries")}
              value={adminI18n.formatNumber(directory.kpis.activeRecoveries)}
              accent
            />
            <KpiCard
              label={adminI18n.t("tenant.pendingRecoveries")}
              value={adminI18n.formatNumber(directory.kpis.pendingRecoveries)}
            />
            <KpiCard
              label={adminI18n.t("tenant.recoveredCheckouts")}
              value={adminI18n.formatNumber(directory.kpis.recoveredCheckouts)}
            />
            <KpiCard
              label={adminI18n.t("tenant.recoveryConversations")}
              value={adminI18n.formatNumber(directory.kpis.recoveryConversations)}
            />
            <KpiCard
              label={adminI18n.t("tenant.recoveryMessages")}
              value={adminI18n.formatNumber(directory.kpis.recoveryMessages)}
            />
          </div>
        </section>

        <TenantTable
          tenants={directory.tenants}
          selectedTenant={selectedTenant}
          tab={tab}
          customers={customers}
          customerSearch={customerSearch}
          selectedCustomer={selectedCustomer}
          recoveries={recoveries}
          params={params}
          returnTo={returnTo}
          saved={saved}
          discountSyncRequested={discountSyncRequested}
          billing={tenantBilling}
          billingView={billingView}
          billingPacks={billingPacks}
          billingEvents={billingEvents}
          selectedPurchase={selectedPurchase}
          selectedEvent={selectedEvent}
        />
      </div>

      {recovery ? (
        <RecoveryDrawer recovery={recovery} tab={drawerTab} params={params} />
      ) : null}
    </AdminShell>
  );
}
