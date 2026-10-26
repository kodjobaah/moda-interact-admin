import { MODA_SUPPORTED_LANGUAGE_TAGS } from "@modainteract/moda-interact-shared/internationalization";
import type { LanguageComparison } from "@/lib/admin/whatsapp-templates/publishing/types";
import { CompiledTemplateReadOnly } from "./compiled-template-read-only";

export function ShopLanguageComparison({ shopId, language, onLanguage, result, loading, error }: {
  shopId: string; language: string; onLanguage: (lang: string) => void;
  result: LanguageComparison | null; loading: boolean; error: string;
}) {
  return <section className="min-w-0 space-y-3 rounded-lg border border-slate-200 bg-white p-4" aria-label="Shop-language comparison">
    <h3 className="font-semibold">3. Previous versus proposed content</h3>
    <p className="break-all text-xs text-slate-600">Selected shop: {shopId}</p>
    <label className="flex max-w-xs flex-col gap-1 text-sm">Language
      <select value={language} onChange={(event) => onLanguage(event.target.value)} className="rounded border border-slate-300 p-2">
        {MODA_SUPPORTED_LANGUAGE_TAGS.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
      </select>
    </label>
    {loading && <p role="status" className="text-sm">Loading current language comparison…</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {result && result.shopId === shopId && result.languageTag === language && <>
      <p className="text-sm">Impact: <strong>{result.impact}</strong>. All values below are frozen template content and binding keys, not personalisation samples.</p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CompiledTemplateReadOnly title="Previous shop template" view={result.previous} />
        <CompiledTemplateReadOnly title="Proposed Moda-authored template" view={result.proposed} />
      </div>
      {result.brand.length > 0 && <div className="rounded border border-amber-200 p-3 text-sm" aria-label="ShopBrand field availability">
        <h4 className="font-medium">Shop-scoped brand-variable availability</h4>
        <p className="text-xs text-slate-600">Only configured/missing status is shown. No merchant branding is substituted into this template or guaranteed at send time.</p>
        <ul className="mt-2 list-disc pl-5">{result.brand.map((item) => <li key={item.key}>{item.key}: <strong>{item.availability === "unverifiable" ? "Not verifiable (warning)" : item.availability === "missing" ? "Missing/null (warning)" : "Configured"}</strong></li>)}</ul>
      </div>}
    </>}
  </section>;
}
