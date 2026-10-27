"use client";
import type { ShopBrandMediaRole } from "@/lib/admin/whatsapp-templates/authoring/types";
import { SHOP_BRAND_MEDIA_ROLES, type ShopBrandMediaView } from "@/lib/admin/whatsapp-templates/media/readiness";
import { ShopBrandMediaReadinessMessage } from "./shop-brand-media-readiness-message";
import { ShopBrandMediaPreview } from "./shop-brand-media-preview";

const names: Record<ShopBrandMediaRole, string> = {
  LOGO: "Logo", SQUARE_LOGO: "Square logo", COVER_IMAGE: "Cover image",
};

export function ShopBrandMediaRolePicker({ media, selectedRole, onSelect }: {
  media: ShopBrandMediaView | null;
  selectedRole?: ShopBrandMediaRole;
  onSelect: (role: ShopBrandMediaRole) => void;
}) {
  return <fieldset className="space-y-3" aria-label="ShopBrand IMAGE header role">
    <legend className="text-sm font-semibold text-slate-900">Processed media roles</legend>
    {!media && <p className="text-xs text-slate-600">Load a shop to enable verified IMAGE header roles.</p>}
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {SHOP_BRAND_MEDIA_ROLES.map((role) => {
        const roleMedia = media?.roles[role] ?? { role, status: "MISSING" as const };
        const ready = roleMedia.status === "READY";
        return <label key={role} className={`min-w-0 rounded-lg border p-3 ${ready ? "border-slate-300" : "border-slate-200 bg-slate-50"}`}>
          <span className="flex items-center gap-2 text-sm font-medium">
            <input type="radio" name="shopBrandMediaRole" value={role} checked={selectedRole === role}
              onChange={() => { if (ready) onSelect(role); }} disabled={!ready}
              aria-label={`${names[role]} IMAGE header (${ready ? "ready" : roleMedia.status.toLowerCase()})`}/>
            {names[role]}
          </span>
          <div className="mt-2"><ShopBrandMediaReadinessMessage media={roleMedia} /></div>
          {ready && <div className="mt-3"><ShopBrandMediaPreview media={roleMedia} domain={media!.domain}/></div>}
        </label>;
      })}
    </div>
  </fieldset>;
}
