import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { WrapperPublicationPanel } from "@/components/admin/whatsapp-templates/wrappers/wrapper-publication-workspace";
import { requirePlatformAdminPage } from "@/lib/auth/platform-admin";
import { getWrapperPublicationWorkspace } from "@/lib/admin/whatsapp-templates/wrappers/reads";
import { WRAPPER_AUDIENCES, type Audience } from "@/lib/admin/whatsapp-templates/wrappers/contracts";

export const dynamic = "force-dynamic";
type SearchParams = { audience?: string | string[]; definition?: string | string[] };
const first = (value?: string | string[]) => Array.isArray(value) ? value[0] : value;

/** Read-only protected route: pointer writes live in the task-specific server action. */
export default async function ConversationWrappersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const principal = await requirePlatformAdminPage();
  if (principal.role !== "SUPER_ADMIN") notFound();
  const params = await searchParams;
  const requested = first(params.audience);
  const audience: Audience = WRAPPER_AUDIENCES.includes(requested as Audience) ? requested as Audience : "SHARED";
  const workspace = await getWrapperPublicationWorkspace({ audience, selectedDefinitionId: first(params.definition) });
  return <AdminShell active="whatsapp-templates">
    <div className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-8">
      <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap gap-2 text-sm text-slate-600">
        <Link className="underline" href="/system-controls/platform-policy">System Controls</Link><span>/</span>
        <Link className="underline" href="/system-controls/whatsapp-templates">WhatsApp templates</Link><span>/</span><span>Conversation wrappers</span>
      </nav>
      <h1 className="mb-2 text-2xl font-bold">Publish conversation wrappers</h1>
      <p className="mb-5 text-sm text-slate-700">Platform-level SHARED, AI and HUMAN pointers. No Meta submission or merchant assignment.</p>
      <WrapperPublicationPanel key={audience + ":" + (workspace.selectedDefinitionId ?? "none")} workspace={workspace} audience={audience} />
    </div>
  </AdminShell>;
}
