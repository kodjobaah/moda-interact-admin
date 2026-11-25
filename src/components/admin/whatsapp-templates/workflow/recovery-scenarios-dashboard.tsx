import Link from "next/link";
import { RECOVERY_SCENARIOS } from "@/lib/admin/whatsapp-templates/authoring/scenarios";
import { RECOVERY_DEFAULT_FORMATS } from "@/lib/admin/whatsapp-templates/recovery-defaults/contracts";
import { layoutLabel, stageHint, workflowHref, WORKFLOW_ROOT, type WorkflowOverview } from "@/lib/admin/whatsapp-templates/workflow/contracts";

export function RecoveryScenariosDashboard({ overview }: { overview: WorkflowOverview }) {
  const configured = (format: string) => overview.facts.filter(f => f.format === format && f.definitionId === f.defaultDefinitionId).length;
  return <section className="mx-auto max-w-7xl space-y-5" aria-label="Recovery scenarios">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h2 className="text-lg font-semibold">Recovery templates</h2>
        <p className="mt-1 text-sm text-slate-600">{overview.wabaId ? `TEXT ${configured("TEXT")}/6 required defaults · IMAGE ${configured("IMAGE")}/6 optional defaults · WABA ${overview.wabaId}` : "Sender configuration unavailable — approval and default counts cannot be verified."}</p>
        <p className="mt-1 text-sm">{overview.activeLayout ? `Active common layout · ${overview.activeLayout.createdAt}` : "No common layout is active."}</p></div>
      <div className="flex flex-wrap gap-3 text-sm text-blue-800">
        <Link className="underline" href={`${WORKFLOW_ROOT}?history=1`}>All template versions</Link>
        <Link className="underline" href={`${WORKFLOW_ROOT}/wrappers`}>Conversation layouts</Link>
        <Link className="underline" href={`${WORKFLOW_ROOT}/common-activation`}>Coordinated activation</Link>
        <Link className="underline" href={`${WORKFLOW_ROOT}/defaults`}>Recovery defaults</Link>
      </div>
    </header>
    <p className="text-sm text-slate-600">Configure the TEXT fallback for every scenario. IMAGE is preferred when verified media is available. Each format has independent defaults and shop assignments; publishing one does not replace the other.</p>
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {RECOVERY_SCENARIOS.map(scenario => {
        const rows = overview.facts.filter(f => f.purpose === scenario.id);
        const image = rows.find(f => f.format === "IMAGE" && f.definitionId === f.defaultDefinitionId) ?? rows.find(f => f.format === "IMAGE" && f.latestCandidate);
        return <article key={scenario.id} className="flex flex-col gap-4 rounded-xl border bg-white p-5">
          <h3 className="font-semibold text-slate-900">{scenario.label}</h3>
          {RECOVERY_DEFAULT_FORMATS.map(format => {
            const current = rows.find(f => f.format === format && f.definitionId === f.defaultDefinitionId);
            const latest = rows.find(f => f.format === format && f.latestCandidate);
            const work = latest ?? current;
            const create = `${WORKFLOW_ROOT}?create=1&scenario=${scenario.id}&format=${format}`;
            const cloneText = image && `${WORKFLOW_ROOT}?clone=${encodeURIComponent(image.definitionId)}&format=TEXT`;
            return <section key={format} className="space-y-3 rounded-lg border p-3 text-sm" aria-label={`${format} configuration`}>
              <h4 className="font-semibold">{format === "TEXT" ? "TEXT — required fallback" : "IMAGE — optional enhancement"}</h4>
              <div className="rounded bg-slate-50 p-2"><p className="font-medium">Default for future shops</p>
                {current ? <><Link className="break-all text-blue-800 underline" href={workflowHref(current.definitionId)}>{current.providerTemplateName ?? "View configured definition"}</Link>
                  <p className="mt-1 text-xs text-slate-600">{current.status} · {layoutLabel(current)} · {current.approvedCount}/20 approved observations</p>
                  <p className="mt-1 text-xs">{current.assignedShops} shops linked to this version.</p></> :
                  <p className={format === "TEXT" && overview.wabaId ? "text-amber-800" : "text-slate-600"}>{overview.wabaId ? "Not configured" : "Unknown — sender unavailable"}</p>}
              </div>
              {work && <div className="space-y-1"><p className="font-medium">{latest ? "Latest checkout version" : "Configured version"}</p>
                <p className="break-all text-xs text-slate-600">{work.providerTemplateName ?? work.definitionId}</p>
                <p className="text-xs text-slate-600">{layoutLabel(work)}</p>
                <p>Translations {work.translatedCount}/19 · Reviewed {work.reviewedCount}/20 · Meta {work.approvedCount}/20</p>
                {overview.wabaId && <p>{work.assignedShops} shops linked to this version · {work.otherAssignedShops} shops with other {format} versions.</p>}
                {work.publicationStatus && <p>Publication: {work.publicationStatus}</p>}
              </div>}
              <div className="flex flex-wrap items-center gap-3">
                <Link className="rounded bg-blue-800 px-3 py-2 font-semibold text-white" href={work ? workflowHref(work.definitionId) : format === "TEXT" && cloneText ? cloneText : create}>{work ? stageHint(work) : `Create ${format} version`}</Link>
                {format === "TEXT" && cloneText && work && <Link className="text-blue-800 underline" href={cloneText}>Clone IMAGE as TEXT</Link>}
                {work && !work.retired && work.sourceMatchesActive && work.approvedCount === 20 && <>
                  <Link className="text-blue-800 underline" href={workflowHref(work.definitionId,"publish",false,"future")}>Set or replace default</Link>
                  <Link className="text-blue-800 underline" href={workflowHref(work.definitionId,"publish",false,"one")}>Assign to specific shops</Link>
                </>}
                {current && current.definitionId !== work?.definitionId && !current.retired && <Link className="text-blue-800 underline" href={workflowHref(current.definitionId,"publish",false,"one")}>Assign current default to shops</Link>}
                {work && <Link className="text-blue-800 underline" href={`${WORKFLOW_ROOT}?clone=${encodeURIComponent(work.definitionId)}&format=${format}`}>Clone as New</Link>}
              </div>
            </section>;
          })}
          <div className="mt-auto space-y-1 text-sm"><p className="font-medium">Existing shop assignments</p><div className="flex flex-wrap gap-3">
            <Link className="text-blue-800 underline" href={`${WORKFLOW_ROOT}/assignments?scenario=${scenario.id}`}>View shop assignments</Link>
            <Link className="text-blue-800 underline" href={`${WORKFLOW_ROOT}?history=1&scenario=${scenario.id}`}>Version history</Link></div>
          </div>
        </article>;
      })}
    </div>
    <p className="text-xs text-slate-500">Counts describe stored observations for the configured sender, not current publication or send eligibility. Unknown legacy assignments are visible in the shop inventory. Other assigned versions are not necessarily deliberate overrides.</p>
  </section>;
}
