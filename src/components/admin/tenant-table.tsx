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
import { TenantRow } from "./tenant-row";

export function TenantTable({
  tenants,
  selectedTenant,
  tab,
  customers,
  customerSearch,
  selectedCustomer,
  recoveries,
  params,
  returnTo,
  saved,
  billing,
}: {
  tenants: PageResult<TenantListItem>;
  selectedTenant: TenantDetail | null;
  tab: "admin" | "logs" | "billing";
  customers: PageResult<CustomerListItem> | null;
  customerSearch: string;
  selectedCustomer: CustomerListItem | null;
  recoveries: PageResult<RecoveryListItem> | null;
  params: Record<string, string>;
  returnTo: string;
  saved?: boolean;
  billing: TenantBilling | null;
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
                      saved: null,
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
                      saved: null,
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
                          tab={tab}
                          customers={customers}
                          customerSearch={customerSearch}
                          selectedCustomer={selectedCustomer}
                          recoveries={recoveries}
                          params={params}
                          returnTo={returnTo}
                          saved={saved}
                          billing={billing}
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
          "customerSearch",
          "customerPage",
          "customerId",
          "recoveryPage",
          "recoveryId",
          "drawerTab",
          "messagePage",
          "saved",
        ]}
      />
    </div>
  );
}
