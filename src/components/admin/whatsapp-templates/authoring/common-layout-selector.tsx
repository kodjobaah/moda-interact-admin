"use client";
import type { CommonLayoutChoice } from "@/lib/admin/whatsapp-templates/authoring/common-layout-reads";
import { applyCommonLayoutChoice } from "@/lib/admin/whatsapp-templates/authoring/draft-operations";
import type { TemplateAst } from "@/lib/admin/whatsapp-templates/authoring/types";
import { RECOVERY_SCENARIOS } from "@/lib/admin/whatsapp-templates/authoring/scenarios";

export function CommonLayoutSelector({ draft, choices, onChange }: {
  draft: TemplateAst; choices: CommonLayoutChoice[]; onChange: (draft: TemplateAst) => void;
}) {
  if (draft.family !== "META_RECOVERY") return null;
  return <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5" aria-label="Common recovery layout">
    <h3 className="font-semibold">Common shop header and checkout footer</h3>
    <p className="text-sm text-slate-600">Choose one reviewed shared layout for Meta, AI and human messages. Changing it creates a new version; it does not change approved messages or activate delivery.</p>
    <label className="block text-sm">Saved common layout
      <select className="mt-1 w-full rounded border p-2" value={draft.commonLayout?.definitionId ?? ""} onChange={event => {
        const selected = choices.find(row => row.definitionId === event.target.value);
        if (selected) onChange(applyCommonLayoutChoice(draft, selected));
      }}><option value="" disabled>Choose a reviewed common layout</option>
        {draft.commonLayout && !choices.some(ref => ref.definitionId === draft.commonLayout?.definitionId) &&
          <option value={draft.commonLayout.definitionId} disabled>Historical layout · {draft.commonLayout.definitionId.slice(-12)} · unavailable for new selection</option>}
        {choices.map(ref => <option key={ref.definitionId} value={ref.definitionId}>{ref.createdAt} · {ref.active ? "Active · " : ""}{ref.definitionId.slice(-12)} · 20 reviewed languages</option>)}</select>
    </label>
    {!choices.length && <p className="text-sm text-amber-800">No reviewed shared layout is ready. Create a shared wrapper with the shop name in its header, only the response in its body, and the clickable website before the final checkout link in its checkout-aware footer; review all 20 languages.</p>}
    {draft.commonLayout && <p className="text-sm text-slate-600">Review any existing inline checkout link or text header explicitly. Use no header for TEXT fallback, or select a genuine logo for IMAGE. Product images remain separate from the shop logo. Meta approval is still required for the final composition.</p>}
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
