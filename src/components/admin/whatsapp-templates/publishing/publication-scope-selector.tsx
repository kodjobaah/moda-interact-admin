import type { PublicationScope } from "@/lib/admin/whatsapp-templates/publishing/types";

export type ShopOption = { id: string; domain: string; platform: string };
export function PublicationScopeSelector({ scope, onChange, options, search, onSearch, loading, error,
  selectionPage, hasNext, onSelectionPage }: {
  scope: PublicationScope; onChange: (value: PublicationScope) => void;
  options: ShopOption[]; search: string; onSearch: (search: string) => void;
  loading: boolean; error: string; selectionPage: number; hasNext: boolean;
  onSelectionPage: (page: number) => void;
}) {
  return <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4" aria-label="Publication scope">
    <h2 className="font-semibold text-slate-900">1. Choose shops</h2>
    <fieldset className="flex flex-wrap gap-4 text-sm"><legend className="sr-only">Shop scope</legend>
      {(["one", "selected", "all"] as const).map((mode) => <label key={mode} className="flex items-center gap-2">
        <input type="radio" name="publication-scope" checked={scope.mode === mode}
          onChange={() => onChange(mode === "all" ? { mode } : mode === "one" ? { mode, shopId: "" } : { mode, shopIds: [] })} />
        {mode === "one" ? "One shop" : mode === "selected" ? "Selected shops (up to 200)" : "All currently eligible shops"}
      </label>)}
    </fieldset>
    {scope.mode === "all" ? <p className="text-sm text-slate-600">Confirmation freezes the exact set of currently eligible shops. Later installations are excluded.</p> : <>
      <label className="block text-sm font-medium text-slate-700" htmlFor="publication-shop-search">Search eligible shops by domain</label>
      <input id="publication-shop-search" value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Search shop domain"
        className="w-full rounded-md border border-slate-300 p-2 text-sm" />
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {loading && <p role="status" className="text-sm text-slate-600">Loading eligible shops…</p>}
      <div className="max-h-60 space-y-1 overflow-y-auto" aria-label="Eligible shops">
        {options.map((shop) => {
          const selected = scope.mode === "one" ? scope.shopId === shop.id : scope.shopIds.includes(shop.id);
          const limit = scope.mode === "selected" && scope.shopIds.length >= 200;
          return <label key={shop.id} className="flex items-center gap-2 rounded-md border border-slate-100 p-2 text-sm">
            <input type={scope.mode === "one" ? "radio" : "checkbox"} name={scope.mode === "one" ? "one-shop" : undefined}
              disabled={!selected && limit} checked={selected}
              onChange={(e) => onChange(scope.mode === "one" ? { mode: "one", shopId: shop.id }
                : { mode: "selected", shopIds: e.target.checked ? [...scope.shopIds, shop.id] : scope.shopIds.filter((id) => id !== shop.id) })} />
            <span className="min-w-0 break-all">{shop.domain} <span className="text-slate-500">({shop.platform})</span></span>
          </label>;
        })}
        {!loading && !options.length && <p className="p-2 text-sm text-slate-500">No matching eligible shops.</p>}
      </div>
      <div className="flex items-center gap-3 text-sm">
        <button type="button" className="rounded border px-2 py-1 disabled:opacity-50" disabled={selectionPage <= 1 || loading}
          onClick={() => onSelectionPage(selectionPage - 1)}>Previous</button>
        <span>Search page {selectionPage}</span>
        <button type="button" className="rounded border px-2 py-1 disabled:opacity-50" disabled={!hasNext || loading}
          onClick={() => onSelectionPage(selectionPage + 1)}>Next</button>
      </div>
      {scope.mode === "selected" && <p className="text-sm text-slate-600">{scope.shopIds.length} shops selected. Selections persist across search pages.</p>}
    </>}
  </section>;
}
