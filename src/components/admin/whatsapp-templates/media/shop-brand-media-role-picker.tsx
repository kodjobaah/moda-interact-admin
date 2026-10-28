"use client";
import type { ShopBrandMediaRole } from "@/lib/admin/whatsapp-templates/authoring/types";
import { SHOP_BRAND_MEDIA_ROLES } from "@/lib/admin/whatsapp-templates/media/readiness";
import type { TemplateSampleMediaView } from "@/lib/admin/whatsapp-templates/media/template-samples";
import { ShopBrandMediaPreview } from "./shop-brand-media-preview";

const names: Record<ShopBrandMediaRole, string> = {
  LOGO: "Logo", SQUARE_LOGO: "Square logo", COVER_IMAGE: "Cover image",
};

export function ShopBrandMediaRolePicker({ media, selectedRole, onSelect }: {
  media: TemplateSampleMediaView | null;
  selectedRole?: ShopBrandMediaRole;
  onSelect: (role: ShopBrandMediaRole) => void;
}) {
  return <fieldset className="space-y-3" aria-label="ShopBrand IMAGE header role">
    <legend className="text-sm font-semibold text-slate-900">Image header role</legend>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {SHOP_BRAND_MEDIA_ROLES.map((role) => {
        const sample = media?.roles[role];
        return <label key={role} className={`min-w-0 rounded-lg border p-3 ${selectedRole === role ? "border-blue-500" : "border-slate-200 bg-slate-50"}`}>
          <span className="flex items-center gap-2 text-sm font-medium">
            <input type="radio" name="shopBrandMediaRole" value={role} checked={selectedRole === role}
              onChange={() => onSelect(role)} aria-label={`${names[role]} IMAGE header`}/>
            {names[role]}
          </span>
          {sample?.status === "READY" ? <div className="mt-3"><ShopBrandMediaPreview media={sample} domain="Moda template example"/></div>
            : <p className="mt-2 text-xs text-slate-600">No seeded example yet. You can still select this role.</p>}
        </label>;
      })}
    </div>
  </fieldset>;
}
