"use client";
import { ConfigurationField } from "@/components/admin/platform-configuration/configuration-field";
import { COMPOSITE_PROFILE_DEFAULTS, COMPOSITE_PROFILE_FIELDS } from "@/lib/admin/whatsapp-templates/authoring/composite-profile";
import type { AuthoringIssue, WrapperTemplateAst } from "@/lib/admin/whatsapp-templates/authoring/types";

export function TemplateCompositeProfileEditor({ draft, onChange, issues }: {
  draft: WrapperTemplateAst; onChange: (draft: WrapperTemplateAst) => void; issues: AuthoringIssue[];
}) {
  if (draft.audience !== "SHARED") return null;
  return <section aria-label="Saved template composite layout" className="space-y-3 rounded-lg border p-4">
    <h3 className="font-semibold">Required common layout and media</h3>
    <p className="text-sm text-slate-600">The saved template is the layout source of truth. Geometry is immutable after saving; use Clone as New, review and coordinated activation to change it. A historical clone needs an explicit layout before saving. Saving does not enable composite delivery or change native Meta templates.</p>
    <dl className="space-y-2 rounded bg-blue-50 p-3 text-sm">
      <div><dt className="font-semibold">Shop logo · fixed binding</dt><dd><code>LOGO</code> — the shop’s verified logo supplies the logo slot. No arbitrary image URL is accepted. If no verified logo is available, the worker uses the complete text reply.</dd></div>
      <div><dt className="font-semibold">Product image · fixed optional binding</dt><dd><code>response.productImage</code> · BEFORE_BODY — the verified selected product image supplies the separate product slot before the answer. When no product is selected, delivery uses a header-only image with the answer and checkout footer in the caption. If selected product media cannot be verified, delivery uses the complete text reply. This is automatic, not an optional AI image setting.</dd></div>
    </dl>
    <p className="text-sm text-slate-600">Sizes below are render-slot pixels. Images keep their aspect ratio, contained without cropping. WhatsApp scales the final image; these values do not set a native WhatsApp header size.</p>
    {!draft.compositeProfile ? <div className="space-y-2"><p role="alert">This historical template has no current layout. Add one explicitly before saving.</p>
      <button type="button" className="rounded border px-3 py-2 font-semibold" onClick={() => onChange({ ...draft, compositeProfile: { ...COMPOSITE_PROFILE_DEFAULTS } })}>Add required composite layout</button></div> : <>
      {[
        { title: "Logo size", names: ["logoWidth", "logoHeight"] },
        { title: "Product image size", names: ["productWidth", "productHeight"] },
        { title: "Canvas and placement", names: COMPOSITE_PROFILE_FIELDS.filter(field => !["schemaVersion", "logoWidth", "logoHeight", "productWidth", "productHeight"].includes(field.name)).map(field => field.name) },
      ].map(group => <fieldset key={group.title} className="rounded border p-3"><legend className="px-1 font-semibold">{group.title}</legend><div className="grid gap-4 sm:grid-cols-2">
        {group.names.map(name => COMPOSITE_PROFILE_FIELDS.find(field => field.name === name)!).map(field => <ConfigurationField
          key={field.name} field={field} value={draft.compositeProfile![field.name as keyof typeof draft.compositeProfile]} disabled={false}
          onChange={value => onChange({ ...draft, compositeProfile: { ...draft.compositeProfile!, [field.name]: value } })} />)}
      </div></fieldset>)}
    </>}
    {issues.map((issue, index) => <p key={index} role="alert" className="text-sm text-red-800">{issue.message}</p>)}
  </section>;
}
