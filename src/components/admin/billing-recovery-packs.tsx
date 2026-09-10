import Link from "next/link";
import type { RecoveryCreditPurchaseStatus } from "@prisma/client";
import { adminI18n } from "@/i18n";
import type { PageResult, RecoveryCreditPurchaseItem } from "@/lib/admin/types";
import { buildUrl } from "@/lib/admin/query";
import { Pagination } from "./pagination";

const statuses = ["PENDING_BILLING", "ACTIVE", "NEEDS_ATTENTION", "CANCELLED"] as const;

export function BillingRecoveryPacks({
  purchases,
  params,
}: {
  purchases: PageResult<RecoveryCreditPurchaseItem>;
  params: Record<string, string>;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-5 py-4">
        <h2 className="text-lg font-semibold text-gray-950">{adminI18n.t("billing.tab.recoveryPacks")}</h2>
        <p className="mt-1 text-sm text-gray-500">{adminI18n.t("billing.recoveryPacksDescription")}</p>
      </div>
      <form method="get" className="flex flex-wrap items-end gap-3 border-b border-gray-200 bg-gray-50 px-5 py-4">
        <input type="hidden" name="view" value="packs" />
        <label className="text-xs font-semibold text-gray-600">
          {adminI18n.t("billing.status")}
          <select name="packStatus" defaultValue={params.packStatus ?? ""} className="mt-1 block rounded-md border border-gray-300 bg-white p-2 text-sm font-normal">
            <option value="">{adminI18n.t("billing.allStatuses")}</option>
            {statuses.map((status) => <option key={status} value={status}>{adminI18n.t(`billing.packStatus.${status}`)}</option>)}
          </select>
        </label>
        <button type="submit" className="rounded-md bg-[var(--brand-700)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)]">{adminI18n.t("billing.applyFilters")}</button>
      </form>
      {purchases.items.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50"><tr>{[
              "billing.shop", "billing.status", "billing.creditsGranted", "billing.createdAt", "billing.activatedAt", "billing.viewDetails",
            ].map((key) => <th key={key} className="px-5 py-3 text-left text-xs font-semibold tracking-wide text-gray-500 uppercase">{adminI18n.t(key)}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-200">
              {purchases.items.map((purchase) => (
                <tr key={purchase.id}>
                  <td className="px-5 py-3 text-sm font-medium text-gray-900">{purchase.shop.domain}</td>
                  <td className="px-5 py-3 text-sm text-gray-600">{adminI18n.t(`billing.packStatus.${purchase.status}`)}</td>
                  <td className="px-5 py-3 text-sm text-gray-600">{adminI18n.formatNumber(purchase.creditsGranted)}</td>
                  <td className="px-5 py-3 text-sm text-gray-600">{adminI18n.formatDateTime(purchase.createdAt)}</td>
                  <td className="px-5 py-3 text-sm text-gray-600">{purchase.activatedAt ? adminI18n.formatDateTime(purchase.activatedAt) : adminI18n.t("empty.notRecorded")}</td>
                  <td className="px-5 py-3 text-sm"><Link className="font-semibold text-[var(--brand-700)] hover:underline" href={buildUrl("/billing", { ...params, view: "packs", purchaseId: purchase.id })}>{adminI18n.t("billing.viewDetails")}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="px-5 py-8 text-sm text-gray-500">{adminI18n.t("billing.noRecoveryPacks")}</p>}
      <Pagination pathname="/billing" params={params} page={purchases.page} totalPages={purchases.totalPages} totalItems={purchases.totalItems} pageParam="packPage" countKey="pagination.items" resetParams={["packPage"]} />
    </section>
  );
}

export function parseRecoveryPackStatus(value: string | undefined): RecoveryCreditPurchaseStatus | undefined {
  return statuses.includes(value as (typeof statuses)[number]) ? value as RecoveryCreditPurchaseStatus : undefined;
}
