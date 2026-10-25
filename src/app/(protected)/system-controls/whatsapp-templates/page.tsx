import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { TemplateCatalogue } from "@/components/admin/whatsapp-templates/authoring/template-catalogue";
import { TemplateSavedDetail } from "@/components/admin/whatsapp-templates/authoring/template-saved-detail";
import { TemplateAuthoringWorkspace } from "@/components/admin/whatsapp-templates/authoring/template-authoring-workspace";
import { requirePlatformAdminPage } from "@/lib/auth/platform-admin";
import { getDefinitionDetail, listDefinitions } from "@/lib/admin/whatsapp-templates/authoring/reads";

export const dynamic = "force-dynamic";
type SearchParams = { definition?: string | string[]; clone?: string | string[]; create?: string | string[];
  search?: string | string[]; page?: string | string[]; kind?: string | string[]; status?: string | string[] };
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

/** The catalogue is a dedicated view; authoring/editing cannot share its narrow sidebar. */
export default async function WhatsAppTemplatesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const principal = await requirePlatformAdminPage();
  if (principal.role !== "SUPER_ADMIN") notFound();
  const params = await searchParams;
  const selectedId = first(params.definition);
  const cloneId = first(params.clone);
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
  const catalogue = !creating && !selected ? await listDefinitions(page, search, { kind, status }) : null;

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
        <Link href="/system-controls/whatsapp-templates" className="text-sm font-medium text-blue-800 underline">← Back to catalogue</Link>
        <TemplateSavedDetail detail={selected} />
      </div> : creating ? <TemplateAuthoringWorkspace key={cloneFrom?.id || "new"} cloneFrom={cloneFrom} />
        : catalogue ? <TemplateCatalogue {...catalogue} search={search} kind={kind} status={status} /> : null}
    </div>
  </AdminShell>;
}
