import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { PromotionCampaignCatalog } from "@/components/admin/promotions/promotion-campaign-catalog";
import { PromotionCampaignDrawer } from "@/components/admin/promotions/promotion-campaign-drawer";
import { PromotionCampaignReactivationDrawer } from "@/components/admin/promotions/promotion-campaign-reactivation-drawer";
import { PromotionCampaignFilters } from "@/components/admin/promotions/promotion-campaign-filters";
import { requirePlatformAdminPage } from "@/lib/auth/platform-admin";
import {
  getPromotionCampaignById,
  getPromotionCampaigns,
  getPromotionTargets,
} from "@/lib/admin/promotions/campaigns";
import {
  parsePromotionCataloguePageSize,
  parsePromotionCatalogueScope,
  parsePromotionCatalogueState,
} from "@/lib/admin/promotions/catalogue";
import {
  firstParam,
  paramsToRecord,
  positiveInt,
  type SearchParamRecord,
  withParamUpdates,
} from "@/lib/admin/query";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<SearchParamRecord> };

export default async function PromotionsPage({ searchParams }: PageProps) {
  const principal = await requirePlatformAdminPage();
  if (principal.role !== "SUPER_ADMIN") redirect("/");

  const rawParams = await searchParams;
  const params = paramsToRecord(rawParams);
  const state = parsePromotionCatalogueState(firstParam(rawParams.state));
  const scope = parsePromotionCatalogueScope(firstParam(rawParams.scope));
  const target = firstParam(rawParams.target)?.trim() || undefined;
  const page = positiveInt(rawParams.page);
  const pageSize = parsePromotionCataloguePageSize(
    firstParam(rawParams.pageSize),
  );
  const drawerMode = firstParam(rawParams.drawer);
  const register = drawerMode === "create";
  const reactivate = drawerMode === "reactivate";
  const campaignId =
    firstParam(rawParams.campaignId) ?? firstParam(rawParams.edit);
  const edit = Boolean(campaignId) && !reactivate;

  const campaignsPromise = getPromotionCampaigns({
    state,
    scope,
    target,
    page,
    pageSize,
  });
  const selectedCampaignPromise = campaignId
    ? getPromotionCampaignById(campaignId)
    : Promise.resolve(null);
  const targetsPromise = register || edit
    ? getPromotionTargets()
    : Promise.resolve(null);

  const [campaigns, selectedCampaign, targets] = await Promise.all([
    campaignsPromise,
    selectedCampaignPromise,
    targetsPromise,
  ]);

  const catalogueParams = { ...params };
  delete catalogueParams.drawer;
  delete catalogueParams.campaignId;
  delete catalogueParams.edit;
  if (campaigns.page !== page) catalogueParams.page = String(campaigns.page);
  catalogueParams.pageSize = String(campaigns.pageSize);

  const newCampaignHref = withParamUpdates(
    "/promotions",
    catalogueParams,
    {
      drawer: "create",
      campaignId: null,
    },
  );

  return (
    <AdminShell active="promotions">
      <div className="flex-1 overflow-auto p-4 sm:p-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[var(--brand-900)]">
              Promotion campaigns
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-gray-500">
              Create optional merchant offers. Activation publishes the offer
              but never grants credits.
            </p>
          </div>
          <Link
            href={newCampaignHref}
            className="rounded-md bg-[var(--brand-700)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)]"
          >
            New campaign
          </Link>
        </div>

        <div className="space-y-4">
          <PromotionCampaignFilters
            state={state}
            scope={scope}
            target={target}
            pageSize={campaigns.pageSize}
          />
          <PromotionCampaignCatalog
            campaigns={campaigns}
            params={catalogueParams}
          />
        </div>

        {(register || edit) && targets && (register || selectedCampaign) ? (
          <PromotionCampaignDrawer
            campaign={selectedCampaign ?? undefined}
            plans={targets.plans}
            shops={targets.shops}
            params={params}
            register={register}
          />
        ) : null}
        {reactivate && selectedCampaign ? (
          <PromotionCampaignReactivationDrawer
            campaign={selectedCampaign}
            params={params}
          />
        ) : null}
      </div>
    </AdminShell>
  );
}
