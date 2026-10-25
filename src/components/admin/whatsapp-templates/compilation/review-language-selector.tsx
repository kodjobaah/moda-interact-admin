"use client";

import type { ReviewLocaleDTO } from "@/lib/admin/whatsapp-templates/compilation/contracts";

export function ReviewLanguageSelector({ locales, selected, onSelect }: {
  locales: ReviewLocaleDTO[]; selected: string; onSelect: (tag: string) => void;
}) {
  return <section aria-label="Translation languages" className="rounded-lg border bg-white p-3">
    <h2 className="mb-3 font-semibold">Languages ({locales.length})</h2>
    <div role="group" aria-label="Choose review language" className="grid max-h-[38rem] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-4 lg:grid-cols-1">
      {locales.map((locale) => <button key={locale.languageTag} type="button" onClick={() => onSelect(locale.languageTag)}
        aria-pressed={selected === locale.languageTag}
        className={`rounded border px-3 py-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-blue-700 ${selected === locale.languageTag ? "border-blue-700 bg-blue-50" : "border-slate-200"}`}>
        <span className="block font-medium">{locale.languageTag}</span>
        <span className={`text-xs ${locale.status === "INVALID" || locale.status === "REJECTED" ? "text-red-700" : "text-slate-600"}`}>{locale.status}</span>
      </button>)}
    </div>
  </section>;
}
