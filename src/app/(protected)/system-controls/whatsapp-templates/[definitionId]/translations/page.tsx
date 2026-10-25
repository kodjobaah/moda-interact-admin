import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { TemplateTranslationWorkspace } from "@/components/admin/whatsapp-templates/translations/template-translation-workspace";
import { getWhatsAppTemplateTranslationState } from "@/lib/admin/whatsapp-templates/translations/service";
import { requirePlatformAdminPage } from "@/lib/auth/platform-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function TemplateTranslationsPage({ params }: {
  params: Promise<{ definitionId: string }>;
}) {
  const principal = await requirePlatformAdminPage();
  if (principal.role !== "SUPER_ADMIN") notFound();
  const { definitionId } = await params;
  if (!/^wtdef_[a-f0-9]{64}$/.test(definitionId)) notFound();
  const state = await getWhatsAppTemplateTranslationState(definitionId, { db: prisma, principal }).catch((error: unknown) => {
    if (error instanceof Error && error.message === "Saved English template not found.") notFound();
    throw error;
  });
  return <AdminShell active="whatsapp-templates">
    <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-8">
      <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap gap-2 text-sm text-slate-600">
        <Link className="underline" href="/system-controls/platform-policy">System Controls</Link><span>/</span>
        <Link className="underline" href="/system-controls/whatsapp-templates">WhatsApp templates</Link><span>/</span>
        <Link className="underline" href={`/system-controls/whatsapp-templates?definition=${encodeURIComponent(definitionId)}`}>Definition</Link><span>/</span><span>Translations</span>
      </nav>
      <div className="mx-auto max-w-5xl space-y-5">
        <header><h1 className="text-2xl font-bold text-slate-900">Template translations</h1>
          <p className="mt-1 text-sm text-slate-600">Prepare translation work for the saved, immutable English definition.</p>
          <p className="mt-2 break-all font-mono text-xs text-slate-500">{definitionId}</p></header>
        <TemplateTranslationWorkspace initialState={state} />
      </div>
    </main>
  </AdminShell>;
}
