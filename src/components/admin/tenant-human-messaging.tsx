import Link from 'next/link';
import { formatDateTime } from '@/lib/admin/format';
import { withParamUpdates } from '@/lib/admin/query';
import type { HumanMessagingDashboard } from '@/lib/admin/human-messaging-contract';
import { HumanMessagingRestrictionControl, ModerationReviewControl } from './human-messaging-controls';

function PageControls({ page, totalPages, params, field }: {
  page: number; totalPages: number; params: Record<string, string>;
  field: 'humanHistoryPage' | 'humanIncidentPage';
}) {
  if (totalPages < 2) return null;
  return (
    <div className="mt-3 flex items-center gap-3 text-sm">
      {page > 1 ? <Link className="text-[var(--brand-700)] underline" href={withParamUpdates('/', params, { [field]: page - 1 })}>Previous</Link> : null}
      <span>Page {page} of {totalPages}</span>
      {page < totalPages ? <Link className="text-[var(--brand-700)] underline" href={withParamUpdates('/', params, { [field]: page + 1 })}>Next</Link> : null}
    </div>
  );
}

/** Platform-only selected-merchant panels. No moderation content or score fields are selected. */
export function TenantHumanMessaging({ dashboard, params }: {
  dashboard: HumanMessagingDashboard; params: Record<string, string>;
}) {
  return (
    <div className="space-y-5">
      <section aria-labelledby="human-messaging-heading" className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="human-messaging-heading" className="text-base font-semibold text-gray-950">Human messaging</h2>
            <p className="mt-1 text-sm text-gray-500">Platform-controlled HUMAN messaging only. AI and automation are unaffected.</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${dashboard.status === 'SUSPENDED' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>
            {dashboard.status} · Revision {dashboard.revision}
          </span>
        </div>
        {dashboard.reasonCode ? (
          <p className="mt-3 text-sm text-gray-600">Last reason: {dashboard.reasonCode} · Updated {formatDateTime(dashboard.updatedAt)}</p>
        ) : null}
        <HumanMessagingRestrictionControl key={`${dashboard.shopId}-${dashboard.revision}`} shopId={dashboard.shopId}
          status={dashboard.status} revision={dashboard.revision} />
      </section>
      <section aria-labelledby="human-messaging-history" className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h3 id="human-messaging-history" className="text-sm font-semibold text-gray-950">Human messaging restriction history</h3>
        {dashboard.history.items.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b text-gray-600"><th className="p-2">Time</th><th className="p-2">Action</th><th className="p-2">Revision</th><th className="p-2">Reason</th><th className="p-2">Internal note (SUPER_ADMIN only)</th><th className="p-2">Administrator</th></tr></thead>
              <tbody>{dashboard.history.items.map((item) => (
                <tr key={item.id} className="border-b"><td className="p-2">{formatDateTime(item.createdAt)}</td>
                  <td className="p-2">{item.fromStatus} → {item.toStatus}</td><td className="p-2">{item.revision}</td>
                  <td className="p-2">{item.reasonCode}</td>
                  <td className="max-w-md whitespace-pre-wrap break-words p-2">{item.reasonNote ?? '—'}</td>
                  <td className="p-2">{item.admin}</td></tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="mt-3 text-sm text-gray-500">No restriction changes recorded.</p>}
        <PageControls page={dashboard.history.page} totalPages={dashboard.history.totalPages} params={params} field="humanHistoryPage" />
      </section>
      <section aria-labelledby="human-moderation-incidents" className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h3 id="human-moderation-incidents" className="text-sm font-semibold text-gray-950">Moderation incidents</h3>
        <p className="mt-1 text-sm text-gray-500">Classification metadata only. Recording a review does not change the decision or allow a blocked message.</p>
        {dashboard.incidents.items.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b text-gray-600"><th className="p-2">Time</th><th className="p-2">Subject</th><th className="p-2">Decision</th><th className="p-2">Categories</th><th className="p-2">Status</th><th className="p-2">Review</th></tr></thead>
              <tbody>{dashboard.incidents.items.map((item) => (
                <tr key={item.id} className="border-b align-top"><td className="p-2">{formatDateTime(item.createdAt)}</td>
                  <td className="p-2">{item.subject}</td><td className="p-2">{item.decision}</td>
                  <td className="p-2">{item.categories.join(', ') || '—'}</td>
                  <td className="p-2">{item.status}</td>
                  <td className="p-2">{item.reviewed ? `Reviewed · ${item.reviewDisposition ?? '—'}` :
                    ['ALLOW', 'BLOCK', 'REVIEW_REQUIRED'].includes(item.decision) ?
                      <ModerationReviewControl shopId={dashboard.shopId} assessmentId={item.id} /> : 'Awaiting decision'}</td></tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="mt-3 text-sm text-gray-500">No moderation assessments recorded.</p>}
        <PageControls page={dashboard.incidents.page} totalPages={dashboard.incidents.totalPages} params={params} field="humanIncidentPage" />
      </section>
    </div>
  );
}
