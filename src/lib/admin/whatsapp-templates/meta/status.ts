import type { PlatformAdminPrincipal } from "../../../auth/platform-admin";
import { requireTemplateSuperAdmin } from "../authoring/service";
import { DEFINITION_ID, MetaSubmissionError, type MetaStatusView } from "./contracts";
import type { MetaDatabase } from "./repository";

/** The dashboard reads only bounded local PostgreSQL state, never Meta's API. */
export async function readMetaStatus(definitionId: string, deps: {
  db: MetaDatabase; principal: PlatformAdminPrincipal;
}): Promise<MetaStatusView> {
  requireTemplateSuperAdmin(deps.principal);
  if (!DEFINITION_ID.test(definitionId)) throw new MetaSubmissionError("INVALID_INPUT", "Invalid template definition.");
  const definition = await deps.db.whatsAppTemplateDefinition.findUnique({
    where: { id: definitionId }, select: { id: true, kind: true },
  });
  if (!definition || definition.kind !== "META_RECOVERY") throw new MetaSubmissionError("NOT_FOUND", "Meta recovery template not found.");
  const rows = await deps.db.whatsAppTemplateMetaRegistration.findMany({
    where: { locale: { definitionId } },
    include: {
      locale: { select: { languageTag: true } },
      events: { orderBy: [{ receivedAt: "desc" }, { id: "desc" }], take: 8,
        select: { id: true, eventType: true, source: true, outcome: true, reasonCode: true, failureCode: true, receivedAt: true } },
    },
    orderBy: [{ providerLanguageCode: "asc" }, { id: "asc" }], take: 21,
  });
  return {
    definitionId,
    registrations: rows.map((row) => ({
      id: row.id, localeId: row.localeId, languageTag: row.locale.languageTag,
      providerLanguageCode: row.providerLanguageCode, wabaId: row.wabaId,
      submittedContentHash: row.submittedContentHash, submissionState: row.submissionState,
      providerStatus: row.providerStatus, failureCode: row.failureCode,
      providerTemplateId: row.providerTemplateId, lastSubmittedAt: row.lastSubmittedAt?.toISOString() ?? null,
      nextRetryAt: row.nextRetryAt?.toISOString() ?? null, lastReconciledAt: row.lastReconciledAt?.toISOString() ?? null,
      driftDetectedAt: row.driftDetectedAt?.toISOString() ?? null,
      lastObservedContentHash: row.lastObservedContentHash, lastObservedCategory: row.lastObservedCategory,
      events: row.events.map((event) => ({ ...event, receivedAt: event.receivedAt.toISOString() })),
    })), updatedAt: new Date().toISOString(),
  };
}
