"use client";
import { eligibleHeaderVariables, eligibleVariables } from "@/lib/admin/whatsapp-templates/authoring/registry";
import type { AuthoringIssue, ContentNode, TemplateAst, TextNode } from "@/lib/admin/whatsapp-templates/authoring/types";
import { TemplateBodyEditor } from "./template-body-editor";
import { TemplateHeaderEditor } from "./template-header-editor";
import { TemplateFooterEditor } from "./template-footer-editor";
import { TemplateButtonsEditor } from "./template-buttons-editor";
import { WrapperStructureEditor } from "./wrapper-structure-editor";

export function TemplateContentEditor({ draft, onChange, issues = [] }: {
  draft: TemplateAst; onChange: (draft: TemplateAst) => void; issues?: AuthoringIssue[];
}) {
  const forField = (path: string) => issues.filter((issue) => issue.path === path || issue.path.startsWith(`${path}.`));
  return <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-4 sm:p-6" aria-label="Template content">
    <div><h2 className="text-base font-semibold text-slate-900">Message content</h2>
      <p className="text-sm text-slate-500">Write naturally; variables are inserted as inline tokens and compiled into typed AST nodes.</p></div>
    {draft.family === "META_RECOVERY" ? <>
      <TemplateHeaderEditor nodes={draft.header} issues={forField("header")} variables={eligibleHeaderVariables(draft)}
        helpText="Meta text headers allow one short text variable (including brand names), with a maximum of 60 characters."
        onChange={(header) => onChange({ ...draft, header: header.filter((node): node is ContentNode => node.type !== "slot") })} />
      <TemplateBodyEditor nodes={draft.body} issues={forField("body")} variables={eligibleVariables(draft)}
        onChange={(body) => onChange({ ...draft, body: body.filter((node): node is ContentNode => node.type !== "slot") })} />
      <TemplateFooterEditor nodes={draft.footer} issues={forField("footer")}
        helpText="Meta footers must be static: brand variables are supported in the header or body. Conversation wrapper footers may contain variables."
        onChange={(footer) => onChange({ ...draft, footer: footer.filter((node): node is TextNode => node.type === "text") })} />
      <TemplateButtonsEditor buttons={draft.buttons} issues={forField("buttons")}
        onChange={(buttons) => onChange({ ...draft, buttons })} />
    </> : <WrapperStructureEditor draft={draft} issues={issues} onChange={onChange} />}
  </section>;
}
