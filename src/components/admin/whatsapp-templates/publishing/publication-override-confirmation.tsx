import type { PublicationPreview } from "@/lib/admin/whatsapp-templates/publishing/types";
export function PublicationOverrideConfirmation({ preview, reviewedImpact, onReviewedImpact, acknowledgeOverrides, onAcknowledgement,
  reason, onReason, busy, onConfirm, clockNowMs }: {
  preview: PublicationPreview; reviewedImpact: boolean; onReviewedImpact: (v: boolean) => void;
  acknowledgeOverrides: boolean; onAcknowledgement: (v: boolean) => void;
  reason: string; onReason: (v: string) => void; busy: boolean; onConfirm: () => void; clockNowMs: number;
}) {
  const stale = Date.parse(preview.expiresAt) <= clockNowMs;
  const conflicts = preview.impactCounts.conflict > 0;
  const override = preview.impactCounts.override > 0;
  const disabled = busy || stale || conflicts || !reviewedImpact || override && !acknowledgeOverrides || reason.trim().length < 8;
  return <section className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4" aria-label="Publication confirmation">
    <h2 className="font-semibold">4. Confirm publication and replacement</h2>
    <p className="text-sm">This operation freezes {preview.totalShops} shops and {preview.totalTargets} language targets. {preview.impactCounts.replaced} previously published versions and {preview.impactCounts.override} local overrides would change.</p>
    {conflicts && <p className="text-sm font-semibold text-red-800" role="alert">Resolve {preview.impactCounts.conflict} ambiguous slots before proceeding.</p>}
    {stale && <p className="text-sm text-red-800" role="alert">Preview has expired; refresh and review impact again.</p>}
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" checked={reviewedImpact} onChange={(e) => onReviewedImpact(e.target.checked)} />
      I have reviewed the exact per-shop/per-language impact summary and acknowledge version replacements.
    </label>
    {override && <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" checked={acknowledgeOverrides} onChange={(e) => onAcknowledgement(e.target.checked)} />
      I explicitly authorise replacing existing shop-specific overrides in the reviewed scope.
    </label>}
    <label className="block text-sm font-medium" htmlFor="publication-reason">Mandatory audit reason</label>
    <textarea id="publication-reason" rows={2} maxLength={1000} value={reason} onChange={(e) => onReason(e.target.value)}
      className="w-full rounded border border-slate-300 bg-white p-2 text-sm" placeholder="Why should these shops receive this template version?" />
    <p className="text-xs text-slate-700">Any changes to approved content or current shop slots between preview and confirmation will be rejected; each shop is independently revalidated during processing.</p>
    <button type="button" onClick={onConfirm} disabled={disabled} className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Confirming…" : "Confirm and create publication operation"}</button>
  </section>;
}
