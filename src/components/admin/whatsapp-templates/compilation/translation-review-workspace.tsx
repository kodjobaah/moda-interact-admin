"use client";

import Link from "next/link";
import type { ReviewWorkspaceDTO } from "@/lib/admin/whatsapp-templates/compilation/contracts";
import { useTemplateTranslationReview } from "./use-template-translation-review";
import { ReviewLanguageSelector } from "./review-language-selector";
import { SourceTranslationComparison } from "./source-translation-comparison";
import { ComponentAndVariableDiff } from "./component-and-variable-diff";
import { TranslationReviewActions } from "./translation-review-actions";

export function TranslationReviewWorkspace({ workspace }: { workspace: ReviewWorkspaceDTO }) {
  const { selected, select, current, busy, message, decide, synchronise } = useTemplateTranslationReview(workspace);
  return <div className="mx-auto max-w-7xl space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-4">
      <div><h2 className="text-lg font-semibold">Immutable translation review</h2>
        <p className="text-sm text-slate-600">{workspace.approvedCount} / {workspace.locales.length} languages ready (English included).</p>
        <p className="break-all text-xs text-slate-500">Definition: {workspace.definitionId}</p></div>
      <Link href={`/system-controls/whatsapp-templates?clone=${encodeURIComponent(workspace.definitionId)}`}
        className="rounded border border-blue-700 px-3 py-2 text-sm font-medium text-blue-800">Clone as New</Link>
    </div>
    {workspace.readyForPublication
      ? <p role="status" className="rounded border border-green-200 p-3 text-sm text-green-800">All 20 locale contents reviewed. Meta approval and publication remain separate actions.</p>
      : <p role="status" className="text-sm text-slate-700">All 19 translations must be individually approved before publication eligibility.</p>}
    <div className="flex flex-wrap items-center gap-3 text-sm">
      {workspace.definitionStatus && <span>Stored lifecycle: {workspace.definitionStatus}</span>}
      {!workspace.readyForPublication && <Link className="rounded border border-blue-700 px-3 py-2 font-medium text-blue-800"
        href={`/system-controls/whatsapp-templates/${encodeURIComponent(workspace.definitionId)}/translations`}>
        {workspace.locales.some(locale => locale.runId) ? "View translation progress / retry" : "Start translations"}</Link>}
      {workspace.canSynchroniseLifecycle && <button type="button" disabled={busy} onClick={synchronise}
        className="rounded border border-blue-700 px-3 py-2 font-medium text-blue-800 disabled:opacity-50">Synchronise translation status</button>}
      {workspace.readyForPublication && workspace.family === "META_RECOVERY" && <Link
        className="rounded bg-blue-800 px-3 py-2 font-semibold text-white" href={`/system-controls/whatsapp-templates/${encodeURIComponent(workspace.definitionId)}/meta`}>Continue to Meta approvals</Link>}
      {workspace.readyForPublication && workspace.family === "MODA_CONVERSATION_WRAPPER" && <Link
        className="rounded border border-blue-700 px-3 py-2 text-blue-800" href="/system-controls/whatsapp-templates/wrappers">Review wrapper publication</Link>}
      {message && <span role="status">{message}</span>}
    </div>
    <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside><ReviewLanguageSelector locales={workspace.locales} selected={selected} onSelect={select} /></aside>
      <main className="min-w-0 space-y-4">
        <SourceTranslationComparison source={workspace.source} translation={current} />
        <ComponentAndVariableDiff source={workspace.source} translation={current} />
        <TranslationReviewActions locale={current} busy={busy} message={message} onDecision={decide} />
      </main>
    </div>
  </div>;
}
