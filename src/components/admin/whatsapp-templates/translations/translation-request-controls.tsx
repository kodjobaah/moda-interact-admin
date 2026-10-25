import type { TranslationWorkspaceState } from "@/lib/admin/whatsapp-templates/translations/progress";

export function TranslationRequestControls({ state, busy, onGenerate, onRetry, onRefresh }: {
  state: TranslationWorkspaceState; busy: boolean;
  onGenerate: () => void; onRetry: () => void; onRefresh: () => void;
}) {
  const retryable = state.targets.some((item) => item.status === "FAILED" ||
    item.status === "PERMANENTLY_FAILED" || item.status === "PENDING");
  return <section className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-4" aria-label="Translation requests">
    <button type="button" disabled={busy || !!state.runId} onClick={onGenerate}
      className="rounded-lg bg-blue-800 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Generate translations</button>
    <button type="button" disabled={busy || !state.runId || !retryable} onClick={onRetry}
      className="rounded-lg border border-blue-800 px-4 py-2 text-sm font-medium text-blue-800 disabled:cursor-not-allowed disabled:opacity-40">Retry failed or pending</button>
    <button type="button" disabled={busy} onClick={onRefresh}
      className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-40">Refresh progress</button>
    {busy ? <span role="status" className="text-xs text-slate-600">Updating…</span> : null}
    {state.runId ? <span className="text-xs text-slate-500">Generation is deduplicated for this immutable source and model version.</span> : null}
  </section>;
}
