import { tenantName } from "@/lib/admin/format";
import { withParamUpdates } from "@/lib/admin/query";
import type {
  CustomerListItem,
  PageResult,
  RecoveryListItem,
  TenantDetail,
  TenantBilling,
  TenantListItem,
} from "@/lib/admin/types";
import { EmptyState } from "./empty-state";
import { translateAdminText } from "@/i18n";
import { adminI18n } from "@/i18n";
import { Pagination } from "./pagination";
import { TenantDetailPanel } from "./tenant-detail-panel";
import type { HumanMessagingDashboard } from "@/lib/admin/human-messaging-contract";
import { TenantRow } from "./tenant-row";
import type { LiveShopPolicyView, LiveShopPolicyHistoryEntry } from "@/lib/admin/commerce-model-shop-policy";

export function TenantTable({
  tenants,
  selectedTenant,
  humanMessaging,
  tab,
  canEditCommercePolicy,
  shopPolicyDashboard,
  shopPolicyScope,
  shopPolicyHistoryPage,
  customers,
  customerSearch,
  selectedCustomer,
  recoveries,
  params,
  returnTo,
  saved,
  discountSyncRequested,
  billing,
  billingView,
  billingPacks,
  billingEvents,
  selectedPurchase,
  selectedEvent,
}: {
  tenants: PageResult<TenantListItem>;
  selectedTenant: TenantDetail | null;
  humanMessaging: HumanMessagingDashboard | null;
  tab: "admin" | "recovery" | "logs" | "billing" | "commerce";
  canEditCommercePolicy: boolean;
  shopPolicyDashboard: { policy: LiveShopPolicyView; history: LiveShopPolicyHistoryEntry[]; hasMore: boolean } | null;
  shopPolicyScope: string | null;
  shopPolicyHistoryPage: number;
  customers: PageResult<CustomerListItem> | null;
  customerSearch: string;
  selectedCustomer: CustomerListItem | null;
  recoveries: PageResult<RecoveryListItem> | null;
  params: Record<string, string>;
  returnTo: string;
  saved?: boolean;
  discountSyncRequested?: boolean;
  billing: TenantBilling | null;
  billingView: "overview" | "usage" | "shopify" | "activity";
  billingPacks: import("@/lib/admin/types").PageResult<import("@/lib/admin/types").RecoveryCreditPurchaseItem> | null;
  billingEvents: import("@/lib/admin/types").PageResult<import("@/lib/admin/types").BillingLedgerItem> | null;
  selectedPurchase: import("@/lib/admin/types").RecoveryCreditPurchaseItem | null;
  selectedEvent: import("@/lib/admin/types").BillingLedgerItem | null;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      {tenants.items.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase">
                  {adminI18n.t("tenant.details")}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase">
                  {adminI18n.t("tenant.status")}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase">
                  {adminI18n.t("tenant.billingPlan")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {tenants.items.map((tenant) => {
                const name = tenantName(tenant.brandName, tenant.domain);
                const selected = selectedTenant?.id === tenant.id;
                const href = selected
                  ? withParamUpdates("/", params, {
                      tenant: null,
                      tab: null,
                      customerSearch: null,
                      customerPage: null,
                      customerId: null,
                      recoveryPage: null,
                      recoveryId: null,
                      drawerTab: null,
                      messagePage: null,
                      billingView: null,
                      billingPage: null,
                      packPage: null,
                      purchaseId: null,
                      eventId: null,
                      saved: null,
                      humanHistoryPage: null,
                      humanIncidentPage: null,
                      commerceShopHistoryPage: null,
                      discountSyncRequested: null,
                    })
                  : withParamUpdates("/", params, {
                      tenant: tenant.id,
                      tab: "admin",
                      customerSearch: null,
                      customerPage: null,
                      customerId: null,
                      recoveryPage: null,
                      recoveryId: null,
                      drawerTab: null,
                      messagePage: null,
                      billingView: null,
                      billingPage: null,
                      packPage: null,
                      purchaseId: null,
                      eventId: null,
                      saved: null,
                      humanHistoryPage: null,
                      humanIncidentPage: null,
                      commerceShopHistoryPage: null,
                      discountSyncRequested: null,
                    });

                return (
                  <TenantRow
                    key={tenant.id}
                    tenant={tenant}
                    name={name}
                    href={href}
                    selected={selected}
                    detail={
                      selected && selectedTenant ? (
                        <TenantDetailPanel
                          tenant={selectedTenant}
                          humanMessaging={humanMessaging}
                          tab={tab}
                          canEditCommercePolicy={canEditCommercePolicy}
                          shopPolicyDashboard={shopPolicyDashboard}
                          shopPolicyScope={shopPolicyScope}
                          shopPolicyHistoryPage={shopPolicyHistoryPage}
                          customers={customers}
                          customerSearch={customerSearch}
                          selectedCustomer={selectedCustomer}
                          recoveries={recoveries}
                          params={params}
                          returnTo={returnTo}
                          saved={saved}
                          discountSyncRequested={discountSyncRequested}
                          billing={billing}
                          billingView={billingView}
                          billingPacks={billingPacks}
                          billingEvents={billingEvents}
                          selectedPurchase={selectedPurchase}
                          selectedEvent={selectedEvent}
                        />
                      ) : null
                    }
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-6">
          <EmptyState title="empty.noTenants">
            {translateAdminText("empty.noShopMatched")}
          </EmptyState>
        </div>
      )}
      <Pagination
        pathname="/"
        params={params}
        page={tenants.page}
        totalPages={tenants.totalPages}
        totalItems={tenants.totalItems}
        pageParam="page"
        countKey="pagination.tenants"
        resetParams={[
          "tenant",
          "tab",
          "commerceShopHistoryPage",
          "customerSearch",
          "customerPage",
          "customerId",
          "recoveryPage",
          "recoveryId",
          "drawerTab",
          "messagePage",
          "saved",
          "humanHistoryPage",
          "humanIncidentPage",
          "discountSyncRequested",
        ]}
      />
    </div>
  );
}
