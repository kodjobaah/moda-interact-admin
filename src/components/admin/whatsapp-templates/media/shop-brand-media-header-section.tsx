"use client";
import type { ShopBrandMediaRole } from "@/lib/admin/whatsapp-templates/authoring/types";
import type { ShopBrandMediaController } from "./use-shop-brand-media-role";
import { ShopBrandMediaRolePicker } from "./shop-brand-media-role-picker";

export function ShopBrandMediaHeaderSection({ controller, selectedRole, onSelect, onClear }: {
  controller: ShopBrandMediaController;
  selectedRole?: ShopBrandMediaRole;
  onSelect: (role: ShopBrandMediaRole) => void;
  onClear: () => void;
}) {
  return <section className="space-y-3 rounded-lg border border-slate-200 p-3 sm:p-4" aria-label="Verified IMAGE header selector">
    <div><h3 className="text-sm font-semibold">ShopBrand image header</h3>
      <p className="mt-1 text-xs text-slate-600">Select a reference shop for a real R2 image preview. Only the semantic media role is saved; delivery verifies the destination shop again.</p>
    </div>
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-0 flex-1 sm:min-w-48">
        <label htmlFor="template-brand-shop-id" className="mb-1 block text-xs font-semibold">Reference Shop ID</label>
        <input id="template-brand-shop-id" type="text" autoComplete="off" value={controller.shopId}
          onChange={(event) => { onClear(); controller.changeShop(event.target.value); }}
          placeholder="Shop ID" className="w-full rounded border border-slate-300 px-3 py-2 text-sm"/>
      </div>
      <button type="button" onClick={() => { onClear(); void controller.load(); }} disabled={controller.pending || !controller.shopId.trim()}
        className="rounded bg-blue-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {controller.pending ? "Checking…" : "Load verified media"}</button>
    </div>
    {controller.message && <p role="alert" className="text-sm text-amber-800">{controller.message}</p>}
    {controller.media && <p className="break-all text-xs text-slate-600">Reference shop: {controller.media.domain}</p>}
    <ShopBrandMediaRolePicker media={controller.media} selectedRole={selectedRole} onSelect={onSelect}/>
    {selectedRole && <p className="text-xs text-amber-800">IMAGE header bound to {selectedRole.replaceAll("_", " ")}. Meta provider submission requires a separate trusted sample upload handle; no source URL is used as a sample.</p>}
  </section>;
}
