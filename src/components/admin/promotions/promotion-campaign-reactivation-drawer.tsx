import { AdminDetailDrawer } from "@/components/admin/admin-detail-drawer";
import { PromotionCampaignReactivationForm } from "@/components/admin/promotions/promotion-campaign-reactivation";
import type { PromotionCampaignRow } from "@/lib/admin/promotions/campaigns";
import { withParamUpdates } from "@/lib/admin/query";

export function PromotionCampaignReactivationDrawer({
  campaign,
  params,
}: {
  campaign: PromotionCampaignRow;
  params: Record<string, string>;
}) {
  const closeHref = withParamUpdates("/promotions", params, {
    drawer: null,
    campaignId: null,
    edit: null,
  });

  return (
    <AdminDetailDrawer
      title={
        campaign.state === "EXPIRED"
          ? "Reactivate expired campaign"
          : "Reactivate promotion campaign"
      }
      closeHref={closeHref}
    >
      <PromotionCampaignReactivationForm
        campaign={campaign}
        returnTo={closeHref}
        requiresNewExpiry={campaign.expiresAt.getTime() <= Date.now()}
      />
    </AdminDetailDrawer>
  );
}
