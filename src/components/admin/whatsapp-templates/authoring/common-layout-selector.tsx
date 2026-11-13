"use client";
import type { CommonRecoveryLayoutReference } from "@modainteract/moda-interact-shared/commerce/presentation";
import type { TemplateAst } from "@/lib/admin/whatsapp-templates/authoring/types";
import { RECOVERY_SCENARIOS } from "@/lib/admin/whatsapp-templates/authoring/scenarios";

export function CommonLayoutSelector({ draft, choices, onChange }: {
  draft: TemplateAst; choices: CommonRecoveryLayoutReference[]; onChange: (draft: TemplateAst) => void;
}) {
  if (draft.family !== "META_RECOVERY") return null;
  return <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5" aria-label="Common recovery layout">
    <h3 className="font-semibold">Common shop header and checkout footer</h3>
    <p className="text-sm text-slate-600">Choose one reviewed shared layout for Meta, AI and human messages. Changing it creates a new version; it does not change approved messages or activate delivery.</p>
    <label className="block text-sm">Saved common layout
      <select className="mt-1 w-full rounded border p-2" value={draft.commonLayout?.definitionId ?? ""} onChange={event => {
        const selected = choices.find(row => row.definitionId === event.target.value);
        const { commonLayout: previous, ...rest } = draft;
        void previous;
        onChange(selected ? { ...rest, commonLayout: selected, shopBrandMediaRole: draft.shopBrandMediaRole ?? "LOGO" } : rest);
      }}><option value="">Keep existing layout</option>{choices.map(ref => <option key={ref.definitionId} value={ref.definitionId}>{ref.definitionId.slice(-12)} · 20 reviewed languages</option>)}</select>
    </label>
    {!choices.length && <p className="text-sm text-amber-800">No reviewed shared layout is ready. Create a shared wrapper with the shop name and website in its header, only the response in its body, and the checkout link last in its checkout footer; review all 20 languages.</p>}
    {draft.commonLayout && <p className="text-sm text-slate-600">Review any existing inline checkout link or text header explicitly. Product images remain separate from the shop logo. Meta approval is still required for the final composition.</p>}
    <label className="block text-sm">Start from a reviewed scenario body
      <select className="mt-1 w-full rounded border p-2" value="" onChange={event => {
        const selected = RECOVERY_SCENARIOS.find(row => row.id === event.target.value);
        if (!selected || !window.confirm("Replace the unsaved message body with this scenario draft? Existing opt-out text and the selected common layout will be preserved.")) return;
        onChange({ ...structuredClone(selected.draft), header: draft.header, footer: draft.footer, buttons: draft.buttons,
          ...(draft.shopBrandMediaRole ? { shopBrandMediaRole: draft.shopBrandMediaRole } : {}), ...(draft.commonLayout ? { commonLayout: draft.commonLayout } : {}) });
      }}><option value="">Select a scenario…</option>{RECOVERY_SCENARIOS.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}</select>
    </label>
  </section>;
}
