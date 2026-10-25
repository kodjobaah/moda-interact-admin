"use client";
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
  const normalVariables = eligibleVariables(draft).filter((name) => name !== "checkout.url");
  const forField = (path: string) => issues.filter((issue) => issue.path === path || issue.path.startsWith(`${path}.`));
  return <div className="space-y-5">
    <TemplateHeaderEditor nodes={draft.header} issues={forField("header")} variables={normalVariables}
      onChange={(header) => onChange({ ...draft, header: header.filter((node): node is ContentNode => node.type !== "slot") })} />
    <TemplateBodyEditor nodes={draft.body} issues={forField("body")} variables={normalVariables} allowResponseSlot
      onChange={(body) => onChange({ ...draft, body })} />
    <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
      <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={!!conditional}
        onChange={(e) => onChange({ ...draft, conditionals: e.target.checked
          ? [{ when: "checkout.available", nodes: [{ type: "text", value: "Checkout: " }, { type: "variable", name: "checkout.url" }] }]
          : [] })} /> Include checkout-aware message</label>
      <p className="mt-1 text-xs text-slate-600">Only displayed when checkout context is available.</p>
      {conditional && <div className="mt-3"><TemplateInlineEditor title="Checkout conditional" rows={3}
        nodes={conditional.nodes} variables={eligibleVariables(draft)} issues={forField("conditionals")}
        onChange={(nodes) => onChange({ ...draft, conditionals: [{ ...conditional,
          nodes: nodes.filter((node): node is ContentNode => node.type !== "slot") }] })} /></div>}
      {!conditional && !!forField("conditionals").length && <p role="alert" className="mt-2 text-xs text-amber-800">{forField("conditionals").map((i) => i.message).join("; ")}</p>}
    </div>
    <TemplateFooterEditor nodes={draft.footer} issues={forField("footer")} variables={normalVariables}
      onChange={(footer) => onChange({ ...draft, footer: footer.filter((node): node is ContentNode => node.type !== "slot") })} />
  </div>;
}
