"use client";

import { useState } from "react";
import type { MetaSubmissionPlan } from "@/lib/admin/whatsapp-templates/meta/contracts";

/** No AST parsing or recompilation: display the EXACT approved snapshot. */
export function MetaSubmissionReview({ plan }: { plan: MetaSubmissionPlan }) {
  const [tag, setTag] = useState(plan.locales[0]?.languageTag ?? "en");
  const locale = plan.locales.find((row) => row.languageTag === tag) ?? plan.locales[0];
  return <section aria-label="Review Meta submission" className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
    <div><h2 className="text-lg font-semibold">Review frozen Meta payload</h2>
      <p className="text-sm text-slate-600">Exactly 20 immutable language snapshots. Samples are compiler examples, not merchant ShopBrand values.</p></div>
    <dl className="grid gap-2 text-sm sm:grid-cols-2">
      <div><dt className="font-medium">Trusted sender WABA</dt><dd className="break-all font-mono">{plan.wabaId}</dd></div>
      <div><dt className="font-medium">Provider identity</dt><dd className="break-all font-mono">{plan.providerTemplateName}</dd></div>
      <div><dt className="font-medium">Category</dt><dd>{plan.category}</dd></div>
      <div><dt className="font-medium">Source digest</dt><dd className="break-all font-mono text-xs">{plan.sourceHash}</dd></div>
    </dl>
    <label className="block text-sm font-medium" htmlFor="meta-preview-language">Inspect provider language
      <select id="meta-preview-language" value={tag} onChange={(event) => setTag(event.target.value)} className="mt-1 block w-full max-w-xs rounded border p-2">
        {plan.locales.map((entry) => <option key={entry.languageTag} value={entry.languageTag}>{entry.languageTag} ({entry.providerLanguageCode})</option>)}
      </select>
    </label>
    {locale && <div className="grid gap-4 xl:grid-cols-2">
      <div className="min-w-0"><h3 className="text-sm font-semibold">Compiled Meta components ({locale.providerLanguageCode})</h3>
        <pre data-testid="frozen-meta-components" className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-950 p-3 text-xs text-white">{JSON.stringify(locale.components, null, 2)}</pre></div>
      <div className="min-w-0"><h3 className="text-sm font-semibold">Frozen header, body and button bindings</h3>
        <pre data-testid="frozen-meta-bindings" className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-100 p-3 text-xs">{JSON.stringify(locale.bindings, null, 2)}</pre></div>
      <div className="xl:col-span-2 text-xs text-slate-600"><span className="font-semibold">Locale SHA-256:</span> <code className="break-all">{locale.contentHash}</code></div>
    </div>}
    <p className="text-xs text-slate-600">Review fingerprint (changes invalidate confirmation): <code className="break-all">{plan.digest}</code></p>
  </section>;
}
