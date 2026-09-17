import { AdminDetailDrawer } from "@/components/admin/admin-detail-drawer";
import { PromotionCampaignForm } from "@/components/admin/promotions/promotion-campaign-form";
import type { PromotionCampaignRow } from "@/lib/admin/promotions/campaigns";
import { withParamUpdates } from "@/lib/admin/query";

export function PromotionCampaignDrawer({
  campaign,
  plans,
  shops,
  params,
  register,
}: {
  campaign?: PromotionCampaignRow;
  plans: { id: string; name: string; shopifyPlanHandle: string }[];
  shops: { id: string; domain: string }[];
  params: Record<string, string>;
  register: boolean;
}) {
  const closeHref = withParamUpdates("/promotions", params, {
    drawer: null,
    campaignId: null,
    edit: null,
  });

  return (
    <AdminDetailDrawer
      title={register ? "Create promotion campaign" : "Edit promotion campaign"}
      closeHref={closeHref}
      size="wide"
    >
      <PromotionCampaignForm
        key={campaign?.id ?? "new"}
        campaign={campaign}
        plans={plans}
        shops={shops}
      />
    </AdminDetailDrawer>
  );
}
