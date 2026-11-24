import Link from "next/link";
import { RECOVERY_SCENARIOS } from "@/lib/admin/whatsapp-templates/authoring/scenarios";
import { layoutLabel, stageHint, workflowHref, WORKFLOW_ROOT, type WorkflowOverview } from "@/lib/admin/whatsapp-templates/workflow/contracts";

export function RecoveryScenariosDashboard({ overview }: { overview: WorkflowOverview }) {
  const configured = overview.facts.filter(f => f.definitionId === f.defaultDefinitionId).length;
  return <section className="mx-auto max-w-7xl space-y-5" aria-label="Recovery scenarios">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h2 className="text-lg font-semibold">Recovery templates</h2>
        <p className="mt-1 text-sm text-slate-600">{overview.wabaId ? `${configured} of 6 platform defaults configured · WABA ${overview.wabaId}` : "Sender configuration unavailable — approval and default counts cannot be verified."}</p>
        <p className="mt-1 text-sm">{overview.activeLayout ? `Active common layout · ${overview.activeLayout.createdAt}` : "No common layout is active."}</p></div>
      <div className="flex flex-wrap gap-3 text-sm text-blue-800">
        <Link className="underline" href={`${WORKFLOW_ROOT}?history=1`}>All template versions</Link>
        <Link className="underline" href={`${WORKFLOW_ROOT}/wrappers`}>Conversation layouts</Link>
        <Link className="underline" href={`${WORKFLOW_ROOT}/common-activation`}>Coordinated activation</Link>
        <Link className="underline" href={`${WORKFLOW_ROOT}/defaults`}>Recovery defaults</Link>
      </div>
    </header>
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {RECOVERY_SCENARIOS.map(scenario => {
        const rows = overview.facts.filter(f => f.purpose === scenario.id);
        const current = rows.find(f => f.definitionId === f.defaultDefinitionId);
        const latest = rows.find(f => f.latestCandidate);
        const work = latest ?? current;
        const create = `${WORKFLOW_ROOT}?create=1&scenario=${scenario.id}`;
        return <article key={scenario.id} className="flex flex-col gap-4 rounded-xl border bg-white p-5">
          <h3 className="font-semibold text-slate-900">{scenario.label}</h3>
          <div className="rounded-lg bg-slate-50 p-3 text-sm">
            <p className="font-medium">Default for future shops</p>
            {current ? <><Link className="break-all text-blue-800 underline" href={workflowHref(current.definitionId)}>{current.providerTemplateName ?? "View configured definition"}</Link>
              <p className="mt-1 text-xs text-slate-600">{current.status} · {layoutLabel(current)} · {current.approvedCount}/20 approved observations</p>
              <p className="mt-1 text-xs">{current.assignedShops} shops have assignments linked to this version.</p></> :
              <p className="mt-1 text-slate-600">{overview.wabaId ? "Not configured" : "Unknown — sender unavailable"}</p>}
          </div>
          <div className="text-sm"><p className="font-medium">Existing shop assignments</p>
            <p className="text-xs text-slate-600">{overview.wabaId ? work ? `${work.otherAssignedShops} shops have other or unlinked versions for this scenario.` : "Inspect existing assignments for this scenario." : "Unknown — sender unavailable"}</p>
            <div className="mt-1 flex flex-wrap gap-3"><Link className="text-blue-800 underline" href={`${WORKFLOW_ROOT}/assignments?scenario=${scenario.id}`}>View shop assignments</Link>
            <Link className="text-blue-800 underline" href={`${WORKFLOW_ROOT}?history=1&scenario=${scenario.id}`}>Choose a version for a shop</Link></div>
          </div>
          {work ? <div className="space-y-2 text-sm">
            <p className="font-medium">{latest ? "Latest checkout version" : "Configured version"}</p>
            <p className="break-all text-xs text-slate-600">{work.providerTemplateName ?? work.definitionId}</p>
            <p className="text-xs text-slate-600">{work.createdAt.toISOString()} · {layoutLabel(work)}</p>
            <p>Translations {work.translatedCount}/19 · Reviewed {work.reviewedCount}/20 · Meta {work.approvedCount}/20</p>
            {overview.wabaId && <p>{work.assignedShops} shops have assignments linked to this version.</p>}
            {work.publicationStatus && <p>Publication: {work.publicationStatus}</p>}
          </div> : <p className="text-sm text-slate-600">No saved checkout template for this scenario.</p>}
          <div className="mt-auto flex flex-wrap gap-3 text-sm">
            <Link className="rounded bg-blue-800 px-3 py-2 font-semibold text-white" href={work ? workflowHref(work.definitionId) : create}>{work ? stageHint(work) : "Create template"}</Link>
            {work && !work.retired && work.sourceMatchesActive && work.approvedCount === 20 && <>
              <Link className="self-center text-blue-800 underline" href={workflowHref(work.definitionId, "publish", false, "future")}>Set or replace default</Link>
              <Link className="self-center text-blue-800 underline" href={workflowHref(work.definitionId, "publish", false, "one")}>Assign to specific shops</Link>
            </>}
            {current && current.definitionId !== work?.definitionId && !current.retired && <Link className="self-center text-blue-800 underline" href={workflowHref(current.definitionId, "publish", false, "one")}>Assign current default to shops</Link>}
            {work && <Link className="self-center text-blue-800 underline" href={create}>Create new version</Link>}
            {work && <Link className="self-center text-blue-800 underline" href={`${WORKFLOW_ROOT}?clone=${encodeURIComponent(work.definitionId)}`}>Clone as New</Link>}
            <Link className="self-center text-blue-800 underline" href={`${WORKFLOW_ROOT}?history=1&scenario=${scenario.id}`}>Version history</Link>
          </div>
        </article>;
      })}
    </div>
    <p className="text-xs text-slate-500">Counts describe saved evidence for one version and the configured sender. Layout references and provider observations are progress indicators, not publication or send eligibility. Shop counts indicate stored approved/enabled variants (not complete coverage or send eligibility); other versions can include alternate headers, promotion targets, historical assignments or overrides.</p>
  </section>;
}
