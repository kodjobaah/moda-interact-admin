import type { CompiledTemplateView } from "@/lib/admin/whatsapp-templates/publishing/types";
/** Full frozen projection rather than illustrative sender/sample values. */
export function CompiledTemplateReadOnly({ view, title }: { view: CompiledTemplateView; title: string }) {
  return <div className="min-w-0 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3" aria-label={title}>
    <h4 className="font-semibold text-slate-900">{title}</h4>
    <p className="text-xs text-slate-600">{view.label}</p>
    <dl className="grid grid-cols-1 gap-1 break-all text-sm">
      <dt className="font-medium">Template name</dt><dd>{view.providerTemplateName ?? "Not available"}</dd>
      <dt className="font-medium">Provider language</dt><dd>{view.providerLanguageCode ?? "Not available"}</dd>
      <dt className="font-medium">Meta status</dt><dd>{view.status ?? "Unknown historical status"}</dd>
      <dt className="font-medium">Category</dt><dd>{view.category ?? "Not preserved"}</dd>
    </dl>
    {(["header", "body", "footer"] as const).map((key) => <div key={key}>
      <h5 className="text-sm font-medium capitalize">{key}</h5>
      <p className="break-words whitespace-pre-wrap rounded border border-slate-200 bg-white p-2 text-sm">
        {view[key] ?? (view.provenance === "legacy" ? "Historical content unavailable" : "No component")}</p>
    </div>)}
    <div><h5 className="text-sm font-medium">Ordered buttons</h5>
      {view.buttons === null ? <p className="text-xs">Historical buttons unavailable.</p>
        : view.buttons.length ? <ol className="list-decimal space-y-1 pl-5 text-xs">
          {view.buttons.map((button, i) => <li key={i} className="break-all">{button.text} — {button.url} ({button.type})</li>)}
        </ol> : <p className="text-xs">No buttons</p>}
    </div>
    <div><h5 className="text-sm font-medium">Frozen positional variable bindings</h5>
      {view.bindings === null ? <p className="text-xs">Historical bindings unavailable.</p>
        : <div className="space-y-1 text-xs">
          {(["header", "body", "buttons"] as const).map((section) => <div key={section}>
            <strong className="capitalize">{section}: </strong>
            {view.bindings![section].length ? view.bindings![section].map((b) =>
              `${"position" in b ? b.position : `button ${b.index}`} → ${b.variable}`).join("; ") : "None"}
          </div>)}
        </div>}
    </div>
  </div>;
}
