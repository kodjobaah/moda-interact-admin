import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { TemplatePublicationWorkspace } from "@/components/admin/whatsapp-templates/publishing/template-publication-workspace";
import { requirePlatformAdminPage } from "@/lib/auth/platform-admin";
import { getDefinitionDetail } from "@/lib/admin/whatsapp-templates/authoring/reads";
import { progressForOperation } from "@/lib/admin/whatsapp-templates/publishing/operation";
import { prisma } from "@/lib/prisma";
import { isValidKey } from "@/lib/admin/whatsapp-templates/publishing/validation";

export const dynamic = "force-dynamic";
export default async function WhatsAppTemplatePublishPage({ params, searchParams }: {
  params: Promise<{ definitionId: string }>;
  searchParams: Promise<{ operation?: string | string[] }>;
}) {
  const principal = await requirePlatformAdminPage();
  if (principal.role !== "SUPER_ADMIN") notFound();
  const { definitionId } = await params;
  const detail = await getDefinitionDetail(definitionId);
  if (!detail || detail.kind !== "META_RECOVERY") notFound();
  const query = await searchParams;
  const operationId = Array.isArray(query.operation) ? query.operation[0] : query.operation;
  const operation = operationId && isValidKey(operationId) ? await prisma.whatsAppTemplatePublicationOperation.findUnique({
    where: { id: operationId }, select: { definitionId: true },
  }) : null;
  if (operationId && (!operation || operation.definitionId !== definitionId)) notFound();
  const initialProgress = operationId ? await progressForOperation(prisma, operationId) : null;
  const prepared = detail.english?.prepared;
  const header = prepared?.family === "META_RECOVERY"
    ? prepared.components.find((component) => component.type === "HEADER") : undefined;
  const headerKind = header?.format === "IMAGE" ? "IMAGE" : header?.format === "TEXT" ? "TEXT" : "NONE";
  return <AdminShell active="whatsapp-templates">
    <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-8">
      <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap gap-2 text-sm text-slate-600">
        <Link href="/system-controls/whatsapp-templates" className="underline">WhatsApp templates</Link><span>/</span>
        <Link href={`/system-controls/whatsapp-templates?definition=${definitionId}`} className="underline">{detail.providerTemplateName ?? "Definition"}</Link><span>/</span>
        <span>Publish</span>
      </nav>
      <h1 className="mb-2 text-2xl font-bold text-slate-900">Publish Meta-approved recovery template</h1>
      <p className="mb-6 text-sm text-slate-600">The approved 20-language Moda definition is immutable. Publication changes shop assignments only after review, confirmation and per-shop revalidation.</p>
      <dl className="mb-6 grid grid-cols-2 gap-3 border-y border-slate-200 py-4 text-sm sm:grid-cols-4">
        <div><dt className="text-slate-500">Existing purpose</dt><dd className="font-medium">{detail.purpose}/{detail.offerType}</dd></div>
        <div><dt className="text-slate-500">Promotion target</dt><dd className="font-medium">{detail.english?.authoring.family === "META_RECOVERY"
          ? detail.english.authoring.promotionTarget ?? "Legacy / not declared" : "Unavailable"}</dd></div>
        <div><dt className="text-slate-500">Header format</dt><dd className="font-medium">{headerKind}</dd></div>
        <div><dt className="text-slate-500">Immutable revision</dt><dd className="font-mono text-xs" title={detail.sourceHash}>{detail.sourceHash.slice(0, 12)}</dd></div>
      </dl>
      <TemplatePublicationWorkspace definitionId={definitionId} initialProgress={initialProgress} />
    </main>
  </AdminShell>;
}
