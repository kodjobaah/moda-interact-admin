import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { PlatformAdminPrincipal } from "../../../auth/platform-admin";
import { requireTemplateSuperAdmin } from "../authoring/service";
import { recordMetaControlAudit } from "./audit";
import { DEFINITION_ID, MetaSubmissionError } from "./contracts";
import type { MetaDatabase } from "./repository";

const REGISTRATION_ID = /^[a-zA-Z0-9_-]{1,191}$/;
export type ReconcileInput = { definitionId: string; registrationId: string };

/** Durable DB handoff for Background: append a pending ADMIN reconcile event.
 * BG003 owns claim/poll and provider GET; this request never implies permission
 * to retry a Meta POST and never changes provider approval or frozen payloads.
 */
export async function requestMetaReconciliation(input: ReconcileInput, deps: {
  db: MetaDatabase; principal: PlatformAdminPrincipal; trustedWabaId: string;
  ensureActor?: (tx: Prisma.TransactionClient) => Promise<void>;
  now?: () => Date;
}): Promise<{ queued: boolean }> {
  requireTemplateSuperAdmin(deps.principal);
  if (!input || typeof input !== "object" || Object.keys(input).sort().join("|") !== "definitionId|registrationId" ||
      !DEFINITION_ID.test(input.definitionId) || !REGISTRATION_ID.test(input.registrationId)) {
    throw new MetaSubmissionError("INVALID_INPUT", "Invalid registration reconciliation request.");
  }
  if (!/^\d{4,32}$/.test(deps.trustedWabaId)) throw new MetaSubmissionError("SENDER_UNAVAILABLE", "Missing trusted sender account.");
  const now = (deps.now ?? (() => new Date()))();
  if (!Number.isFinite(now.getTime())) throw new MetaSubmissionError("INVALID_INPUT", "Invalid reconciliation time.");
  // One outstanding request per registration; no flood on repeated double-clicks.
  return deps.db.$transaction(async (tx) => {
    const row = await tx.whatsAppTemplateMetaRegistration.findUnique({ where: { id: input.registrationId },
      include: { locale: { select: { definitionId: true } } } });
    if (!row || row.locale.definitionId !== input.definitionId || row.wabaId !== deps.trustedWabaId) {
      throw new MetaSubmissionError("NOT_FOUND", "Registration does not belong to this definition and sender account.");
    }
    if (row.submissionState === "READY_TO_SUBMIT") {
      throw new MetaSubmissionError("NOT_SUBMITTED", "This language has not yet been sent to Meta. Reconciliation is not available.");
    }
    const pending = await tx.whatsAppTemplateMetaEvent.findFirst({ where: {
      registrationId: row.id, source: "ADMIN", eventType: "RECONCILE_REQUESTED", processedAt: null,
    }, select: { id: true } });
    if (pending) return { queued: false };
    const window = Math.floor(now.getTime() / (5 * 60_000));
    const eventIdentity = `admin_reconcile_${createHash("sha256").update(`${row.id}\u0000${window}`).digest("hex")}`;
    await deps.ensureActor?.(tx);
    await tx.whatsAppTemplateMetaEvent.create({ data: {
      eventIdentity, registrationId: row.id, source: "ADMIN", eventType: "RECONCILE_REQUESTED",
      wabaId: row.wabaId, providerTemplateId: row.providerTemplateId,
      providerTemplateName: row.providerTemplateName, providerLanguageCode: row.providerLanguageCode,
      requestDigest: row.submittedContentHash, receivedAt: now,
    } });
    await recordMetaControlAudit(tx, { actorAdminId: deps.principal.id, definitionId: input.definitionId,
      operation: "reconciliation", operationId: eventIdentity, registrationId: row.id });
    return { queued: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch((cause: unknown) => {
    if (cause && typeof cause === "object" && "code" in cause && (cause.code === "P2002" || cause.code === "P2034")) {
      // A collision is not authorization to generate another request.
      throw new MetaSubmissionError("RECONCILE_ALREADY_REQUESTED", "A reconciliation request is already pending. Refresh its status.");
    }
    throw cause;
  });
}
