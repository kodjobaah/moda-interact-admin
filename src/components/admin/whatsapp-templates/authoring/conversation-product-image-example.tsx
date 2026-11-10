/** Local illustration only: never accepts or fetches a merchant image URL. */
export function ConversationProductImageExample() {
  return <figure className="mb-3 overflow-hidden rounded-lg border border-slate-200 bg-slate-50" aria-label="Optional product image illustration">
    <svg viewBox="0 0 1125 600" role="img" aria-label="Illustrative product image above the complete response" className="w-full">
      <rect width="1125" height="600" fill="#eef2f5" />
      <rect x="412" y="165" width="300" height="275" rx="18" fill="#94a3b8" />
      <path d="M412 215h300M562 165v275" stroke="#e2e8f0" strokeWidth="12" />
    </svg>
    <figcaption className="px-3 py-2 text-xs text-slate-600">Optional product image — illustration only. One verified image appears above the complete response when available.</figcaption>
  </figure>;
}
