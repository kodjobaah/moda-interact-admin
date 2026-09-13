import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { ActivatePromotionCampaignForm, PromotionCampaignForm } from "@/components/admin/promotion-campaign-form";
import { requirePlatformAdminPage } from "@/lib/auth/platform-admin";
import { getPromotionCampaigns, getPromotionTargets } from "@/lib/admin/promotions";

export const dynamic = "force-dynamic";

export default async function PromotionsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const principal = await requirePlatformAdminPage();
  if (principal.role !== "SUPER_ADMIN") redirect("/");

  const [{ plans, shops }, campaigns] = await Promise.all([getPromotionTargets(), getPromotionCampaigns()]);
  const editId = (await searchParams).edit;
  const editing = campaigns.find((campaign) => campaign.id === editId);
  return (
    <AdminShell active="promotions">
      <div className="flex-1 overflow-auto p-4 sm:p-8">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[var(--brand-900)]">Promotion campaigns</h1>
            <p className="mt-1 max-w-3xl text-sm text-gray-500">Create optional merchant offers. Activation publishes the offer but never grants credits.</p>
          </div>
          <Link href="/promotions" className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">New campaign</Link>
        </div>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-950">{editing ? "Edit draft campaign" : "Create campaign draft"}</h2>
            <PromotionCampaignForm campaign={editing} plans={plans} shops={shops} />
          </section>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-950">Campaign history</h2>
            {campaigns.map((campaign) => (
              <article key={campaign.id} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-gray-950">{campaign.name}</h3>
                    <p className="mt-1 text-xs text-gray-500">{campaign.scope} · {campaign.quantity} recovery credits</p>
                  </div>
                  <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">{campaign.status}</span>
                </div>
                <p className="mt-3 text-sm text-gray-600">{campaign.scope === "GLOBAL" ? "All eligible merchants" : campaign.targetPlanName ?? campaign.targetShopDomain}</p>
                <p className="mt-1 text-xs text-gray-500">{campaign.startsAt.toLocaleString()} to {campaign.expiresAt.toLocaleString()}</p>
                <div className="mt-4 flex gap-2">
                  {campaign.status === "DRAFT" ? <Link href={`/promotions?edit=${encodeURIComponent(campaign.id)}`} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700">Edit</Link> : null}
                  <ActivatePromotionCampaignForm campaign={campaign} />
                </div>
              </article>
            ))}
            {campaigns.length === 0 ? <p className="rounded-lg border border-dashed border-gray-300 p-8 text-sm text-gray-600">No promotion campaigns yet.</p> : null}
          </section>
        </div>
      </div>
    </AdminShell>
  );
}