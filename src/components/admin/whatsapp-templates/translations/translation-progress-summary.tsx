import type { TranslationWorkspaceState } from "@/lib/admin/whatsapp-templates/translations/progress";

const TITLES: Record<TranslationWorkspaceState["progress"], string> = {
  SAVED: "Saved English source", TRANSLATION_QUEUED: "Translation queued",
  TRANSLATING: "Translating", PARTIALLY_FAILED: "Some languages need attention",
  READY_FOR_REVIEW: "Ready for translation review",
};

export function TranslationProgressSummary({ state }: { state: TranslationWorkspaceState }) {
  return <section aria-label="Translation progress" className="rounded-xl border border-slate-200 bg-white p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-base font-semibold text-slate-900">{TITLES[state.progress]}</h2>
        <p className="mt-1 text-sm text-slate-500">English is the immutable source. Nineteen other languages are processed independently.</p></div>
      <span role="status" className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{state.progress.replaceAll("_", " ")}</span>
    </div>
    <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="rounded-lg bg-blue-50 p-3"><dt className="text-xs text-blue-700">English source</dt><dd className="mt-1 text-xl font-semibold">1 / 1</dd></div>
      <div className="rounded-lg bg-emerald-50 p-3"><dt className="text-xs text-emerald-700">Translated</dt><dd className="mt-1 text-xl font-semibold">{state.completed} / 19</dd></div>
      <div className="rounded-lg bg-slate-50 p-3"><dt className="text-xs text-slate-600">Pending / active</dt><dd className="mt-1 text-xl font-semibold">{state.pending}</dd></div>
      <div className="rounded-lg bg-amber-50 p-3"><dt className="text-xs text-amber-700">Failed</dt><dd className="mt-1 text-xl font-semibold">{state.failed}</dd></div>
    </dl>
    {state.runId ? <p className="mt-3 break-words text-xs text-slate-500">Run {state.runId} · {state.modelName || "Configured model"} · Requested {state.requestedAt ? new Date(state.requestedAt).toLocaleString("en-GB") : "—"}</p> : null}
  </section>;
}
