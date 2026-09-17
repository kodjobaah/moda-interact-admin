import type { PromotionTargetScope } from "@prisma/client";
import type { PromotionCatalogueState } from "@/lib/admin/promotions/catalogue";

export function PromotionCampaignFilters({
  state,
  scope,
  target,
  pageSize,
}: {
  state: "ALL" | PromotionCatalogueState;
  scope: "ALL" | PromotionTargetScope;
  target?: string;
  pageSize: number;
}) {
  return (
    <form
      className="grid gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-4"
      method="get"
    >
      <input type="hidden" name="pageSize" value={pageSize} />
      <label className="text-xs font-semibold text-gray-600">
        State
        <select
          name="state"
          defaultValue={state}
          className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm"
        >
          <option value="ALL">All</option>
          <option value="DRAFT">Draft</option>
          <option value="SCHEDULED">Scheduled</option>
          <option value="RUNNING">Running</option>
          <option value="EXPIRED">Expired</option>
          <option value="CLOSED">Closed</option>
        </select>
      </label>
      <label className="text-xs font-semibold text-gray-600">
        Scope
        <select
          name="scope"
          defaultValue={scope}
          className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm"
        >
          <option value="ALL">All</option>
          <option value="GLOBAL">Global</option>
          <option value="PLAN">Plan</option>
          <option value="SHOP">Shop</option>
        </select>
      </label>
      <label className="text-xs font-semibold text-gray-600">
        Target or name
        <input
          name="target"
          defaultValue={target}
          className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm"
          maxLength={255}
        />
      </label>
      <button
        type="submit"
        className="self-end rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
      >
        Filter
      </button>
    </form>
  );
}
