import type { PublicationProgress } from "@/lib/admin/whatsapp-templates/publishing/types";
export function PublicationProgressSummary({ progress, busy, onContinue, onRetry }: {
  progress: PublicationProgress; busy: boolean; onContinue: () => void; onRetry: () => void;
}) {
  return <section aria-label="Publication progress" className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
    <h2 className="font-semibold">Publication progress — {progress.status}</h2>
    <p className="break-all text-xs text-slate-500">Operation: {progress.operationId}</p>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div><h3 className="text-sm font-semibold">Shops ({progress.totalShops})</h3>
        <p className="text-sm">Succeeded {progress.succeededShops} · Failed {progress.failedShops} · Pending {progress.pendingShops}</p></div>
      <div><h3 className="text-sm font-semibold">Shop-language targets ({progress.totalTargets})</h3>
        <p className="text-sm">Succeeded {progress.succeededTargets} · Failed {progress.failedTargets} · Pending {progress.pendingTargets}</p></div>
    </div>
    {progress.status === "PARTIAL" && <p role="alert" className="text-sm text-amber-800">Some shops did not publish. Stale, ineligible, or conflicting shops require a NEW reviewed operation. Only transient failures may be retried below.</p>}
    {progress.status === "COMPLETE" && <p role="status" className="text-sm text-green-800">All confirmed shop-language targets have been processed successfully.</p>}
    {progress.status === "IN_PROGRESS" && <button type="button" disabled={busy} onClick={onContinue} className="rounded border border-slate-400 px-3 py-2 text-sm disabled:opacity-50">{busy ? "Processing…" : "Continue next five shops"}</button>}
    {progress.status === "PARTIAL" && <button type="button" disabled={busy} onClick={onRetry} className="rounded border border-slate-400 px-3 py-2 text-sm disabled:opacity-50">Retry transient failures (up to five shops)</button>}
    {progress.failureCode && <p className="text-xs text-slate-600">Current operation: {progress.failureCode}</p>}
    <p className="text-xs text-slate-500">Progress is durable. You may reopen this operation using its URL and continue without repeating successful assignments.</p>
  </section>;
}
