"use client";

import { useState } from "react";
import { mutatePromotionCampaignAction } from "@/app/actions/promotions";
import type { PromotionCampaignRow } from "@/lib/admin/promotions";
import { PROMOTION_SCOPES, type PromotionScope } from "@/lib/admin/promotion-validation";

const inputClass =
  "w-full rounded-md border border-gray-300 bg-white p-2 text-sm outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-200)]";

function localDateTime(value?: Date): string {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function PromotionCampaignForm({
  campaign,
  plans,
  shops,
}: {
  campaign?: PromotionCampaignRow;
  plans: { id: string; name: string; shopifyPlanHandle: string }[];
  shops: { id: string; domain: string }[];
}) {
  const [scope, setScope] = useState<PromotionScope>(campaign?.scope ?? "GLOBAL");
  const editable = !campaign || campaign.status === "DRAFT";
  return (
    <form action={mutatePromotionCampaignAction} className="space-y-4">
      <input type="hidden" name="intent" value={campaign ? "update" : "create"} />
      {campaign ? <input type="hidden" name="id" value={campaign.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-gray-700 sm:col-span-2">
          Campaign name
          <input className={inputClass} name="name" defaultValue={campaign?.name} readOnly={!editable} required />
        </label>
        <label className="text-sm font-medium text-gray-700 sm:col-span-2">
          Merchant description
          <textarea className={inputClass} name="merchantDescription" defaultValue={campaign?.merchantDescription ?? ""} readOnly={!editable} rows={3} />
        </label>
        <label className="text-sm font-medium text-gray-700">
          Scope
          <select className={inputClass} name="scope" value={scope} onChange={(event) => setScope(event.target.value as PromotionScope)} disabled={!editable}>
            {PROMOTION_SCOPES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-gray-700">
          Recovery credits
          <input className={inputClass} name="quantity" type="number" min="1" max="1000000" defaultValue={campaign?.quantity ?? 1} readOnly={!editable} required />
        </label>
        <label className="text-sm font-medium text-gray-700">
          Target billing plan
          <select className={inputClass} name="targetPlanId" defaultValue={campaign?.targetPlanId ?? ""} disabled={scope !== "PLAN" || !editable}>
            <option value="">Select a plan</option>
            {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} ({plan.shopifyPlanHandle})</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-gray-700">
          Target shop
          <select className={inputClass} name="targetShopId" defaultValue={campaign?.targetShopId ?? ""} disabled={scope !== "SHOP" || !editable}>
            <option value="">Select a shop</option>
            {shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.domain}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-gray-700">
          Starts at
          <input className={inputClass} name="startsAt" type="datetime-local" defaultValue={localDateTime(campaign?.startsAt)} readOnly={!editable} required />
        </label>
        <label className="text-sm font-medium text-gray-700">
          Expires at
          <input className={inputClass} name="expiresAt" type="datetime-local" defaultValue={localDateTime(campaign?.expiresAt)} readOnly={!editable} required />
        </label>
      </div>
      {editable ? (
        <button type="submit" className="rounded-md bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)]">
          {campaign ? "Save draft" : "Create draft"}
        </button>
      ) : (
        <p className="text-sm text-gray-600">Activated campaign terms are immutable. Create a new campaign for a materially different offer.</p>
      )}
    </form>
  );
}

export function ActivatePromotionCampaignForm({ campaign }: { campaign: PromotionCampaignRow }) {
  if (campaign.status !== "DRAFT") return null;
  return (
    <form action={mutatePromotionCampaignAction}>
      <input type="hidden" name="intent" value="activate" />
      <input type="hidden" name="id" value={campaign.id} />
      <button type="submit" className="rounded-md border border-green-700 px-3 py-1.5 text-xs font-semibold text-green-800 hover:bg-green-50">Activate</button>
    </form>
  );
}