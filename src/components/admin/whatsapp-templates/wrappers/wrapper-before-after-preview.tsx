import { renderWrapperPreview, EXAMPLE_RESPONSES } from "@/lib/admin/whatsapp-templates/wrappers/preview";
import type { Audience, WrapperPreviewDefinition } from "@/lib/admin/whatsapp-templates/wrappers/contracts";

function FullWrapperCard({ definition, languageTag, checkoutAvailable, audience, title }: {
  definition: WrapperPreviewDefinition | null; languageTag: string; checkoutAvailable: boolean;
  audience: Audience; title: string;
}) {
  const prepared = definition?.projections[languageTag];
  if (!prepared) return <article className="min-w-0 rounded border p-4"><h3 className="font-semibold">{title}</h3>
    <p className="mt-2 text-sm text-amber-800">No validated prepared wrapper is available for this language.</p></article>;
  const result = renderWrapperPreview(prepared, {
    response: EXAMPLE_RESPONSES[audience], checkoutAvailable, context: { kind: "FICTIONAL" },
  });
  return <article className="min-w-0 space-y-3 rounded border bg-white p-4">
    <h3 className="font-semibold">{title}</h3>
    <p className="break-all text-xs text-slate-500">Definition: {definition.id}</p>
    <p className="text-xs text-slate-600">Audience: {definition.audience} · First published: {definition.publishedAt
      ? new Date(definition.publishedAt).toLocaleString() : "Not yet activated"}</p>
    <p className="rounded border border-amber-300 bg-amber-50 p-2 text-xs font-medium text-amber-900">
      Fictional example only — brand, customer and checkout values below are not merchant data.
    </p>
    <div className="space-y-2 text-sm">
      <div><strong>Header</strong><p className="whitespace-pre-wrap break-words">{result.header || "(none)"}</p></div>
      <div><strong>Response (illustrative insertion, not stored)</strong><p className="whitespace-pre-wrap break-words">{result.body}</p></div>
      <div><strong>Footer</strong><p className="whitespace-pre-wrap break-words">{result.footer || "(none)"}</p></div>
      <div><strong>Checkout conditional</strong><p className="whitespace-pre-wrap break-words">{result.conditional ?? "Omitted — checkout unavailable or stale"}</p></div>
    </div>
    <details className="text-xs"><summary className="cursor-pointer font-medium">Typed variable bindings and availability ({result.disclosures.length})</summary>
      <ul className="mt-2 list-inside list-disc space-y-1">{result.disclosures.map((entry, i) =>
        <li key={`${entry.name}-${i}`} className="break-words"><code>{entry.name}</code> · {entry.placement} · {entry.availability}</li>)}</ul>
      <p className="mt-2 text-amber-800">No ShopBrand record is loaded. Nullable fields are unknown; missing real values must not be invented at send time.</p>
    </details>
  </article>;
}

export function WrapperBeforeAfterPreview({ current, proposed, languageTag, checkoutAvailable, audience }: {
  current: WrapperPreviewDefinition | null; proposed: WrapperPreviewDefinition | null;
  languageTag: string; checkoutAvailable: boolean; audience: Audience;
}) {
  return <section aria-label="Before and after wrapper review" className="space-y-3">
    <h2 className="text-lg font-semibold">Before / after · {languageTag}</h2>
    <div className="grid gap-4 lg:grid-cols-2">
      <FullWrapperCard title="Currently effective" definition={current} languageTag={languageTag}
        checkoutAvailable={checkoutAvailable} audience={audience} />
      <FullWrapperCard title="Proposed activation" definition={proposed} languageTag={languageTag}
        checkoutAvailable={checkoutAvailable} audience={audience} />
    </div>
  </section>;
}
