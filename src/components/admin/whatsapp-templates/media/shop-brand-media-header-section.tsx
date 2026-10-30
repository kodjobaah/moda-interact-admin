"use client";
import type { HeaderMediaRole } from "@/lib/admin/whatsapp-templates/authoring/types";
import type { ShopBrandMediaController } from "./use-shop-brand-media-role";
import { ShopBrandMediaRolePicker } from "./shop-brand-media-role-picker";

export function ShopBrandMediaHeaderSection({ controller, selectedRole, onSelect, allowProductImage }: {
  controller: ShopBrandMediaController;
  selectedRole?: HeaderMediaRole;
  onSelect: (role: HeaderMediaRole) => void;
  allowProductImage: boolean;
}) {
  return <section className="space-y-3 rounded-lg border border-slate-200 p-3 sm:p-4" aria-label="IMAGE header selector">
    <div><h3 className="text-sm font-semibold">IMAGE header source</h3>
      <p className="mt-1 text-xs text-slate-600">Choose a ShopBrand role or a product image supplied by verified recovery preparation. Product images are never selected from this editor.</p>
    </div>
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-600">{controller.pending ? "Loading sample images…" : "Template example images"}</span>
      <button type="button" onClick={() => void controller.load()} disabled={controller.pending}
        className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-50">Refresh examples</button>
    </div>
    {controller.message && <p role="alert" className="text-sm text-amber-800">{controller.message}</p>}
    <ShopBrandMediaRolePicker media={controller.media}
      selectedRole={selectedRole === "CHECKOUT_PRODUCT" ? undefined : selectedRole}
      onSelect={(role) => onSelect(role)}/>
    <label className={`block rounded-lg border p-3 text-sm ${selectedRole === "CHECKOUT_PRODUCT" ? "border-blue-500" : "border-slate-200"}`}>
      <span className="flex items-center gap-2 font-medium">
        <input type="radio" name="shopBrandMediaRole" value="CHECKOUT_PRODUCT"
          checked={selectedRole === "CHECKOUT_PRODUCT"} disabled={!allowProductImage}
          onChange={() => onSelect("CHECKOUT_PRODUCT")} aria-label="Verified checkout product IMAGE header" />
        Verified checkout product
      </span>
      <span className="mt-2 block text-xs text-slate-600">At send time, Background resolves the image for the exact selected product and variant. No product URL or image source is saved here.</span>
    </label>
    {selectedRole && <p className="text-xs text-amber-800">IMAGE header bound to {selectedRole.replaceAll("_", " ")}. Only the media role is saved. Admin queues a handle-free intent; Background supplies the provider sample handle during Meta submission.</p>}
  </section>;
}
