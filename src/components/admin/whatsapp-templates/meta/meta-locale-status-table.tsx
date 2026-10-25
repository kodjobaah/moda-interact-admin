"use client";

import { useState } from "react";
import { reconcileWhatsAppMetaTemplate, retryWhatsAppMetaTechnicalSubmission } from "@/app/actions/whatsapp-template-meta-control";
import { hasMetaProviderDrift, type MetaStatusView } from "@/lib/admin/whatsapp-templates/meta/contracts";

export function MetaLocaleStatusTable({ status, selectedId, onSelect, onChanged }: {
  status: MetaStatusView; selectedId: string | null; onSelect: (id: string | null) => void;
  onChanged: () => Promise<void>;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ id: string; message: string; ok: boolean } | null>(null);
  const reconcile = async (id: string) => {
    if (pendingId) return;
    setPendingId(id); setOutcome(null);
    try {
      const result = await reconcileWhatsAppMetaTemplate({ definitionId: status.definitionId, registrationId: id });
      setOutcome({ id, ...result });
      if (result.ok) await onChanged();
    } catch { setOutcome({ id, ok: false, message: "Could not request reconciliation." }); }
    finally { setPendingId(null); }
  };
  const retry = async (id: string) => {
    if (pendingId) return;
    setPendingId(id); setOutcome(null);
    try {
      const result = await retryWhatsAppMetaTechnicalSubmission({ definitionId: status.definitionId, registrationId: id });
      setOutcome({ id, ...result });
      if (result.ok) await onChanged();
    } catch { setOutcome({ id, ok: false, message: "Could not request a technical retry." }); }
    finally { setPendingId(null); }
  };
  return <section className="space-y-3 rounded-xl border bg-white p-4" aria-label="Per-language Meta approval status">
    <div><h2 className="text-lg font-semibold">Language approvals and history</h2>
      <p className="text-sm text-slate-600">Select a row to see its latest events. Auto-refresh pauses while selected. Technical retries require Background-confirmed provider absence and never change rejected content.</p></div>
    <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm">
      <thead className="bg-slate-100"><tr><th className="p-2">Locale</th><th className="p-2">Transport</th>
        <th className="p-2">Provider decision</th><th className="p-2">Reason / retry</th><th className="p-2">Provider drift</th><th className="p-2">Actions</th></tr></thead>
      <tbody className="divide-y">{status.registrations.map((row) => <tr key={row.id} className={selectedId === row.id ? "bg-blue-50" : ""}>
        <td className="p-2 font-medium">{row.languageTag}<span className="block text-xs text-slate-500">{row.providerLanguageCode}</span></td>
        <td className="p-2">{row.submissionState}</td>
        <td className="p-2 font-medium">{row.providerStatus ?? "Not yet reported"}</td>
        <td className="p-2">{row.events[0]?.reasonCode ?? row.failureCode ?? "—"}<span className="block text-xs text-slate-500">{row.nextRetryAt ? `Next retry ${row.nextRetryAt}` : ""}</span></td>
        <td className="p-2">{hasMetaProviderDrift(row) ? "Mismatch" : "None reported"}</td>
        <td className="p-2 whitespace-nowrap"><button type="button" className="mr-3 text-blue-800 underline"
          onClick={() => onSelect(selectedId === row.id ? null : row.id)}>{selectedId === row.id ? "Close" : "Events"}</button>
          <button type="button" disabled={!!pendingId || row.submissionState === "READY_TO_SUBMIT"}
            className="text-blue-800 underline disabled:opacity-40" onClick={() => reconcile(row.id)}>{pendingId === row.id ? "Requesting…" : "Reconcile status"}</button>
          {(["UNKNOWN", "FAILED", "SUBMISSION_UNCERTAIN", "RETRYABLE_FAILURE"].includes(row.submissionState) &&
              !row.providerTemplateId && !hasMetaProviderDrift(row) && (!row.providerStatus || row.providerStatus === "UNKNOWN")) &&
            <button type="button" disabled={!!pendingId} className="ml-3 text-blue-800 underline disabled:opacity-40"
              onClick={() => retry(row.id)}>Request technical retry</button>}
          {outcome?.id === row.id && <span role="status" className={outcome.ok ? "block text-emerald-700" : "block text-red-700"}>{outcome.message}</span>}
        </td>
      </tr>)}</tbody>
    </table></div>
    {selectedId && (() => {
      const row = status.registrations.find((candidate) => candidate.id === selectedId);
      return row && <div aria-label="Meta event history" className="space-y-2 rounded border bg-slate-50 p-3 text-sm">
        <h3 className="font-semibold">{row.languageTag} — last {row.events.length} recorded events</h3>
        {row.events.length === 0 && <p>No provider events recorded yet.</p>}
        <ul className="space-y-1">{row.events.map((event) => <li key={event.id} className="break-words">
          <time>{event.receivedAt}</time> · {event.source} / {event.eventType} · {event.outcome ?? "pending"}
          {event.reasonCode ? ` · ${event.reasonCode}` : ""}{event.failureCode ? ` · ${event.failureCode}` : ""}
        </li>)}</ul>
        <p className="text-xs text-slate-600">Stored category: {row.lastObservedCategory ?? "not observed"}; provider template ID: {row.providerTemplateId ?? "not assigned"}</p>
      </div>;
    })()}
    {!status.registrations.length && <p role="status" className="text-sm text-slate-500">No registrations yet. Review all languages and confirm submission first.</p>}
  </section>;
}
