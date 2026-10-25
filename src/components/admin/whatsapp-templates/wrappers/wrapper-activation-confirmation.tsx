import type { Audience, WrapperSlot } from "@/lib/admin/whatsapp-templates/wrappers/contracts";

export function WrapperActivationConfirmation({ audience, slot, candidateId, eligible, busy,
  reason, onReason, confirmed, onConfirm, onSubmit, conflict, message, onRefresh }: {
  audience: Audience; slot: WrapperSlot; candidateId: string | null; eligible: boolean; busy: boolean;
  reason: string; onReason: (reason: string) => void; confirmed: boolean;
  onConfirm: (checked: boolean) => void; onSubmit: () => void;
  conflict: boolean; message: string | null; onRefresh: () => void;
}) {
  const unchanged = !!candidateId && candidateId === slot.definitionId;
  return <section aria-label="Wrapper activation confirmation" className="space-y-3 rounded-lg border bg-white p-4">
    <h2 className="text-lg font-semibold">Confirm platform activation</h2>
    <p className="text-sm">Audience: <strong>{audience}</strong> · Expected direct pointer version: {slot.editVersion ?? "not created"}.</p>
    <p className="break-all text-xs text-slate-600">Replacing: {slot.definitionId ?? "No direct pointer"} → {candidateId ?? "Not selected"}</p>
    <p className="text-sm text-amber-900">This changes the global pointer for future replies. Already-sent replies, existing checkouts and immutable template text are unchanged. A prior reviewed version can be reactivated, but edits require Clone as New.</p>
    <label className="block text-sm font-medium" htmlFor="wrapper-activation-reason">Reason for replacement/reactivation</label>
    <textarea id="wrapper-activation-reason" value={reason} onChange={(event) => onReason(event.target.value)}
      maxLength={500} rows={3} className="w-full rounded border p-2 text-sm"
      placeholder="Explain the reason for activating this definition (minimum 10 characters)" />
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed}
      onChange={(event) => onConfirm(event.target.checked)} className="mt-1" />
      <span>I reviewed the selected language and fallback impact. Activate the immutable, fully reviewed 20-language definition.</span></label>
    {message && <p role={conflict ? "alert" : "status"} className={conflict ? "text-sm text-red-700" : "text-sm text-slate-700"}>{message}</p>}
    {conflict && <div className="space-y-2"><p className="text-sm font-medium text-red-700">Stale activation/version conflict — refresh and compare again; no replacement was committed.</p>
      <button type="button" onClick={onRefresh} className="rounded border px-3 py-2 text-sm font-semibold">Reload latest pointer for review</button></div>}
    <button type="button" onClick={onSubmit} disabled={!eligible || !candidateId || unchanged || busy || conflict || !confirmed || reason.trim().length < 10}
      className="rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400">
      {busy ? "Activating…" : "Activate reviewed wrapper"}
    </button>
    {unchanged && <p className="text-xs text-slate-600">This definition is already directly active for the chosen audience.</p>}
  </section>;
}
