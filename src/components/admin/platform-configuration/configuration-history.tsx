import Link from "next/link";
import type { ConfigurationHistory } from "@/lib/admin/platform-configuration/repository";

export function ConfigurationHistoryPanel({ history, keyName, secret = false }: { history: ConfigurationHistory; keyName: string; secret?: boolean }) {
  return <section aria-label="Configuration audit history" className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
    <h2 className="text-lg font-semibold text-gray-900">Revision history</h2>
    <p className="mb-4 mt-1 text-xs text-gray-600">Most recent revisions first. Secret changes record the reason, operator, date and revision without exposing credential values. Secret reveals are separately recorded as structured security events, not as new revisions. Only the selected deployment environment is shown.</p>
    {history.entries.length === 0 ? <p className="text-sm text-gray-500">No recorded revisions.</p> : (
      <ol className="space-y-3">
        {history.entries.map((item) => <li key={item.id} className="rounded-md border border-gray-200 p-3 text-sm">
          <div className="flex flex-wrap justify-between gap-2"><strong>Revision {item.resultingVersion}</strong>
            <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("en-GB")}</time></div>
          <p>Operator: <span className="font-mono text-xs">{item.actorId}</span></p>
          <p>Expected revision: {item.expectedVersion}</p>
          {item.reason ? <p>Reason: {item.reason}</p> : <p className="text-gray-500">No reason given</p>}
          {!secret && <details className="mt-2"><summary className="cursor-pointer text-sm text-[var(--brand-800)]">View non-secret change</summary>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <pre className="max-h-40 overflow-auto rounded bg-gray-50 p-2 text-xs">Before: {JSON.stringify(item.beforeValue, null, 2)}</pre>
              <pre className="max-h-40 overflow-auto rounded bg-gray-50 p-2 text-xs">After: {JSON.stringify(item.afterValue, null, 2)}</pre>
            </div>
          </details>}
        </li>)}
      </ol>
    )}
    {history.nextCursor && <Link className="mt-4 inline-block text-sm underline" href={`/system-controls/platform-configuration?key=${encodeURIComponent(keyName)}&cursor=${encodeURIComponent(history.nextCursor)}`}>Older history</Link>}
  </section>;
}
