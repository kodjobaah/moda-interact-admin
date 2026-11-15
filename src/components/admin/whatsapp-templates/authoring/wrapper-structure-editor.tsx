"use client";
import { TemplateCompositeProfileEditor } from "./template-composite-profile-editor";
import { setWrapperProductImage } from "@/lib/admin/whatsapp-templates/authoring/draft-operations";
import { eligibleVariables } from "@/lib/admin/whatsapp-templates/authoring/registry";
import { TemplateHeaderEditor } from "./template-header-editor";
import { TemplateBodyEditor } from "./template-body-editor";
import { TemplateFooterEditor } from "./template-footer-editor";
import { TemplateInlineEditor } from "./template-inline-editor";
import type { AuthoringIssue, ContentNode, WrapperTemplateAst } from "@/lib/admin/whatsapp-templates/authoring/types";

export function WrapperStructureEditor({ draft, onChange, issues = [] }: {
  draft: WrapperTemplateAst; onChange: (draft: WrapperTemplateAst) => void; issues?: AuthoringIssue[];
}) {
  const conditional = draft.conditionals[0];
  const router = draft.audience === "ROUTER";
  const common = draft.audience === "SHARED";
  const staticFooterHasContent = draft.footer.some(node => node.type !== "text" || node.value !== "");
  const normalVariables = eligibleVariables(draft).filter((name) => name !== "checkout.url");
  const forField = (path: string) => issues.filter((issue) => issue.path === path || issue.path.startsWith(`${path}.`));
  return <div className="space-y-5">
    {router && <div className="rounded border border-blue-100 bg-blue-50 p-3 text-sm">
      <p>Router — before a shop is selected. Use neutral static text and the response slot only. Shop, customer, checkout, logo and product bindings are unavailable. Review static wording for neutrality; the worker also checks it before sending. Merchant-specific text and images appear only after verified shop selection through the shop’s normal AI or SHARED layout.</p>
      <button type="button" className="mt-2 rounded border px-3 py-2" onClick={() => {
        const next = { ...draft, header: draft.header.filter(node => node.type === "text"),
          body: draft.body.filter(node => node.type !== "variable"), footer: draft.footer.filter(node => node.type === "text"), conditionals: [] };
        delete next.compositeProfile;
        delete next.productImage;
        onChange(next);
      }}>Explicitly remove incompatible bindings and media</button>
    </div>}
    {draft.audience === "SHARED" && <p className="rounded border border-blue-100 bg-blue-50 p-3 text-sm">For the common recovery layout, include the shop name once in the image header. Put the clickable shop website in the checkout-aware footer before the checkout link. Keep only the response slot in the body, leave the static footer empty, and end the checkout-aware message with the checkout link on its own line. Your text is shared across Meta, AI and human messages after review and coordinated activation.</p>}
    {draft.audience === "AI" && <div className="rounded-lg border border-slate-200 p-4">
      <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox"
        checked={!!draft.productImage} aria-describedby="optional-product-image-help"
        onChange={(event) => onChange(setWrapperProductImage(draft, event.target.checked))} />Optional product image</label>
      <p id="optional-product-image-help" className="mt-1 text-xs text-slate-600">One verified product image above the response; omitted when unavailable.</p>
      <p className="mt-1 text-xs text-slate-600">If the complete reply exceeds the image caption limit, the full reply is sent as text.</p>
      {!!forField("productImage").length && <p role="alert" className="mt-2 text-xs text-amber-800">{forField("productImage").map((issue) => issue.message).join("; ")}</p>}
    </div>}
    <TemplateCompositeProfileEditor draft={draft} onChange={onChange} issues={forField("compositeProfile")} />
    <TemplateHeaderEditor nodes={draft.header} issues={forField("header")} variables={normalVariables}
      onChange={(header) => onChange({ ...draft, header: header.filter((node): node is ContentNode => node.type !== "slot") })} />
    <TemplateBodyEditor nodes={draft.body} issues={forField("body")} variables={normalVariables} allowResponseSlot
      onChange={(body) => onChange({ ...draft, body })} />
    {!router && <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
      {common ? <>
        <h3 className="font-semibold">Website and checkout footer</h3>
        <p className="mt-1 text-sm text-slate-600">This dynamic footer is the place for the clickable shop website and checkout link. It appears when checkout context is available. Put shop.websiteUrl before checkout.url, with checkout.url alone on the final line.</p>
        {!conditional && <button type="button" className="mt-2 rounded border px-3 py-2 text-sm font-semibold" onClick={() => onChange({ ...draft, conditionals: [{ when: "checkout.available", nodes: [
          { type: "text", value: "──────────\nWebsite: " }, { type: "variable", name: "shop.websiteUrl" },
          { type: "text", value: "\nCheckout:\n" }, { type: "variable", name: "checkout.url" },
        ] }] })}>Add website and checkout footer</button>}
      </> : <>
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={!!conditional}
          onChange={(e) => onChange({ ...draft, conditionals: e.target.checked
            ? [{ when: "checkout.available", nodes: [{ type: "text", value: "Checkout: " }, { type: "variable", name: "checkout.url" }] }]
            : [] })} /> Include checkout-aware message</label>
        <p className="mt-1 text-xs text-slate-600">Only displayed when checkout context is available.</p>
      </>}
      {conditional && <div className="mt-3"><TemplateInlineEditor title={common ? "Dynamic footer" : "Checkout conditional"} rows={3}
        nodes={conditional.nodes} variables={eligibleVariables(draft)} issues={forField("conditionals")}
        onChange={(nodes) => onChange({ ...draft, conditionals: [{ ...conditional,
          nodes: nodes.filter((node): node is ContentNode => node.type !== "slot") }] })} /></div>}
      {!conditional && !!forField("conditionals").length && <p role="alert" className="mt-2 text-xs text-amber-800">{forField("conditionals").map((i) => i.message).join("; ")}</p>}
    </div>}
    {router && ["conditionals", "compositeProfile", "productImage"].map(path => forField(path).length > 0 && <p key={path} role="alert" className="text-sm text-amber-800">{forField(path).map(issue => issue.message).join("; ")}</p>)}
    {common && <p className="rounded border border-slate-200 p-3 text-sm">The common template has no static footer. Use Website and checkout footer above for its clickable links.{staticFooterHasContent && " Remove the existing static footer content below before saving; it will not be silently discarded."}</p>}
    {(!common || staticFooterHasContent) && <TemplateFooterEditor nodes={draft.footer} issues={forField("footer")} variables={normalVariables}
      onChange={(footer) => onChange({ ...draft, footer: footer.filter((node): node is ContentNode => node.type !== "slot") })} />}

  </div>;
}
