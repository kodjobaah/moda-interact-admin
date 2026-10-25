"use client";

import { useState } from "react";
import { confirmWhatsAppMetaTemplates } from "@/app/actions/whatsapp-template-meta-control";
import type { MetaSubmissionPlan } from "@/lib/admin/whatsapp-templates/meta/contracts";

export function MetaSubmissionConfirmation({ plan, existingRegistrations, onConfirmed }: {
  plan: MetaSubmissionPlan | null; existingRegistrations: number; onConfirmed: () => Promise<void>;
}) {
  const [checked, setChecked] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const locked = pending || existingRegistrations > 0 || !plan;
  const submit = async () => {
    if (!plan || !checked || locked) return;
    // Disable before awaiting: two clicks cannot create simultaneous UI operations.
    setPending(true);
    setResult(null);
    try {
      const answer = await confirmWhatsAppMetaTemplates({ definitionId: plan.definitionId,
        expectedDigest: plan.digest, confirmation: "SUBMIT_TO_META" });
      setResult(answer);
      if (answer.ok) { setChecked(false); await onConfirmed(); }
    } catch { setResult({ ok: false, message: "Submission confirmation could not be recorded. Refresh before retrying." }); }
    finally { setPending(false); }
  };
  return <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4" aria-label="Confirm Meta submission">
    <h2 className="text-lg font-semibold">Confirm immutable submission</h2>
    {existingRegistrations > 0 ? <p role="status" className="text-sm">Registration already exists. It cannot be edited or resubmitted with modified content; use Clone as New for corrections.</p>
      : <p className="text-sm text-slate-600">Confirmation records durable work for Background. Meta acceptance and approval happen later; no language will be published automatically.</p>}
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" checked={checked} disabled={locked} onChange={(event) => setChecked(event.target.checked)} className="mt-1" />
      I reviewed all 20 language versions and understand this submission cannot be edited.
    </label>
    <button type="button" disabled={locked || !checked} onClick={submit}
      className="rounded bg-blue-800 px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
      {pending ? "Recording submission…" : "Confirm submission to Meta"}
    </button>
    {result && <p role="status" className={`text-sm ${result.ok ? "text-emerald-700" : "text-red-700"}`}>{result.message}</p>}
  </section>;
}
