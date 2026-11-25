import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { TemplateSavedDetail } from "@/components/admin/whatsapp-templates/authoring/template-saved-detail";
import { TemplateTranslationWorkspace } from "@/components/admin/whatsapp-templates/translations/template-translation-workspace";
import { TranslationReviewWorkspace } from "@/components/admin/whatsapp-templates/compilation/translation-review-workspace";
import { MetaTemplateDashboard } from "@/components/admin/whatsapp-templates/meta/meta-template-dashboard";
import { TemplatePublicationWorkspace } from "@/components/admin/whatsapp-templates/publishing/template-publication-workspace";
import { requirePlatformAdminPage } from "@/lib/auth/platform-admin";
import { prisma } from "@/lib/prisma";
import { getDefinitionDetail } from "@/lib/admin/whatsapp-templates/authoring/reads";
import { scenarioLabel } from "@/lib/admin/whatsapp-templates/authoring/scenarios";
import { readRecoveryWorkflow } from "@/lib/admin/whatsapp-templates/workflow/reads";
import { initialPublicationScope, resumeStage, layoutLabel, workflowHref, WORKFLOW_STAGES, WORKFLOW_ROOT, type WorkflowStage } from "@/lib/admin/whatsapp-templates/workflow/contracts";
import { getWhatsAppTemplateTranslationState } from "@/lib/admin/whatsapp-templates/translations/service";
import { getTranslationReviewWorkspace } from "@/lib/admin/whatsapp-templates/compilation/reads";
import { readMetaDashboard } from "@/lib/admin/whatsapp-templates/meta/reads";
import { readMetaStatus } from "@/lib/admin/whatsapp-templates/meta/status";
import { resolveTrustedMetaWaba } from "@/lib/admin/whatsapp-templates/meta/sender";
import { MetaSubmissionError } from "@/lib/admin/whatsapp-templates/meta/contracts";
import { progressForOperation } from "@/lib/admin/whatsapp-templates/publishing/operation";
import { isValidKey } from "@/lib/admin/whatsapp-templates/publishing/validation";

export const dynamic = "force-dynamic";
const labels: Record<WorkflowStage,string> = { compose: "Compose", translate: "Translate and review", meta: "Meta approval", publish: "Publish and assign" };
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

/** One resumable workspace. Only the selected stage loads its existing service. */
export default async function RecoveryWorkflowPage({ params, searchParams }: {
  params: Promise<{definitionId:string}>;
  searchParams: Promise<Record<string,string|string[]|undefined>>;
}) {
  const principal = await requirePlatformAdminPage();
  if (principal.role !== "SUPER_ADMIN") notFound();
  const { definitionId } = await params;
  if (!/^wtdef_[a-f0-9]{64}$/.test(definitionId)) notFound();
  const detail = await getDefinitionDetail(definitionId);
  if (!detail) notFound();
  if (detail.kind !== "META_RECOVERY") redirect(`${WORKFLOW_ROOT}?definition=${encodeURIComponent(definitionId)}`);
  const query = await searchParams;
  const overview = await readRecoveryWorkflow(prisma, principal, definitionId);
  const facts = overview.facts[0];
  if (!facts) notFound();
  const requestedStage = first(query.stage);
  const requestedScope = first(query.scope);
  const stage = facts.retired ? "compose" : WORKFLOW_STAGES.find(value => value === requestedStage) ?? resumeStage(facts);
  const defaultEligible = facts.checkoutTarget;
  let body;
  if (stage === "compose") body = <TemplateSavedDetail detail={detail} integrated/>;
  else if (stage === "translate") {
    if (first(query.review) === "1" || first(query.review) !== "0" && (facts.translatedCount === 19 || facts.reviewedCount === 20)) {
      const review = await getTranslationReviewWorkspace(definitionId);
      if (!review) notFound();
      body = <TranslationReviewWorkspace workspace={review} integrated />;
    } else {
      const state = await getWhatsAppTemplateTranslationState(definitionId, { db: prisma, principal });
      body = <TemplateTranslationWorkspace initialState={state} integrated />;
    }
  } else if (stage === "meta") {
    let dashboard;
    let trustedWabaId: string | null = null;
    try {
      trustedWabaId = await resolveTrustedMetaWaba(prisma);
      dashboard = await readMetaDashboard(definitionId, { db: prisma, principal, trustedWabaId });
    } catch (error) {
      if (!(error instanceof MetaSubmissionError) || error.reasonCode !== "SENDER_UNAVAILABLE") throw error;
      const status = await readMetaStatus(definitionId, { db: prisma, principal });
      dashboard = { definitionId, status, plan: null, previewIssue: error.message };
    }
    body = <MetaTemplateDashboard initial={dashboard} integratedWabaId={trustedWabaId}/>;
  } else {
    const explicitOperation = first(query.operation);
    // Do not auto-resume a completed operation or hide the requested scope. A
    // pending/partial operation is available as an explicit resumable link.
    let initialProgress: import("@/lib/admin/whatsapp-templates/publishing/types").PublicationProgress | null = null;
    if (explicitOperation) {
      if (!isValidKey(explicitOperation)) notFound();
      const operation = await prisma.whatsAppTemplatePublicationOperation.findUnique({where:{id:explicitOperation}, select:{definitionId:true,scopeSnapshot:true}});
      const snapshot = operation?.scopeSnapshot;
      if (!operation || operation.definitionId !== definitionId || !snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) || snapshot.schemaVersion !== 1 || "automatedOnboarding" in snapshot) notFound();
      initialProgress = await progressForOperation(prisma, explicitOperation);
    }
    const scope = initialPublicationScope(requestedScope, defaultEligible);
    body = <div className="space-y-4">
      <div className="rounded-lg border bg-white p-4 text-sm">
        <p className="font-semibold">Platform default and shop-specific assignments — {facts.format}</p>
        <p>{!overview.wabaId ? "Default unknown — sender unavailable." : !facts.defaultDefinitionId ? "No default configured for this purpose and format." : facts.defaultDefinitionId === definitionId ? "This version is the configured default for future Shopify shops." : "A different version is configured as the default."}</p>
        {overview.wabaId && <p>{facts.assignedShops} shops have stored approved/enabled variants linked to this version. Publication review shows the exact impact for each shop and language.</p>}
        <p className="mt-2">Publication affects this format only. Default-only publication preserves all existing assignments. Shop-only publication does not change the default. Replacing shop-specific overrides requires explicit confirmation.</p>
        {facts.publicationId && !explicitOperation && <p className="mt-2"><Link className="text-blue-800 underline" href={workflowHref(definitionId,"publish",false,undefined,facts.publicationId)}>View or resume publication ({facts.publicationStatus})</Link></p>}
      </div>
      <TemplatePublicationWorkspace key={`${definitionId}:${requestedScope ?? ""}:${explicitOperation ?? ""}`} definitionId={definitionId} initialProgress={initialProgress} defaultEligible={defaultEligible} initialScope={scope} integrated />
    </div>;
  }
  return <AdminShell active="whatsapp-templates"><main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-8">
    <div className="mx-auto max-w-7xl space-y-5">
      <Link href={WORKFLOW_ROOT} className="text-sm text-blue-800 underline">← Recovery scenarios</Link>
      <header><h1 className="text-2xl font-bold">{scenarioLabel(detail.purpose,detail.offerType)} · {facts.format}</h1>
        <p className="mt-1 break-all text-sm text-slate-600">{detail.providerTemplateName ?? definitionId}</p>
        <p className="text-sm text-slate-600">{layoutLabel(facts)} · {facts.checkoutTarget ? "Checkout recovery" : "Alternative product"}</p>
        {facts.retired && <p role="status">Retired version — read only.</p>}
      </header>
      {first(query.startFailed) === "1" && !facts.translationRunStatus && <p role="alert" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">English was saved successfully. Translation could not be requested. Use Start translations below to retry; do not create another definition.</p>}
      <nav aria-label="Template workflow" className="grid gap-2 sm:grid-cols-4">
        {WORKFLOW_STAGES.map((value,index) => facts.retired && value !== "compose" ? <span key={value} className="p-3 text-slate-500">{index+1}. {labels[value]}</span> : <Link key={value} aria-current={stage===value?"step":undefined} href={workflowHref(definitionId,value)} className={`rounded border p-3 text-sm ${stage===value?"border-blue-800 bg-blue-50 font-semibold":"bg-white text-blue-800"}`}>{index+1}. {labels[value]}</Link>)}
      </nav>
      <div className="text-sm text-slate-600">Reviewed {facts.reviewedCount}/20 · Meta {overview.wabaId ? `${facts.approvedCount}/20 observed` : "unknown"} · {facts.defaultDefinitionId === definitionId ? "Configured platform default" : "Separate version"}</div>
      {body}
    </div>
  </main></AdminShell>;
}
