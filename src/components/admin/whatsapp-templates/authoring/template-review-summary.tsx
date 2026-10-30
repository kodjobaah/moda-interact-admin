"use client";
import type { AuthoringIssue, TemplateAst } from "@/lib/admin/whatsapp-templates/authoring/types";
import type { TemplateEditorStep } from "./template-editor-steps";

export function TemplateReviewSummary({ draft, issues, onStep }: {
  draft: TemplateAst; issues: AuthoringIssue[]; onStep: (step: TemplateEditorStep) => void;
}) {
  const purpose = draft.family === "META_RECOVERY"
    ? `${draft.stage.replace("_", " ")} · ${draft.offerType.replace(/_/g, " ")}${draft.promotionTarget ? ` · ${draft.promotionTarget.replace(/_/g, " ")}` : ""}`
    : `${draft.audience} response`;
  const fixStep = (issue: AuthoringIssue): TemplateEditorStep => /^(family|stage|offerType|audience|sourceLanguageTag|schemaVersion)/.test(issue.path) ? "setup" : "compose";
  return <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-6" aria-label="Review source definition">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold">English source summary</h2>
      <button type="button" onClick={() => onStep("setup")} className="text-sm text-blue-800 underline">Edit setup</button></div>
    <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
      <div><dt className="text-slate-500">Family</dt><dd className="mt-1 font-medium">{draft.family === "META_RECOVERY" ? "Meta recovery" : "Conversation wrapper"}</dd></div>
      <div><dt className="text-slate-500">Purpose</dt><dd className="mt-1 font-medium">{purpose}</dd></div>
      <div><dt className="text-slate-500">Source language</dt><dd className="mt-1 font-medium">English (en)</dd></div>
    </dl>
    {draft.family === "META_RECOVERY" && draft.shopBrandMediaRole && <p className="text-sm text-amber-800" role="status">
      IMAGE header: {draft.shopBrandMediaRole}. This saved binding is merchant-independent; submission to Meta requires an independently acquired, trusted sample handle.
    </p>}
    <div className="border-t border-slate-100 pt-4">
      <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">Validation</h3>
        <button type="button" onClick={() => onStep("compose")} className="text-sm text-blue-800 underline">Edit content</button></div>
      {issues.length === 0 ? <p role="status" className="mt-2 text-sm text-emerald-800">All authoring checks pass. This English source can be saved once.</p>
        : <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3" role="alert">
          <p className="text-sm font-medium text-amber-950">Resolve {issues.length} issue{issues.length === 1 ? "" : "s"} before saving:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
            {issues.slice(0, 20).map((issue, index) => <li key={`${issue.path}-${index}`}><button type="button"
              onClick={() => onStep(fixStep(issue))} className="text-left underline underline-offset-2"><strong>{issue.path}</strong>: {issue.message}</button></li>)}
          </ul>
        </div>}
    </div>
  </section>;
}
