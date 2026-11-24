"use client";

import Link from "next/link";
import { useState } from "react";
import { confirmRecoveryTemplateDefault, reviewRecoveryTemplateDefault } from "@/app/actions/whatsapp-recovery-template-defaults";
import { RECOVERY_DEFAULT_LABELS, type RecoveryDefaultPreview } from "@/lib/admin/whatsapp-templates/recovery-defaults/contracts";

export function RecoveryDefaultSelection({ definitionId }: { definitionId: string }) {
  const [preview, setPreview] = useState<RecoveryDefaultPreview | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  async function review() {
    setBusy(true); setError(""); setSaved(false); setPreview(null);
    try {
      const result = await reviewRecoveryTemplateDefault(definitionId);
      if (result.ok) setPreview(result.data);
      else setError(result.message);
    } catch { setError("Could not load the default review. Retry."); }
    finally { setBusy(false); }
  }
  async function confirm() {
    if (!preview) return;
    setBusy(true); setError("");
    try {
      const result = await confirmRecoveryTemplateDefault({ definitionId, fingerprint: preview.fingerprint,
        issuedAt: preview.issuedAt, reason });
      if (result.ok) { setSaved(true); setPreview(null); setReason(""); }
      else { setError(result.message); setPreview(null); }
    } catch { setError("Could not confirm the default selection. Review current state before retrying."); setPreview(null); }
    finally { setBusy(false); }
  }
  const alreadyDefault = preview?.current?.definitionId === definitionId &&
    preview.current.definitionStatus === "PUBLISHED" && preview.current.publishedAt !== null;
  return <section id="recovery-default" aria-label="Platform recovery default" className="mb-6 space-y-3 rounded-lg border border-slate-200 bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-semibold text-slate-900">Default for future merchants</h2>
      <Link href="/system-controls/whatsapp-templates/defaults" className="text-sm font-medium text-blue-800 underline">View all recovery defaults</Link>
    </div>
    <p className="text-sm text-slate-600">Set this approved multilingual definition as the platform default for its recovery purpose. No merchant is required. Existing shop assignments will not change.</p>
    {error && <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {saved && <p role="status" className="text-sm font-medium text-green-800">Platform default saved. Existing shops were not changed.</p>}
    {!preview && <button type="button" onClick={() => void review()} disabled={busy}
      className="rounded border border-blue-800 px-4 py-2 text-sm font-semibold text-blue-800 disabled:opacity-50">{busy ? "Checking…" : "Review as default"}</button>}
    {preview && <div className="space-y-3 border-t border-slate-200 pt-3">
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div><dt className="text-slate-500">Recovery purpose</dt><dd>{RECOVERY_DEFAULT_LABELS[preview.purpose]}</dd></div>
        <div><dt className="text-slate-500">WABA</dt><dd>{preview.wabaId}</dd></div>
        <div><dt className="text-slate-500">Current default</dt><dd className="break-all">{preview.current?.providerTemplateName ?? preview.current?.definitionId ?? "Not configured"}</dd></div>
        <div><dt className="text-slate-500">Proposed default</dt><dd className="break-all">{preview.providerTemplateName}</dd></div>
        <div><dt className="text-slate-500">Header format</dt><dd>{preview.headerKind}</dd></div>
        <div><dt className="text-slate-500">Verified languages ({preview.languageTags.length})</dt><dd>{preview.languageTags.join(", ")}</dd></div>
      </dl>
      {alreadyDefault ? <p role="status" className="text-sm font-medium text-green-800">This definition is already the verified platform default.</p> : <>
        <label className="block text-sm font-medium text-slate-700">Audit reason
          <input value={reason} onChange={event => setReason(event.target.value)} disabled={busy} maxLength={1000}
            className="mt-1 w-full rounded border border-slate-300 p-2" placeholder="Reason for selecting this default" />
        </label>
        <button type="button" disabled={busy || reason.trim().length < 8} onClick={() => void confirm()}
          className="rounded bg-blue-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : preview.current ? "Replace default" : "Set as default"}</button>
      </>}
      <button type="button" disabled={busy} onClick={() => void review()} className="ml-2 text-sm text-blue-800 underline">Refresh review</button>
    </div>}
  </section>;
}
