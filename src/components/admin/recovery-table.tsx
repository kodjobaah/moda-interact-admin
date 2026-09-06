import Link from "next/link";
import { customerName, formatDateTime, formatMoney } from "@/lib/admin/format";
import { withParamUpdates } from "@/lib/admin/query";
import type {
  CustomerListItem,
  PageResult,
  RecoveryListItem,
} from "@/lib/admin/types";
import { EmptyState } from "./empty-state";
import { Icon } from "./icons";
import { Pagination } from "./pagination";
import { StatusBadge } from "./status-badge";
import { adminI18n } from "@/i18n";

export function RecoveryTable({
  customer,
  recoveries,
  params,
}: {
  customer: CustomerListItem;
  recoveries: PageResult<RecoveryListItem>;
  params: Record<string, string>;
}) {
  const backHref = withParamUpdates("/", params, {
    customerId: null,
    recoveryPage: null,
    recoveryId: null,
    drawerTab: null,
    messagePage: null,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 p-4">
        <div className="flex items-center">
          <Link
            href={backHref}
            className="flex items-center text-sm font-medium text-gray-600 hover:text-[var(--brand-600)]"
          >
            <Icon name="arrow-left" className="mr-2 h-4 w-4" /> {adminI18n.t("recovery.backToCustomers")}
          </Link>
          <span className="ml-4 border-l border-gray-300 pl-4 text-sm font-bold text-gray-900">
            {customerName(
              customer.firstName,
              customer.lastName,
              customer.email,
            )}
          </span>
        </div>
        <span className="text-xs text-gray-500">{adminI18n.t("recovery.list")}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {recoveries.items.length ? (
          <table className="min-w-full divide-y divide-gray-100">
            <thead>
              <tr>
                <th className="pb-2 text-left text-xs font-medium text-gray-500">
                  {adminI18n.t("recovery.detectedAt")}
                </th>
                <th className="pb-2 text-left text-xs font-medium text-gray-500">
                  {adminI18n.t("recovery.cartValue")}
                </th>
                <th className="pb-2 text-left text-xs font-medium text-gray-500">
                  {adminI18n.t("recovery.status")}
                </th>
                <th className="pb-2 text-left text-xs font-medium text-gray-500">
                  {adminI18n.t("recovery.outcome")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recoveries.items.map((recovery) => {
                const href = withParamUpdates("/", params, {
                  recoveryId: recovery.id,
                  drawerTab: "conversation",
                  messagePage: 1,
                });
                return (
                  <tr
                    key={recovery.id}
                    className="transition-colors hover:bg-gray-50"
                  >
                    <td className="py-3 pr-3 text-sm font-medium text-gray-900">
                      <Link href={href} className="block">
                        {formatDateTime(recovery.detectedAt)}
                      </Link>
                    </td>
                    <td className="py-3 pr-3 text-sm text-gray-500">
                      <Link href={href} className="block">
                        {formatMoney(
                          recovery.totalPrice,
                          recovery.currency,
                        )}
                      </Link>
                    </td>
                    <td className="py-3 pr-3">
                      <Link href={href} className="block">
                        <StatusBadge value={recovery.status} compact />
                      </Link>
                    </td>
                    <td className="py-3">
                      <Link href={href} className="block">
                        <StatusBadge value={recovery.outcome} compact />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <EmptyState title="empty.noRecoveries">
            {adminI18n.t("empty.noRecoveryRecords")}
          </EmptyState>
        )}
      </div>
      <Pagination
        pathname="/"
        params={params}
        page={recoveries.page}
        totalPages={recoveries.totalPages}
        totalItems={recoveries.totalItems}
        pageParam="recoveryPage"
        countKey="pagination.recoveries"
        resetParams={["recoveryId", "drawerTab", "messagePage"]}
      />
    </div>
  );
}
