"use client";

import Link from "next/link";
import { workflowHref } from "@/lib/admin/whatsapp-templates/workflow/contracts";

import type { TranslationWorkspaceState } from "@/lib/admin/whatsapp-templates/translations/progress";
import { useTemplateTranslationRun } from "./use-template-translation-run";
import { TranslationRequestControls } from "./translation-request-controls";
import { TranslationProgressSummary } from "./translation-progress-summary";
import { TranslationLocaleStatusList } from "./translation-locale-status-list";
import { TranslationRunErrorNotice } from "./translation-run-error-notice";

export function TemplateTranslationWorkspace({ initialState, integrated = false }: { initialState: TranslationWorkspaceState; integrated?: boolean }) {
  const controller = useTemplateTranslationRun(initialState);
  return <div className="space-y-4" aria-label="Template translation workspace">
    <TranslationProgressSummary state={controller.state} />
    <TranslationRunErrorNotice message={controller.error} />
    <TranslationRequestControls state={controller.state} busy={controller.busy}
      onGenerate={controller.generate} onRetry={controller.retry} onRefresh={controller.refresh} />
    <TranslationLocaleStatusList targets={controller.state.targets} selected={controller.selected} onSelect={controller.setSelected} />
    {integrated && controller.state.runId && <Link className="inline-block rounded bg-blue-800 px-3 py-2 text-sm font-semibold text-white" href={workflowHref(initialState.definitionId,"translate",true)}>{controller.state.completed === 19 ? "Review all translations" : "Review available translations"}</Link>}
    <p className="text-xs text-slate-500">{integrated ? "Save and start translations requests the run automatically. If a run has not been created, use the start control above." : "Saving English outside the recovery workflow does not start translation."} Requests are processed asynchronously and read from durable PostgreSQL state. Selecting a language pauses automatic refresh.</p>
  </div>;
}
