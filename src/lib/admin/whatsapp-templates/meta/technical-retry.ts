import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { PlatformAdminPrincipal } from "../../../auth/platform-admin";
import { requireTemplateSuperAdmin } from "../authoring/service";
import { recordMetaControlAudit } from "./audit";
import { DEFINITION_ID, MetaSubmissionError } from "./contracts";
import type { MetaDatabase } from "./repository";

const REGISTRATION_ID = /^[a-zA-Z0-9_-]{1,191}$/;
const UNCERTAIN = new Set(["UNKNOWN", "FAILED", "SUBMISSION_UNCERTAIN", "RETRYABLE_FAILURE"]);

/** Optional, strictly gated handoff. BG003 must reconcile the known provider
 * identity first and record PROV_ABSENT_CONFIRMED; Admin never issues Meta POST.
 * A provider timeout, failed HTTP call or stale webhook alone is NOT evidence.
 */
export async function requestMetaTechnicalRetry(input: { definitionId: string; registrationId: string }, deps: {
  db: MetaDatabase; principal: PlatformAdminPrincipal; trustedWabaId: string;
  ensureActor?: (tx: Prisma.TransactionClient) => Promise<void>;
}): Promise<{ queued: boolean }> {
  requireTemplateSuperAdmin(deps.principal);
  if (!input || typeof input !== "object" || Object.keys(input).sort().join("|") !== "definitionId|registrationId" ||
      !DEFINITION_ID.test(input.definitionId) || !REGISTRATION_ID.test(input.registrationId)) {
    throw new MetaSubmissionError("INVALID_INPUT", "Invalid technical retry request.");
  }
  return deps.db.$transaction(async (tx) => {
    const registration = await tx.whatsAppTemplateMetaRegistration.findUnique({ where: { id: input.registrationId },
      include: { locale: { select: { definitionId: true } } } });
    if (!registration || registration.locale.definitionId !== input.definitionId || registration.wabaId !== deps.trustedWabaId) {
      throw new MetaSubmissionError("NOT_FOUND", "Registration does not match this definition or trusted WABA.");
    }
    if (!UNCERTAIN.has(registration.submissionState) || registration.providerTemplateId ||
        registration.providerStatus && registration.providerStatus !== "UNKNOWN" ||
        !registration.lastSubmittedAt || !registration.lastReconciledAt ||
        registration.lastReconciledAt < registration.lastSubmittedAt || registration.driftDetectedAt) {
      throw new MetaSubmissionError("RETRY_NOT_ELIGIBLE", "Only an unresolved technical submission may be retried after confirmed absence at Meta. Rejected or approved content requires no retry.");
    }
    // Exact durable absence evidence is written ONLY by Background after a
    // successful provider lookup for the frozen WABA/name/language.
    const absence = await tx.whatsAppTemplateMetaEvent.findFirst({ where: {
      registrationId: registration.id, source: "RECONCILIATION", eventType: "PROVIDER_ABSENT_CONFIRMED",
      outcome: "NOT_FOUND", processedAt: { not: null }, receivedAt: { gte: registration.lastSubmittedAt },
      requestDigest: registration.submittedContentHash, wabaId: registration.wabaId,
      providerTemplateName: registration.providerTemplateName, providerLanguageCode: registration.providerLanguageCode,
    }, orderBy: { receivedAt: "desc" } });
    if (!absence || absence.receivedAt > registration.lastReconciledAt) {
      throw new MetaSubmissionError("ABSENCE_NOT_VERIFIED", "Background must first prove this Meta template is absent. Request status reconciliation.");
    }
    const eventIdentity = `admin_retry_${createHash("sha256").update(`${registration.id}\u0000${absence.id}`).digest("hex")}`;
    const previous = await tx.whatsAppTemplateMetaEvent.findUnique({ where: { eventIdentity }, select: { id: true } });
    if (previous) return { queued: false };
    await deps.ensureActor?.(tx);
    await tx.whatsAppTemplateMetaEvent.create({ data: {
      eventIdentity, registrationId: registration.id, source: "ADMIN", eventType: "TECHNICAL_RETRY_REQUESTED",
      wabaId: registration.wabaId, providerTemplateId: null,
      providerTemplateName: registration.providerTemplateName, providerLanguageCode: registration.providerLanguageCode,
      requestDigest: registration.submittedContentHash,
    } });
    await recordMetaControlAudit(tx, { actorAdminId: deps.principal.id, definitionId: input.definitionId,
      operation: "technical-retry", operationId: eventIdentity, registrationId: registration.id });
    return { queued: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch((error: unknown) => {
    if (error && typeof error === "object" && "code" in error && ["P2002", "P2034"].includes(String(error.code))) {
      throw new MetaSubmissionError("RETRY_CONFLICT", "Technical retry is already requested or reconciliation changed. Refresh status.");
    }
    throw error;
  });
}
