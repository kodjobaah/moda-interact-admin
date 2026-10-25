import Link from "next/link";
import type { TemplateListItem } from "@/lib/admin/whatsapp-templates/authoring/types";

export function TemplateCatalogue({ items, search, page, hasNext, selectedId, kind = "", status = "" }: {
  items: TemplateListItem[]; search: string; page: number; hasNext: boolean;
  selectedId?: string; kind?: string; status?: string;
}) {
  const query = (next: number) => new URLSearchParams({ page: String(next), search, ...(kind ? { kind } : {}), ...(status ? { status } : {}) }).toString();
  return <section className="space-y-5" aria-label="WhatsApp template catalogue">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-semibold text-slate-900">Template catalogue</h2>
        <p className="mt-1 text-sm text-slate-500">Browse immutable English sources, or create a new template.</p></div>
      <Link className="rounded-lg bg-blue-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-900" href="/system-controls/whatsapp-templates?create=1">+ Create template</Link>
    </div>
    <form action="/system-controls/whatsapp-templates" method="GET" role="search"
      className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-[minmax(0,1fr)_minmax(150px,210px)_minmax(140px,185px)_auto] sm:items-end">
      <label className="block text-sm font-medium text-slate-700">Search
        <input name="search" aria-label="Search template name or ID" maxLength={90} defaultValue={search}
          className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm" placeholder="Template name or ID" />
      </label>
      <label className="block text-sm font-medium text-slate-700">Family
        <select name="kind" aria-label="Filter by family" defaultValue={kind} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm">
          <option value="">All families</option><option value="META_RECOVERY">Meta recovery</option>
          <option value="MODA_CONVERSATION_WRAPPER">Conversation wrapper</option>
        </select>
      </label>
      <label className="block text-sm font-medium text-slate-700">Lifecycle
        <select name="status" aria-label="Filter by status" defaultValue={status} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm">
          <option value="">All statuses</option><option value="SAVED">Saved</option><option value="PUBLISHED">Published</option><option value="RETIRED">Retired</option>
        </select>
      </label>
      <button type="submit" className="rounded-lg border border-blue-800 px-4 py-2.5 text-sm font-semibold text-blue-800 hover:bg-blue-50">Search</button>
    </form>
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      {items.length === 0 ? <div className="p-10 text-center" role="status">
        <p className="font-medium text-slate-800">No templates found</p>
        <p className="mt-2 text-sm text-slate-500">Create the first English source or adjust your search and filters.</p>
        <Link href="/system-controls/whatsapp-templates?create=1" className="mt-4 inline-block text-sm font-semibold text-blue-800 underline">Create a template</Link>
      </div> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] border-collapse text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600"><tr>
          <th scope="col" className="px-4 py-3">Template</th><th scope="col" className="px-4 py-3">Family</th>
          <th scope="col" className="px-4 py-3">Purpose</th><th scope="col" className="px-4 py-3">Language</th>
          <th scope="col" className="px-4 py-3">Status</th><th scope="col" className="px-4 py-3">Created</th>
        </tr></thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((entry) => <tr key={entry.id} className="hover:bg-blue-50/40">
            <td className="max-w-xs px-4 py-4"><Link href={`/system-controls/whatsapp-templates?definition=${encodeURIComponent(entry.id)}&${query(page)}`}
              aria-current={entry.id === selectedId ? "page" : undefined} className="block break-words font-semibold text-blue-800 underline underline-offset-2">
              {entry.providerTemplateName || `Wrapper · ${entry.audience || "unknown"}`}</Link>
              <span className="mt-1 block truncate font-mono text-[11px] text-slate-500" title={entry.id}>{entry.id}</span></td>
            <td className="px-4 py-4">{entry.kind === "META_RECOVERY" ? "Meta recovery" : "Conversation wrapper"}</td>
            <td className="px-4 py-4">{entry.kind === "META_RECOVERY" ? `${entry.purpose}/${entry.offerType}` : entry.audience}</td>
            <td className="px-4 py-4">{entry.sourceLanguageTag}</td>
            <td className="px-4 py-4"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{entry.status}</span></td>
            <td className="whitespace-nowrap px-4 py-4">{new Date(entry.createdAt).toLocaleDateString("en-GB")}</td>
          </tr>)}
        </tbody>
      </table></div>}
      <nav aria-label="Catalogue pages" className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm">
        {page > 1 ? <Link className="font-medium text-blue-800 underline" href={`/system-controls/whatsapp-templates?${query(page - 1)}`}>Previous</Link> : <span />}
        <span>Page {page}</span>
        {hasNext ? <Link className="font-medium text-blue-800 underline" href={`/system-controls/whatsapp-templates?${query(page + 1)}`}>Next</Link> : <span />}
      </nav>
    </div>
  </section>;
}
