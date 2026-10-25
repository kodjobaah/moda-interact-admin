"use client";

import { useState } from "react";
import type { TranslationLocaleProgress } from "@/lib/admin/whatsapp-templates/translations/progress";

const PAGE_SIZE = 8;
export function TranslationLocaleStatusList({ targets, selected, onSelect }: {
  targets: TranslationLocaleProgress[]; selected: string | null; onSelect: (language: string | null) => void;
}) {
  const [page, setPage] = useState(0);
  const count = Math.max(1, Math.ceil(targets.length / PAGE_SIZE));
  const current = Math.min(page, count - 1);
  const items = targets.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const selectedItem = targets.find((item) => item.languageTag === selected);
  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label="Language translation status">
    <div className="border-b border-slate-100 p-4"><h2 className="font-semibold">Target languages (19)</h2>
      <p className="mt-1 text-xs text-slate-500">Select a language to inspect its persisted status; automatic refresh pauses while selected.</p></div>
    <div className="max-h-[490px] overflow-x-auto overflow-y-auto"><table className="w-full min-w-[530px] text-left text-sm">
      <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-600"><tr><th className="px-4 py-3">Language</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Retries</th><th className="px-4 py-3">Failure</th></tr></thead>
      <tbody className="divide-y divide-slate-100">
        {items.map((item) => <tr key={item.languageTag} className={selected === item.languageTag ? "bg-blue-50" : ""}>
          <td className="p-3"><button type="button" aria-pressed={selected === item.languageTag} onClick={() => onSelect(selected === item.languageTag ? null : item.languageTag)}
            className="rounded px-1 text-left font-medium text-blue-800 underline">{item.languageTag}</button></td>
          <td className="p-3">{item.status.replaceAll("_", " ")}</td><td className="p-3">{item.retryCount}</td>
          <td className="max-w-48 break-words p-3 text-xs text-red-700">{item.failureCode || "—"}</td>
        </tr>)}
      </tbody>
    </table></div>
    <nav aria-label="Target language pages" className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm">
      <button type="button" disabled={current === 0} onClick={() => setPage(current - 1)} className="text-blue-800 disabled:opacity-40">Previous</button>
      <span>Page {current + 1} of {count}</span>
      <button type="button" disabled={current >= count - 1} onClick={() => setPage(current + 1)} className="text-blue-800 disabled:opacity-40">Next</button>
    </nav>
    {selectedItem && <aside aria-label="Selected language detail" className="border-t border-blue-100 bg-blue-50 p-4 text-sm">
      <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{selectedItem.languageTag}: {selectedItem.status}</h3>
        <button type="button" className="text-blue-800 underline" onClick={() => onSelect(null)}>Close / resume refresh</button></div>
      <p className="mt-1">{selectedItem.failureCode ? `Failure: ${selectedItem.failureCode}` : "No recorded failure."}</p>
      {selectedItem.completedAt && <p className="mt-1 text-xs text-slate-600">Completed {new Date(selectedItem.completedAt).toLocaleString("en-GB")}</p>}
    </aside>}
  </section>;
}
