"use client";

import type { TranslationWorkspaceState } from "@/lib/admin/whatsapp-templates/translations/progress";
import { useTemplateTranslationRun } from "./use-template-translation-run";
import { TranslationRequestControls } from "./translation-request-controls";
import { TranslationProgressSummary } from "./translation-progress-summary";
import { TranslationLocaleStatusList } from "./translation-locale-status-list";
import { TranslationRunErrorNotice } from "./translation-run-error-notice";

export function TemplateTranslationWorkspace({ initialState }: { initialState: TranslationWorkspaceState }) {
  const controller = useTemplateTranslationRun(initialState);
  return <div className="space-y-4" aria-label="Template translation workspace">
    <TranslationProgressSummary state={controller.state} />
    <TranslationRunErrorNotice message={controller.error} />
    <TranslationRequestControls state={controller.state} busy={controller.busy}
      onGenerate={controller.generate} onRetry={controller.retry} onRefresh={controller.refresh} />
    <TranslationLocaleStatusList targets={controller.state.targets} selected={controller.selected} onSelect={controller.setSelected} />
    <p className="text-xs text-slate-500">Saving English does not start translation. Requests are processed asynchronously and read from durable PostgreSQL state. Selecting a language pauses automatic refresh.</p>
  </div>;
}
