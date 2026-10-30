"use client";
import type { AuthoringIssue, UrlButton } from "@/lib/admin/whatsapp-templates/authoring/types";
export function TemplateButtonsEditor({ buttons, onChange, issues = [], allowProductUrl = false }: {
  buttons: UrlButton[]; onChange: (value: UrlButton[]) => void; issues?: AuthoringIssue[]; allowProductUrl?: boolean;
}) {
  const maxButtons = allowProductUrl ? 2 : 1;
  const updateButton = (index: number, button: UrlButton) => onChange(buttons.map((current, position) => position === index ? button : current));
  return <section className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4" aria-label="Meta buttons">
    <div><h3 className="font-semibold text-slate-900">Call to action</h3>
      <p className="text-xs text-slate-500">Optional URL buttons. Alternative-product templates may use separate checkout and offer links.</p></div>
    {buttons.map((button, index) => <div key={index} className="grid grid-cols-1 gap-3 border-t border-slate-200 pt-3 sm:grid-cols-2">
      <label className="block text-sm">Button {index + 1} label
        <input aria-label={`Button ${index + 1} label`} className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2" value={button.label}
          maxLength={25} onChange={(e) => updateButton(index, { ...button, label: e.target.value })} />
      </label>
      <label className="block text-sm">HTTPS destination or trusted redirect prefix
        <input aria-label={`Button ${index + 1} HTTPS destination`} type="url" placeholder="https://shop.example.com/redirect?target=" aria-invalid={issues.length > 0}
          className={`mt-1 w-full rounded-md border bg-white p-2 ${issues.length ? "border-amber-500" : "border-slate-300"}`}
          value={button.urlPrefix} onChange={(e) => updateButton(index, { ...button, urlPrefix: e.target.value })} />
      </label>
      <label className="block text-sm sm:col-span-2">Dynamic URL binding
        <select aria-label={`Button ${index + 1} dynamic URL binding`} className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2"
          value={button.variable ?? ""} onChange={(e) => updateButton(index, { ...button,
            ...(e.target.value ? { variable: e.target.value as NonNullable<UrlButton["variable"]> } : { variable: undefined }) })}>
          <option value="">Static destination</option>
          <option value="checkout.url">checkout.url</option>
          {allowProductUrl && <option value="promotion.productUrl">promotion.productUrl</option>}
        </select>
      </label>
      {button.variable && <p className="text-xs text-slate-600 sm:col-span-2">The approved URL value is appended (URL-encoded) to this HTTPS prefix.</p>}
      <button type="button" className="justify-self-start text-sm text-red-700 underline" onClick={() => onChange(buttons.filter((_, position) => position !== index))}>
        Remove button {index + 1}
      </button>
    </div>)}
    {buttons.length < maxButtons && <button type="button" className="text-sm font-medium text-slate-800 underline"
      onClick={() => onChange([...buttons, { type: "url", label: buttons.length === 0 ? "Resume checkout" : "View offer", urlPrefix: "",
        ...(allowProductUrl && buttons.length === 1 ? { variable: "promotion.productUrl" as const } : {}) }])}>
      Add link button
    </button>}
    {!!issues.length && <ul role="alert" className="space-y-1 text-xs text-amber-800">{issues.map((issue, i) => <li key={i}>{issue.message}</li>)}</ul>}
  </section>;
}
