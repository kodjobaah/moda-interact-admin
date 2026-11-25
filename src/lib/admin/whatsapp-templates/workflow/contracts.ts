/** Read-only progress hints. The existing review/Meta/publication services remain
 * the authority for mutations, eligibility, approval and immutable content. */
export type WorkflowStage = "compose" | "translate" | "meta" | "publish";
export type RecoveryWorkflowFacts = {
  definitionId: string;
  purpose: string;
  format: import("../recovery-defaults/contracts").RecoveryDefaultFormat;
  providerTemplateName: string | null;
  status: string;
  createdAt: Date;
  retired: boolean;
  checkoutTarget: boolean;
  activeLayoutId: string | null;
  sourceMatchesActive: boolean;
  localeCount: number;
  matchingCount: number;
  reviewedCount: number;
  translatedCount: number;
  translationRunStatus: string | null;
  registeredCount: number;
  approvedCount: number;
  defaultDefinitionId: string | null;
  latestCandidate: boolean;
  assignedShops: number;
  otherAssignedShops: number;
  publicationId: string | null;
  publicationStatus: string | null;
};
export type WorkflowOverview = {
  wabaId: string | null;
  activeLayout: { id: string; createdAt: string } | null;
  facts: RecoveryWorkflowFacts[];
};
export const WORKFLOW_STAGES: readonly WorkflowStage[] = ["compose", "translate", "meta", "publish"];
export const WORKFLOW_ROOT = "/system-controls/whatsapp-templates";
export type WorkflowPublicationScope = "future" | "one" | "selected" | "all_future" | "all";
export function workflowHref(id: string, stage?: WorkflowStage, review = false, scope?: WorkflowPublicationScope, operation?: string): string {
  const query = new URLSearchParams();
  if (stage) query.set("stage", stage);
  if (review) query.set("review", "1");
  if (scope) query.set("scope", scope);
  if (operation) query.set("operation", operation);
  return `${WORKFLOW_ROOT}/${encodeURIComponent(id)}/workflow${query.size ? `?${query}` : ""}`;
}
export function initialPublicationScope(value: unknown, defaultEligible: boolean): import("../publishing/types").PublicationIntent {
  if (value === "one") return { mode: "one", shopId: "" };
  if (value === "selected") return { mode: "selected", shopIds: [] };
  if (!defaultEligible) return { mode: "all" };
  return { mode: value === "all_future" ? "all_future" : "future" };
}
export function resumeStage(facts: RecoveryWorkflowFacts | undefined): WorkflowStage {
  if (!facts || facts.retired) return "compose";
  // A historical definition can be inspected, but never promoted by this hint.
  if (facts.activeLayoutId && !facts.sourceMatchesActive) return "compose";
  if (facts.reviewedCount !== 20) return "translate";
  if (facts.approvedCount !== 20) return "meta";
  return "publish";
}
export function layoutLabel(facts: RecoveryWorkflowFacts): string {
  if (!facts.activeLayoutId) return "No active common layout";
  if (!facts.sourceMatchesActive) return "Older or missing common layout";
  if (facts.matchingCount === 20 && facts.localeCount === 20) return "Active layout · 20/20 locale references";
  return `Active source layout · ${facts.matchingCount}/20 locale references`;
}
export function stageHint(facts: RecoveryWorkflowFacts): string {
  if (facts.retired) return "Retired — history only";
  if (facts.activeLayoutId && !facts.sourceMatchesActive) return "Clone with active layout";
  if (facts.reviewedCount !== 20) {
    if (facts.translatedCount === 19) return "Review translations";
    if (facts.translationRunStatus && /FAILED|CANCELLED|STALE/.test(facts.translationRunStatus)) return "Inspect translation progress";
    return facts.translationRunStatus ? "Resume translations" : "Start translations";
  }
  if (facts.approvedCount !== 20) return facts.registeredCount ? "Review Meta approvals" : "Submit to Meta";
  if (facts.publicationStatus === "IN_PROGRESS" || facts.publicationStatus === "PARTIAL") return "Resume publication";
  if (facts.defaultDefinitionId === facts.definitionId && facts.status === "PUBLISHED") return "Manage published default";
  return "Review publication";
}
