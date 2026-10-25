"use client";
import type { AuthoringIssue, UrlButton } from "@/lib/admin/whatsapp-templates/authoring/types";
export function TemplateButtonsEditor({ buttons, onChange, issues = [] }: {
  buttons: UrlButton[]; onChange: (value: UrlButton[]) => void; issues?: AuthoringIssue[];
}) {
  const button = buttons[0];
  return <section className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4" aria-label="Meta buttons">
    <div><h3 className="font-semibold text-slate-900">Call to action</h3>
      <p className="text-xs text-slate-500">Optional WhatsApp link button, limited to one.</p></div>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!button}
      onChange={(e) => onChange(e.target.checked ? [{ type: "url", label: "Return to checkout", urlPrefix: "" }] : [])} /> Add a link button</label>
    {button && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="block text-sm">Button label
        <input aria-label="Button label" className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2" value={button.label}
          maxLength={25} onChange={(e) => onChange([{ ...button, label: e.target.value }])} />
      </label>
      <label className="block text-sm">HTTPS destination or trusted redirect prefix
        <input aria-label="HTTPS button destination" type="url" placeholder="https://shop.example.com/checkout" aria-invalid={issues.length > 0}
          className={`mt-1 w-full rounded-md border bg-white p-2 ${issues.length ? "border-amber-500" : "border-slate-300"}`}
          value={button.urlPrefix} onChange={(e) => onChange([{ ...button, urlPrefix: e.target.value }])} />
      </label>
      <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" className="mt-1"
        checked={!!button.variable} onChange={(e) => onChange([{ type: "url", label: button.label, urlPrefix: button.urlPrefix,
          ...(e.target.checked ? { variable: "checkout.url" as const } : {}) }])} />
        Append the typed checkout.url parameter (URL-encoded) to a trusted HTTPS redirect prefix.
      </label>
    </div>}
    {!!issues.length && <ul role="alert" className="space-y-1 text-xs text-amber-800">{issues.map((issue, i) => <li key={i}>{issue.message}</li>)}</ul>}
  </section>;
}
