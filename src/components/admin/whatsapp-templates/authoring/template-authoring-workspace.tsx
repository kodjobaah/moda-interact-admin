"use client";
import { useState } from "react";
import Link from "next/link";
import type { TemplateDetail } from "@/lib/admin/whatsapp-templates/authoring/types";
import { TemplateFamilyPurposeSelector } from "./template-family-purpose-selector";
import { TemplateContentEditor } from "./template-content-editor";
import { TemplateReadOnlyPreview } from "./template-read-only-preview";
import { TemplateSaveControls } from "./template-save-controls";
import { TemplateEditorSteps, type TemplateEditorStep } from "./template-editor-steps";
import { TemplateReviewSummary } from "./template-review-summary";
import { useTemplateAuthoringDraft } from "./use-template-authoring-draft";

/** Layout only: all AST mutations, validation, preview and saving live in the controller or pure services. */
export function TemplateAuthoringWorkspace({ cloneFrom }: { cloneFrom?: TemplateDetail | null }) {
  const controller = useTemplateAuthoringDraft(cloneFrom);
  const [step, setStep] = useState<TemplateEditorStep>("setup");
  const issues = controller.checked.ok ? [] : controller.checked.issues;
  const select = (next: TemplateEditorStep) => setStep(next);
  return <div className="mx-auto max-w-7xl space-y-5" aria-label="Template authoring workspace">
    <header className="space-y-2">
      <Link href="/system-controls/whatsapp-templates" className="inline-flex text-sm text-blue-800 underline">← Back to catalogue</Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="text-xl font-bold text-slate-900">{cloneFrom ? "Clone as New" : "Create WhatsApp template"}</h2>
          <p className="mt-1 text-sm text-slate-600">Create a new immutable English source in three steps.</p></div>
        <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">{controller.savedId ? "Saved" : "Unsaved draft"}</span>
      </div>
    </header>
    <TemplateEditorSteps value={step} onChange={select} issueCount={issues.length} />
    <div id="whatsapp-panel-setup" role="tabpanel" aria-labelledby="whatsapp-tab-setup" hidden={step !== "setup"}
      className={step === "setup" ? "grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(270px,0.6fr)]" : "hidden"}>
      <TemplateFamilyPurposeSelector draft={controller.draft} onChange={controller.updateDraft} onFamilyChange={controller.selectFamily} />
      <aside className="rounded-xl border border-slate-200 bg-white p-5" aria-label="Template setup summary">
        <h3 className="font-semibold text-slate-900">About this template</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">{controller.draft.family === "META_RECOVERY"
          ? "An approved Meta recovery template can be used for a checkout recovery outreach, once separately submitted, approved and published."
          : "An internal wrapper formats AI or human conversation replies. It does not create a Meta template."}</p>
        <p className="mt-4 text-xs text-slate-500">Saved English definitions cannot be edited. Translations and publication are separate workflows.</p>
      </aside>
    </div>
    <div id="whatsapp-panel-compose" role="tabpanel" aria-labelledby="whatsapp-tab-compose" hidden={step !== "compose"}
      className={step === "compose" ? "grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.82fr)]" : "hidden"}>
      <TemplateContentEditor draft={controller.draft} onChange={controller.updateDraft} issues={issues} />
      <div className="xl:sticky xl:top-0"><TemplateReadOnlyPreview preview={controller.preview} title="Live WhatsApp preview" draftInvalid={issues.length > 0} /></div>
    </div>
    <div id="whatsapp-panel-review" role="tabpanel" aria-labelledby="whatsapp-tab-review" hidden={step !== "review"} className={step === "review" ? "space-y-5" : "hidden"}>
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <TemplateReviewSummary draft={controller.draft} issues={issues} onStep={select} />
        <TemplateReadOnlyPreview preview={controller.preview} title="Final example preview" draftInvalid={issues.length > 0} />
      </div>
      <TemplateSaveControls issues={issues} saving={controller.saving} savedId={controller.savedId}
        error={controller.error} cloneFromId={cloneFrom?.id} showIssues={false} onSave={controller.submit} />
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
      <p className="text-xs text-slate-500">Your changes are preserved between tabs. Leaving this page discards an unsaved draft.</p>
      <div className="flex gap-2">
        {step !== "setup" && <button type="button" onClick={() => select(step === "review" ? "compose" : "setup")}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50">Back</button>}
        {step !== "review" && <button type="button" onClick={() => select(step === "setup" ? "compose" : "review")}
          className="rounded-lg bg-blue-800 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-900">
          Next: {step === "setup" ? "Compose" : "Review & Save"}
        </button>}
      </div>
    </div>
  </div>;
}
