import Link from 'next/link';
import { resolveMcpOperationalIssueAction } from '@/app/actions/mcp-operational';
import type { AwaitedReturnOpenIssues } from '@/lib/admin/mcp-operational-types';

/** Read-only operational information except for explicit administrator acknowledgement. */
export function McpOperationalIssues({ issues }: { issues: AwaitedReturnOpenIssues }) {
  if (!issues.length) return null;
  return (
    <section aria-labelledby="mcp-issues-heading" className="mb-6 rounded-xl border border-amber-300 bg-white p-4">
      <h2 id="mcp-issues-heading" className="font-semibold text-amber-950">MCP integration issues requiring attention ({issues.length})</h2>
      <p className="mt-1 text-sm text-gray-600">Tool execution is blocked for the listed shop capabilities. Open the support thread to investigate; mark resolved only after verifying recovery.</p>
      <ul className="mt-3 space-y-3">
        {issues.map(issue => (
          <li key={issue.incidentKey} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
            <div className="text-sm">
              <p className="font-semibold">{issue.shopDomain} — {issue.capabilityKey}</p>
              <p className="font-mono text-xs text-red-800">{issue.reasonCode}</p>
              <p className="text-xs text-gray-500">{issue.occurrenceCount} occurrence(s); latest error ID: {issue.lastErrorId}</p>
            </div>
            <div className="flex items-center gap-3">
              {issue.threadId ? (
                <Link className="text-sm underline" href={`/merchant-support?thread=${encodeURIComponent(issue.threadId)}`}>
                  View support message
                </Link>
              ) : null}
              <form action={resolveMcpOperationalIssueAction.bind(null, issue.incidentKey)}>
                <button type="submit" className="rounded-md border px-3 py-2 text-sm">Mark resolved</button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
