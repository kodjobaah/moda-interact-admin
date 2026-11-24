"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveWhatsAppReviewedTranslations } from "@/app/actions/whatsapp-template-compilation";
import type { ReviewWorkspaceDTO } from "@/lib/admin/whatsapp-templates/compilation/contracts";
import { SourceTranslationComparison } from "../compilation/source-translation-comparison";
import { ComponentAndVariableDiff } from "../compilation/component-and-variable-diff";

/** The operator explicitly selects reviewed previews. The server checks each
 * digest and run identity again; no translation is approved just by arriving. */
export function ConsolidatedTranslationReview({ workspace, disabled = false }: { workspace: ReviewWorkspaceDTO; disabled?: boolean }) {
  const router = useRouter();
  const [selected,setSelected] = useState<string[]>([]);
  const [ack,setAck] = useState(false);
  const [message,setMessage] = useState("");
  const [busy,startTransition] = useTransition();
  const inFlight = useRef(false);
  const ready = workspace.locales.filter(locale => locale.languageTag !== "en" && locale.status === "READY" && locale.preview && locale.runId && locale.contentHash);
  const chosen = ready.filter(locale => selected.includes(locale.languageTag));
  const runId = chosen[0]?.runId;
  const valid = !!runId && chosen.length > 0 && chosen.every(locale => locale.runId === runId && locale.contentHash);
  if (!ready.length) return null;
  const change = (tags: string[]) => { setSelected(tags); setAck(false); setMessage(""); };
  const approve = () => {
    if (disabled || inFlight.current || !valid || !ack || !runId) return;
    inFlight.current = true; setMessage("");
    startTransition(async () => {
      try {
        const result = await approveWhatsAppReviewedTranslations({ definitionId: workspace.definitionId, runId,
          acknowledged: true, locales: chosen.map(locale => ({ languageTag: locale.languageTag, contentHash: locale.contentHash! })) });
        if (result.ok) { setSelected([]); setAck(false); setMessage(`${result.approved} approved, ${result.replayed} already reviewed. Refreshing saved state.`); }
        else setMessage(result.message);
      } catch { setMessage("Review response unavailable. Refresh the saved state before retrying."); }
      finally { inFlight.current = false; router.refresh(); }
    });
  };
  return <section aria-label="Consolidated translation review" className="space-y-3 rounded-lg border bg-white p-4">
    <h2 className="text-lg font-semibold">Review translations together</h2>
    <p className="text-sm text-slate-600">Open each available preview and compare it with English. Select only languages you have reviewed. You can approve the selected set in one operation; rejected or invalid languages still require individual attention.</p>
    <div className="flex flex-wrap gap-3 text-sm"><button type="button" disabled={busy||disabled} onClick={()=>change(ready.map(locale=>locale.languageTag))} className="text-blue-800 underline disabled:opacity-50">Select all reviewed previews</button>
      <button type="button" disabled={busy||disabled} onClick={()=>change([])} className="text-blue-800 underline disabled:opacity-50">Clear selection</button><span>{chosen.length}/{ready.length} selected</span></div>
    {ready.map(locale=><div key={locale.languageTag} className="rounded border p-3">
      <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" disabled={busy||disabled} checked={selected.includes(locale.languageTag)} onChange={e=>change(e.target.checked?[...selected,locale.languageTag]:selected.filter(tag=>tag!==locale.languageTag))}/>Mark {locale.languageTag} reviewed</label>
      <details className="mt-2"><summary className="cursor-pointer text-sm text-blue-800">Compare {locale.languageTag} with English</summary><div className="mt-3 space-y-3"><SourceTranslationComparison source={workspace.source} translation={locale}/><ComponentAndVariableDiff source={workspace.source} translation={locale}/></div></details>
    </div>)}
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" disabled={busy||disabled||!valid} checked={ack} onChange={e=>setAck(e.target.checked)}/>I have reviewed the selected translations and confirm that their text and protected variables should be frozen.</label>
    <button type="button" disabled={busy||disabled||!valid||!ack} onClick={approve} className="rounded bg-blue-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy?"Approving…":`Approve ${chosen.length} reviewed translations`}</button>
    {message && <p role="status" className="text-sm">{message}</p>}
    <p className="text-xs text-slate-500">This action neither submits to Meta nor publishes to shops.</p>
  </section>;
}
