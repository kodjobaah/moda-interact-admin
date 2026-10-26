import type { PublicationPreview } from "@/lib/admin/whatsapp-templates/publishing/types";
export function PublicationEligibilitySummary({ preview }: { preview: PublicationPreview }) {
  return <section aria-label="Eligibility summary" className="rounded-lg border border-slate-200 bg-white p-4">
    <h2 className="font-semibold text-slate-900">2. Eligible scope and impact</h2>
    <dl className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
      <div><dt className="text-slate-500">Included shops</dt><dd className="font-semibold">{preview.totalShops}</dd></div>
      <div><dt className="text-slate-500">Excluded shops</dt><dd className="font-semibold">{preview.excludedCount}</dd></div>
      <div><dt className="text-slate-500">Shop-language targets</dt><dd className="font-semibold">{preview.totalTargets}</dd></div>
      <div><dt className="text-slate-500">Conflicting slots</dt><dd className="font-semibold">{preview.impactCounts.conflict}</dd></div>
    </dl>
    {preview.exclusionReasons.length > 0 && <ul className="mt-3 list-disc pl-5 text-sm text-amber-800">
      {preview.exclusionReasons.map((r) => <li key={r.reason}>{r.count} excluded: {r.reason}</li>)}
    </ul>}
    <p className="mt-3 text-xs text-slate-600">Eligibility and existing assignments are rechecked before each shop transaction. Brand availability is advisory, not proof that a message is send-ready.</p>
  </section>;
}
