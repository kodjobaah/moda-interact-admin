import Link from 'next/link';
import { AdminShell } from '@/components/admin/admin-shell';
import { requirePlatformAdminPage } from '@/lib/auth/platform-admin';
import { getOperationalIncidents, getOperationalIncidentDetail, type IncidentFilter } from '@/lib/admin/operational-incidents';

type Search = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => typeof value === 'string' ? value : value?.[0];
const date = (value: Date | null) => value ? new Date(value).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '—';
export const dynamic = 'force-dynamic';

export default async function OperationalIncidentsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePlatformAdminPage();
  const params = await searchParams;
  const statusInput = first(params.status);
  const status: IncidentFilter = statusInput === 'OPEN' || statusInput === 'RESOLVED' ? statusInput : 'ALL';
  const sourceService = first(params.source);
  const severity = first(params.severity);
  const environment = first(params.environment);
  const requestedPage = Number(first(params.page));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const results = await getOperationalIncidents({ status, sourceService, severity, environment, page });
  const selected = first(params.incident);
  const detail = selected ? await getOperationalIncidentDetail(selected) : null;
  const query = (overrides: Record<string, string | number | undefined>) => {
    const url = new URLSearchParams();
    for (const [field, val] of Object.entries({ status, source: sourceService, severity, environment, ...overrides })) {
      if (val !== undefined && val !== '' && val !== 'ALL') url.set(field, String(val));
    }
    return `/operational-incidents?${url}`;
  };
  return <AdminShell active="operational-incidents"><div className="flex-1 overflow-auto p-4 sm:p-8 space-y-5">
    <header><p className="text-sm font-semibold uppercase tracking-widest text-green-800">Operations</p><h1 className="text-3xl font-bold">Operational Incidents</h1><p className="text-sm text-gray-600">Internal investigation and immutable audit history. Administrative actions follow in ARCH-033-ADMIN-002.</p></header>
    <form action="/operational-incidents" className="flex flex-wrap gap-3 rounded-lg border bg-white p-4">
      <label className="text-sm">Status <select name="status" defaultValue={status} className="ml-2 border rounded p-2"><option value="ALL">All</option><option value="OPEN">Open</option><option value="RESOLVED">Resolved</option></select></label>
      {([['source', sourceService, 'Source'], ['severity', severity, 'Severity'], ['environment', environment, 'Environment']] as const).map(([name, value, label]) => <label key={name} className="text-sm">{label}<input name={name} defaultValue={value ?? ''} maxLength={64} className="ml-2 border rounded p-2" /></label>)}
      <button type="submit" className="rounded bg-green-900 px-4 py-2 text-white">Filter</button>
    </form>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <section className="rounded-lg border bg-white p-4"><h2 className="font-semibold mb-3">Incidents ({results.total})</h2><div className="divide-y">
        {results.rows.map(row => <Link key={row.incidentKey} href={query({ incident: row.incidentKey, page })} className="block py-3 hover:bg-gray-50">
          <div className="font-semibold break-all">{row.reasonCode}</div><div className="text-sm text-gray-600">{row.sourceService} · {row.environment} · {row.severity} · {row.status}</div>
          <div className="text-xs text-gray-500">{row.shop?.domain ?? 'Platform'} · {row.occurrenceCount} occurrences · {date(row.lastOccurredAt)}</div>
        </Link>)}
        {!results.rows.length && <p className="py-4 text-sm text-gray-500">No incidents match these filters.</p>}
      </div><div className="flex justify-between pt-4 text-sm"><span>Page {results.page} of {results.pages}</span><div className="flex gap-3">{results.page > 1 && <Link href={query({ page: results.page - 1 })}>Previous</Link>}{results.page < results.pages && <Link href={query({ page: results.page + 1 })}>Next</Link>}</div></div></section>
      <section className="rounded-lg border bg-white p-4">{!detail ? <p className="text-sm text-gray-500">Select an incident to inspect its safe diagnostic information and history.</p> : <>
        <h2 className="font-semibold break-all">{detail.reasonCode}</h2><p className="text-sm text-gray-600">{detail.category} · {detail.sourceService} · {detail.environment}</p>
        <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-2 py-4 text-sm break-all">
          {([['Status', detail.status], ['Severity', detail.severity], ['Shop', detail.shop?.domain ?? 'Platform'], ['Resource', detail.resourceKey], ['Occurrences', String(detail.occurrenceCount)], ['First occurrence', date(detail.firstOccurredAt)], ['Last occurrence', date(detail.lastOccurredAt)], ['Correlation', detail.lastCorrelationId], ['Owner ID', detail.ownerPlatformAdminId ?? 'Unassigned'], ['Resolved by ID', detail.resolvedByPlatformAdminId ?? '—'], ['Resolved at', date(detail.resolvedAt)], ['Resolution note', detail.resolutionNote ?? '—']] as const).map(([label, value]) => <div key={label} className="contents"><dt className="font-medium">{label}</dt><dd>{value}</dd></div>)}
        </dl>
        {detail.shop?.merchantSupportThread?.id && <Link className="text-sm underline" href={`/merchant-support?thread=${encodeURIComponent(detail.shop.merchantSupportThread.id)}`}>View merchant support thread</Link>}
        <h3 className="font-semibold mt-5">Audit events (latest 100)</h3><ol className="divide-y">{detail.events.map(event => <li key={event.id} className="py-2 text-sm"><span className="font-medium">{event.eventType}</span> · {date(event.occurredAt)}<div className="text-gray-600">Actor: {event.actorPlatformAdminId ?? 'System'} · Correlation: {event.correlationId ?? '—'}</div></li>)}</ol>
      </>}</section>
    </div>
  </div></AdminShell>;
}
