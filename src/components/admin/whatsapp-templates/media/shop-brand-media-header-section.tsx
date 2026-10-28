"use client";
import type { ShopBrandMediaRole } from "@/lib/admin/whatsapp-templates/authoring/types";
import type { ShopBrandMediaController } from "./use-shop-brand-media-role";
import { ShopBrandMediaRolePicker } from "./shop-brand-media-role-picker";

export function ShopBrandMediaHeaderSection({ controller, selectedRole, onSelect }: {
  controller: ShopBrandMediaController;
  selectedRole?: ShopBrandMediaRole;
  onSelect: (role: ShopBrandMediaRole) => void;
}) {
  return <section className="space-y-3 rounded-lg border border-slate-200 p-3 sm:p-4" aria-label="ShopBrand IMAGE header selector">
    <div><h3 className="text-sm font-semibold">ShopBrand image header</h3>
      <p className="mt-1 text-xs text-slate-600">Choose the merchant image role for this platform template. Images shown here are seeded Moda examples only; each merchant's own READY media is checked again when sending.</p>
    </div>
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-600">{controller.pending ? "Loading sample images…" : "Template example images"}</span>
      <button type="button" onClick={() => void controller.load()} disabled={controller.pending}
        className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-50">Refresh examples</button>
    </div>
    {controller.message && <p role="alert" className="text-sm text-amber-800">{controller.message}</p>}
    <ShopBrandMediaRolePicker media={controller.media} selectedRole={selectedRole} onSelect={onSelect}/>
    {selectedRole && <p className="text-xs text-amber-800">IMAGE header bound to {selectedRole.replaceAll("_", " ")}. Only the media role is saved. Meta registration still requires a separate trusted sample upload handle.</p>}
  </section>;
}
