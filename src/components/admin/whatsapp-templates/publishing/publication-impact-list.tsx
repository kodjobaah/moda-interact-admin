import type { PublicationPreview } from "@/lib/admin/whatsapp-templates/publishing/types";
export function PublicationImpactList({ preview, selectedShopId, onSelect, onPage, busy }: {
  preview: PublicationPreview; selectedShopId: string | null;
  onSelect: (shopId: string) => void; onPage: (page: number) => void; busy: boolean;
}) {
  return <section aria-label="Publication impact by shop" className="min-w-0 space-y-3 rounded-lg border border-slate-200 bg-white p-4">
    <h2 className="font-semibold text-slate-900">Shop impact (page {preview.page})</h2>
    <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm">
      <thead><tr className="border-b"><th scope="col" className="p-2">Shop</th><th scope="col" className="p-2">New</th>
        <th scope="col" className="p-2">Unchanged</th><th scope="col" className="p-2">Replaced</th>
        <th scope="col" className="p-2">Overrides</th><th scope="col" className="p-2">Conflicts</th>
        <th scope="col" className="p-2">Shop brand fields</th><th scope="col" className="p-2">Detail</th></tr></thead>
      <tbody>{preview.shops.map((shop) => <tr key={shop.shopId} className="border-b align-top">
        <td className="max-w-60 break-all p-2">{shop.domain}<span className="block text-xs text-slate-500">{shop.platform}</span></td>
        <td className="p-2">{shop.counts.new}</td><td className="p-2">{shop.counts.unchanged}</td>
        <td className="p-2">{shop.counts.replaced}</td><td className="p-2">{shop.counts.override}</td>
        <td className="p-2">{shop.counts.conflict}</td>
        <td className="min-w-44 p-2"><ul className="space-y-1 text-xs">
          {shop.brand.map((item) => <li key={item.key}>
            <span className="break-all">{item.key}:</span> <strong>
              {item.availability === "configured" ? "Configured" :
                item.availability === "missing" ? "Missing/null (warning)" : "Not verifiable (warning)"}
            </strong>
          </li>)}
          {!shop.brand.length && <li>No shop branding referenced</li>}
        </ul></td><td className="p-2">
          <button type="button" disabled={busy} aria-pressed={selectedShopId === shop.shopId}
            className="text-blue-800 underline disabled:opacity-50" onClick={() => onSelect(shop.shopId)}>Compare languages</button>
        </td>
      </tr>)}</tbody>
    </table></div>
    <div className="flex items-center gap-3 text-sm">
      <button type="button" className="rounded border px-3 py-1 disabled:opacity-50" disabled={preview.page <= 1 || busy} onClick={() => onPage(preview.page - 1)}>Previous page</button>
      <span>Page {preview.page}</span>
      <button type="button" className="rounded border px-3 py-1 disabled:opacity-50" disabled={!preview.hasNext || busy} onClick={() => onPage(preview.page + 1)}>Next page</button>
    </div>
  </section>;
}
