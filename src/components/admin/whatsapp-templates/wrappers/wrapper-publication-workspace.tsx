"use client";

import Link from "next/link";
import type { Audience, WrapperPublicationWorkspace } from "@/lib/admin/whatsapp-templates/wrappers/contracts";
import { WrapperAudienceSelector } from "./wrapper-audience-selector";
import { WrapperActiveSlotSummary } from "./wrapper-active-slot-summary";
import { WrapperBeforeAfterPreview } from "./wrapper-before-after-preview";
import { WrapperActivationConfirmation } from "./wrapper-activation-confirmation";
import { useWrapperPublication } from "./use-wrapper-publication";

export function WrapperPublicationPanel({ workspace, audience }: { workspace: WrapperPublicationWorkspace; audience: Audience }) {
  const controller = useWrapperPublication(workspace, audience);
  const slot = workspace.slots.find((item) => item.audience === audience)!;
  const options = workspace.candidates.filter((item) => item.audience === audience);
  const selected = workspace.candidates.find((item) => item.id === workspace.selectedDefinitionId);
  const valid = !!workspace.proposed && workspace.proposed.audience === audience;
  const languages = workspace.proposed ? Object.keys(workspace.proposed.projections) : ["en"];
  const selectedLanguage = languages.includes(controller.languageTag) ? controller.languageTag : "en";
  return <div className="mx-auto max-w-7xl space-y-5">
    <WrapperAudienceSelector selected={audience} onSelect={controller.selectAudience} />
    <WrapperActiveSlotSummary slots={workspace.slots} history={workspace.history} />
    <section className="space-y-3 rounded-lg border bg-white p-4">
      <h2 className="font-semibold">Choose an immutable wrapper definition</h2>
      <select aria-label="Choose wrapper definition" value={workspace.selectedDefinitionId ?? ""}
        onChange={(event) => controller.selectDefinition(event.target.value)} className="w-full rounded border p-2 text-sm">
        {!workspace.selectedDefinitionId && <option value="">No candidate selected</option>}
        {options.map((candidate) => <option key={candidate.id} value={candidate.id}>
          {candidate.id} · {candidate.publishedAt ? "previously published" : "not yet published"}
          {candidate.eligible ? " · ready" : " · blocked"}</option>)}
      </select>
      <p className="text-xs text-slate-600">Older approved versions from the activation history are also available for audited reactivation.
        Select an older definition from the catalogue using the direct wrapper URL with its <code>definition</code> query parameter.</p>
      {selected && <><p className="break-all text-xs">Selected source SHA-256: {selected.sourceHash}</p>
        {selected.reason && <p role="alert" className="text-sm text-red-700">Not eligible: {selected.reason}</p>}
        <Link className="text-sm text-blue-700 underline" href={`/system-controls/whatsapp-templates?clone=${encodeURIComponent(selected.id)}`}>Clone as New (content changes)</Link></>}
    </section>
    <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-white p-3 text-sm">
      <label className="flex items-center gap-2">Preview language
        <select aria-label="Preview language" value={selectedLanguage} onChange={(event) => controller.setLanguageTag(event.target.value)}
          className="rounded border p-2">{languages.map((tag) => <option key={tag} value={tag}>{tag}</option>)}</select>
      </label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={controller.checkoutAvailable}
        onChange={(event) => controller.setCheckoutAvailable(event.target.checked)} />Example checkout link is available</label>
    </div>
    <WrapperBeforeAfterPreview current={workspace.current} proposed={workspace.proposed} audience={audience}
      languageTag={selectedLanguage} checkoutAvailable={controller.checkoutAvailable} />
    <WrapperActivationConfirmation audience={audience} slot={slot} candidateId={workspace.selectedDefinitionId}
      eligible={valid} busy={controller.busy} reason={controller.reason} onReason={controller.setReason}
      confirmed={controller.confirmed} onConfirm={controller.setConfirmed} onSubmit={controller.activate}
      conflict={controller.conflict} message={controller.message} onRefresh={controller.refreshAfterConflict} />
  </div>;
}
