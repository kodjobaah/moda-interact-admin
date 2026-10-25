import type { TemplatePreviewDTO } from "@/lib/admin/whatsapp-templates/authoring/types";

/** Presentation-only example data. No network requests, real customer information or live links. */
export function TemplateReadOnlyPreview({ preview, title = "Example preview", draftInvalid = false }: {
  preview: TemplatePreviewDTO | null;
  title?: string;
  draftInvalid?: boolean;
}) {
  return <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-label="Example template preview">
    <div><h2 className="font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-xs text-slate-500">Illustrative values only — no customer or checkout data is loaded.</p></div>
    <div className="rounded-xl border border-slate-200 bg-[#e7f0e8] p-3 sm:p-5" aria-label="WhatsApp-style preview">
      <div className="mx-auto max-w-sm rounded-xl bg-white p-4 shadow-sm" role="region" aria-label="Example message">
        {!preview ? <p className="text-sm text-slate-600">No preview available.</p> : <>
          {!!preview.header && <p className="mb-2 whitespace-pre-wrap break-words font-semibold text-slate-900">{preview.header}</p>}
          <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{preview.body || "Your message will appear here…"}</p>
          {!!preview.conditional && <p className="mt-2 whitespace-pre-wrap break-words border-l-2 border-blue-200 pl-3 text-sm text-slate-700">{preview.conditional}</p>}
          {!!preview.footer && <p className="mt-2 whitespace-pre-wrap break-words text-xs text-slate-500">{preview.footer}</p>}
          {preview.buttons.map((button, index) => <div key={index} className="mt-3 border-t border-slate-100 pt-3 text-center">
            <span className="text-sm font-semibold text-blue-700">↗ {button.label || "Button label"}</span>
            <p className="mt-1 break-all text-[11px] text-slate-500">{button.url}</p>
          </div>)}
        </>}
      </div>
    </div>
    {!preview ? <p className="text-xs text-slate-600" role="status">A validated example preview is not available.</p>
      : draftInvalid ? <p className="text-xs text-amber-800" role="status">Draft preview only. Correct validation issues before saving; the displayed message is not a validated Meta projection.</p>
      : <p className="text-xs text-emerald-800" role="status">Example based on the validated English definition.</p>}
  </section>;
}
