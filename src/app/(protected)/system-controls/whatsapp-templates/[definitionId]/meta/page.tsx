import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { MetaTemplateDashboard } from "@/components/admin/whatsapp-templates/meta/meta-template-dashboard";
import { requirePlatformAdminPage } from "@/lib/auth/platform-admin";
import { requireTemplateSuperAdmin } from "@/lib/admin/whatsapp-templates/authoring/service";
import { MetaSubmissionError } from "@/lib/admin/whatsapp-templates/meta/contracts";
import { readMetaDashboard } from "@/lib/admin/whatsapp-templates/meta/reads";
import { readMetaStatus } from "@/lib/admin/whatsapp-templates/meta/status";
import { resolveTrustedMetaWaba } from "@/lib/admin/whatsapp-templates/meta/sender";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function MetaTemplatePage({ params }: { params: Promise<{ definitionId: string }> }) {
  const principal = await requirePlatformAdminPage();
  if (principal.role !== "SUPER_ADMIN") notFound();
  requireTemplateSuperAdmin(principal);
  const { definitionId } = await params;
  let dashboard;
  try {
    const trustedWabaId = await resolveTrustedMetaWaba(prisma);
    dashboard = await readMetaDashboard(definitionId, { db: prisma, principal, trustedWabaId });
  } catch (cause) {
    if (!(cause instanceof MetaSubmissionError) || cause.reasonCode !== "SENDER_UNAVAILABLE") {
      if (cause instanceof MetaSubmissionError && ["NOT_FOUND", "INVALID_INPUT"].includes(cause.reasonCode)) notFound();
      throw cause;
    }
    // Configuration failure blocks confirmation, but existing approval evidence
    // must remain inspectable to a privileged operator.
    const status = await readMetaStatus(definitionId, { db: prisma, principal });
    dashboard = { definitionId, status, plan: null, previewIssue: cause.message };
  }
  return <AdminShell active="whatsapp-templates">
    <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-8">
      <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link href="/system-controls" className="text-blue-800 underline">System Controls</Link><span>/</span>
        <Link href={`/system-controls/whatsapp-templates?definition=${encodeURIComponent(definitionId)}`} className="text-blue-800 underline">WhatsApp template</Link><span>/</span>
        <span>Meta submission and approvals</span>
      </nav>
      <h1 className="mb-2 text-2xl font-bold">Meta submission and language approvals</h1>
      <p className="mb-6 text-sm text-slate-600">Operator-confirmed, Moda-authored and immutable. Provider decisions do not publish templates to merchants.</p>
      <MetaTemplateDashboard initial={dashboard} />
    </main>
  </AdminShell>;
}
