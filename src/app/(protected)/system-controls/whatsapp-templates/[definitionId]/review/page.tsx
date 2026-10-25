import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { TranslationReviewWorkspace } from "@/components/admin/whatsapp-templates/compilation/translation-review-workspace";
import { requirePlatformAdminPage } from "@/lib/auth/platform-admin";
import { getTranslationReviewWorkspace } from "@/lib/admin/whatsapp-templates/compilation/reads";

export const dynamic = "force-dynamic";

/** Protected server route only; reconstruction, SQL and lifecycle writes live in services. */
export default async function TemplateReviewPage({ params }: { params: Promise<{ definitionId: string }> }) {
  const principal = await requirePlatformAdminPage();
  if (principal.role !== "SUPER_ADMIN") notFound();
  const { definitionId } = await params;
  const workspace = await getTranslationReviewWorkspace(definitionId);
  if (!workspace) notFound();
  return <AdminShell active="whatsapp-templates">
    <div className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-8">
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-2 text-sm text-slate-600">
        <Link className="underline" href="/system-controls/platform-policy">System Controls</Link><span>/</span>
        <Link className="underline" href="/system-controls/whatsapp-templates">WhatsApp templates</Link><span>/</span><span>Translation review</span>
      </nav>
      <h1 className="mb-5 text-2xl font-bold">Review WhatsApp template translations</h1>
      <TranslationReviewWorkspace workspace={workspace} />
    </div>
  </AdminShell>;
}
