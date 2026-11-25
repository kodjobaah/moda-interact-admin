import { RecoveryScenariosDashboard } from "@/components/admin/whatsapp-templates/workflow/recovery-scenarios-dashboard";
import { readRecoveryWorkflow } from "@/lib/admin/whatsapp-templates/workflow/reads";
import { RECOVERY_SCENARIOS } from "@/lib/admin/whatsapp-templates/authoring/scenarios";
import { prisma } from "@/lib/prisma";
import { listCommonLayoutChoices } from "@/lib/admin/whatsapp-templates/authoring/common-layout-reads";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { TemplateCatalogue } from "@/components/admin/whatsapp-templates/authoring/template-catalogue";
import { TemplateSavedDetail } from "@/components/admin/whatsapp-templates/authoring/template-saved-detail";
import { TemplateAuthoringWorkspace } from "@/components/admin/whatsapp-templates/authoring/template-authoring-workspace";
import { requirePlatformAdminPage } from "@/lib/auth/platform-admin";
import { ScenarioCoverageSummary } from "@/components/admin/whatsapp-templates/authoring/scenario-coverage";
import { getDefinitionDetail, listDefinitions, getScenarioCoverage, getDynamicLayoutCoverage } from "@/lib/admin/whatsapp-templates/authoring/reads";

export const dynamic = "force-dynamic";
type SearchParams = { definition?: string | string[]; clone?: string | string[]; create?: string | string[];
  search?: string | string[]; page?: string | string[]; kind?: string | string[]; status?: string | string[]; history?: string | string[]; scenario?: string | string[]; format?: string | string[] };
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

/** The catalogue is a dedicated view; authoring/editing cannot share its narrow sidebar. */
export default async function WhatsAppTemplatesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const principal = await requirePlatformAdminPage();
  if (principal.role !== "SUPER_ADMIN") notFound();
  const params = await searchParams;
  const selectedId = first(params.definition);
  const cloneId = first(params.clone);
  const requestedFormat = first(params.format);
  const initialFormat = requestedFormat === "TEXT" || requestedFormat === "IMAGE" ? requestedFormat : undefined;
  const creating = first(params.create) === "1" || !!cloneId;
  const search = (first(params.search) || "").slice(0, 90);
  const rawPage = Number(first(params.page) || "1");
  const page = Number.isSafeInteger(rawPage) ? Math.min(1000, Math.max(1, rawPage)) : 1;
  const kindCandidate = first(params.kind) || "";
  const statusCandidate = first(params.status) || "";
  const kind = ["META_RECOVERY", "MODA_CONVERSATION_WRAPPER"].includes(kindCandidate) ? kindCandidate : "";
  const status = ["SAVED", "PUBLISHED", "RETIRED"].includes(statusCandidate) ? statusCandidate : "";
  const [selected, cloneFrom] = await Promise.all([
    selectedId ? getDefinitionDetail(selectedId) : Promise.resolve(null),
    cloneId ? getDefinitionDetail(cloneId) : Promise.resolve(null),
  ]);
  if ((selectedId && !selected) || (cloneId && (!cloneFrom || !cloneFrom.english))) notFound();
  const scenario = RECOVERY_SCENARIOS.find(row => row.id === first(params.scenario));
  const history = first(params.history) === "1" || !!search || !!kind || !!status || rawPage > 1 || !!scenario && !creating;
  const browsing = !creating && !selected;
  const overview = browsing && !history ? await readRecoveryWorkflow(prisma, principal) : null;
  const coverage = browsing && history ? await getScenarioCoverage() : [];
  const dynamicLayouts = browsing && history ? await getDynamicLayoutCoverage() : [];
  const commonLayouts = creating ? await listCommonLayoutChoices() : [];
  const catalogue = browsing && history ? await listDefinitions(page, search, { kind, status, scenario: scenario?.id }) : null;

  return <AdminShell active="whatsapp-templates">
    <div className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-8">
      <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-2 text-sm text-slate-600">
        <Link href="/system-controls/platform-policy" className="underline">System Controls</Link><span>/</span>
        {selected || creating ? <><Link href="/system-controls/whatsapp-templates" className="underline">WhatsApp templates</Link><span>/</span>
          <span>{selected ? "Definition" : cloneFrom ? "Clone as New" : "Create template"}</span></>
          : <span>WhatsApp templates</span>}
      </nav>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">WhatsApp templates</h1>
      {selected ? <div className="mx-auto max-w-5xl space-y-4">
        <Link href="/system-controls/whatsapp-templates" className="text-sm font-medium text-blue-800 underline">← Recovery scenarios</Link>
        <TemplateSavedDetail detail={selected} />
      </div> : creating ? <TemplateAuthoringWorkspace key={`${cloneFrom?.id || scenario?.id || "new"}:${initialFormat ?? "original"}`} cloneFrom={cloneFrom} commonLayouts={commonLayouts} initialScenario={scenario?.draft} initialFormat={initialFormat} />
        : overview ? <RecoveryScenariosDashboard overview={overview} />
        : catalogue ? <div className="space-y-6"><Link className="text-sm text-blue-800 underline" href="/system-controls/whatsapp-templates">← Recovery scenarios</Link>{!scenario && <ScenarioCoverageSummary rows={coverage} dynamicLayouts={dynamicLayouts} />}<TemplateCatalogue {...catalogue} search={search} kind={kind} status={status} scenario={scenario?.id} /></div> : null}
    </div>
  </AdminShell>;
}
