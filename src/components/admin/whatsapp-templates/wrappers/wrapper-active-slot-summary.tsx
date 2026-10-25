import type { WrapperActivationHistory, WrapperSlot } from "@/lib/admin/whatsapp-templates/wrappers/contracts";

export function WrapperActiveSlotSummary({ slots, history }: { slots: WrapperSlot[]; history: WrapperActivationHistory[] }) {
  return <section className="space-y-3 rounded-lg border bg-white p-4" aria-label="Current wrapper activation">
    <h2 className="text-lg font-semibold">Active pointers and fallback</h2>
    <div className="grid gap-3 lg:grid-cols-3">{slots.map((slot) => <article key={slot.audience} className="min-w-0 rounded border p-3">
      <h3 className="font-semibold">{slot.audience}</h3>
      <p className="mt-1 text-xs text-slate-600">{slot.definitionId ? "Direct override / pointer" : slot.effectiveFrom === "SHARED" ? "Using SHARED fallback" : "Not configured"}</p>
      <p className="mt-2 break-all text-xs">Effective: {slot.effectiveDefinitionId ?? "Unavailable"}</p>
      <p className="mt-1 text-xs text-slate-500">Direct version: {slot.editVersion ?? "none"}
        {slot.updatedAt ? ` · Updated ${new Date(slot.updatedAt).toLocaleString()}` : ""}</p>
    </article>)}</div>
    <details className="text-sm"><summary className="cursor-pointer font-medium">Activation history ({history.length} recent)</summary>
      <div className="mt-3 max-h-72 space-y-3 overflow-auto">{history.length === 0 && <p>No activation records yet.</p>}
        {history.map((item, i) => <div key={`${item.createdAt}-${item.audience}-${i}`} className="rounded border p-2">
          <p><strong>{item.audience}</strong> · {new Date(item.createdAt).toLocaleString()} · version {item.editVersion}</p>
          <p className="break-all text-xs">{item.previousDefinitionId ?? "(new slot)"} → {item.newDefinitionId}</p>
          <p className="text-xs text-slate-600">Reason: {item.reason}</p>
        </div>)}</div>
    </details>
  </section>;
}
