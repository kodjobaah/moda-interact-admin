"use client";

import type { ReviewDecision, ReviewLocaleDTO } from "@/lib/admin/whatsapp-templates/compilation/contracts";

export function TranslationReviewActions({ locale, busy, message, onDecision }: {
  locale: ReviewLocaleDTO; busy: boolean; message: string | null;
  onDecision: (decision: ReviewDecision) => void;
}) {
  const valid = !!locale.runId && !!locale.preview && locale.status === "READY";
  const rejectable = !!locale.runId && ["READY", "REJECTED", "INVALID"].includes(locale.status);
  return <section aria-label="Translation review actions" className="space-y-2 rounded-lg border bg-white p-4">
    <h2 className="font-semibold">Review decision</h2>
    <p className="text-sm text-slate-600">Approval freezes this locale permanently. To change its text later, Clone as New.</p>
    {locale.status === "SOURCE" && <p className="text-sm">The saved English source cannot be reviewed or modified here.</p>}
    {locale.status === "REJECTED" && <p role="status" className="text-sm text-red-700">Rejected. Clone as New to replace this content.</p>}
    {locale.status === "APPROVED" && <p role="status" className="text-sm text-emerald-800">Approved and immutable.</p>}
    {locale.reason && <p role="alert" className="text-sm text-red-700">{locale.reason}</p>}
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={!valid || busy} onClick={() => onDecision("APPROVE")}
        className="rounded bg-blue-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Approve and freeze</button>
      <button type="button" disabled={!rejectable || busy} onClick={() => onDecision("REJECT")}
        className="rounded border border-red-700 px-4 py-2 text-sm font-semibold text-red-800 disabled:opacity-40">Reject translation</button>
    </div>
    {busy && <p role="status" className="text-sm">Saving review…</p>}
    {message && <p role="status" className="text-sm text-slate-700">{message}</p>}
  </section>;
}
