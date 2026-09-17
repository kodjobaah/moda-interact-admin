import { Pagination } from "@/components/admin/pagination";
import { PromotionCampaignActions } from "@/components/admin/promotions/promotion-campaign-actions";
import type { PageResult } from "@/lib/admin/types";
import type { PromotionCampaignSummary } from "@/lib/admin/promotions/campaigns";
import { PROMOTION_CATALOGUE_PAGE_SIZES } from "@/lib/admin/promotions/catalogue";

export function PromotionCampaignCatalog({
  campaigns,
  params,
}: {
  campaigns: PageResult<PromotionCampaignSummary>;
  params: Record<string, string>;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-950">
            Promotion campaigns
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Browse and manage campaign lifecycle and usage.
          </p>
        </div>
        <form method="get" className="flex items-end gap-2">
          {params.state ? (
            <input type="hidden" name="state" value={params.state} />
          ) : null}
          {params.scope ? (
            <input type="hidden" name="scope" value={params.scope} />
          ) : null}
          {params.target ? (
            <input type="hidden" name="target" value={params.target} />
          ) : null}
          <label className="text-xs font-semibold text-gray-600">
            Campaigns per page
            <select
              name="pageSize"
              defaultValue={campaigns.pageSize}
              className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              {PROMOTION_CATALOGUE_PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Apply
          </button>
        </form>
      </div>

      <div className="max-h-[calc(100vh-20rem)] min-h-64 overflow-y-auto">
        <div className="space-y-3 p-4 pb-2">
          {campaigns.items.map((campaign) => (
          <article
            key={campaign.id}
            className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-gray-950">{campaign.name}</h3>
                <p className="mt-1 text-xs text-gray-500">
                  {campaign.scope} · {campaign.quantity} recovery credits
                </p>
              </div>
              <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
                {campaign.state} · {campaign.status}
              </span>
            </div>
            <p className="mt-3 text-sm text-gray-600">
              {campaign.scope === "GLOBAL"
                ? "All eligible merchants"
                : (campaign.targetPlanName ?? campaign.targetShopDomain)}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {campaign.startsAt.toLocaleString()} to{" "}
              {campaign.expiresAt.toLocaleString()} · created{" "}
              {campaign.createdAt.toLocaleString()} by {campaign.creatorName}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Last change: {campaign.lastLifecycleChange?.kind ?? "none"}{" "}
              {campaign.lastLifecycleChange?.createdAt.toLocaleString() ?? ""}
            </p>
            <p className="mt-1 text-xs font-semibold text-gray-600">
              Translations: {campaign.translationCount} / 20 languages complete
            </p>
            <PromotionCampaignActions campaign={campaign} params={params} />
          </article>
        ))}
          {campaigns.items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-300 p-8 text-sm text-gray-600">
              No promotion campaigns match these filters.
            </p>
          ) : null}
        </div>

        <div className="sticky bottom-0 z-10 bg-white shadow-[0_-4px_12px_rgba(15,23,42,0.06)]">
          <Pagination
            pathname="/promotions"
            params={params}
            page={campaigns.page}
            totalPages={campaigns.totalPages}
            totalItems={campaigns.totalItems}
            pageParam="page"
            resetParams={["drawer", "campaignId", "edit"]}
          />
        </div>
      </div>
    </section>
  );
}
