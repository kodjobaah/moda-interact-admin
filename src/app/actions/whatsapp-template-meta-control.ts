"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdminMutation, requirePlatformAdminRead } from "@/lib/auth/platform-admin";
import { ensureDevelopmentPlatformAdmin } from "@/lib/auth/development-platform-admin";
import { prisma } from "@/lib/prisma";
import { requireTemplateSuperAdmin } from "@/lib/admin/whatsapp-templates/authoring/service";
import { MetaSubmissionError, type MetaStatusView } from "@/lib/admin/whatsapp-templates/meta/contracts";
import { resolveTrustedMetaWaba } from "@/lib/admin/whatsapp-templates/meta/sender";
import { confirmMetaSubmission, type ConfirmMetaInput } from "@/lib/admin/whatsapp-templates/meta/submission";
import { readMetaStatus } from "@/lib/admin/whatsapp-templates/meta/status";
import { requestMetaReconciliation, type ReconcileInput } from "@/lib/admin/whatsapp-templates/meta/reconcile";
import { requestMetaTechnicalRetry } from "@/lib/admin/whatsapp-templates/meta/technical-retry";

export type MetaControlResult = { ok: true; replay?: boolean; message: string } | { ok: false; message: string };
const message = (cause: unknown) => cause instanceof MetaSubmissionError
  ? cause.message.slice(0, 220) : "Meta template operation failed. Refresh and retry or contact Support.";
const routePath = (id: string) => `/system-controls/whatsapp-templates/${encodeURIComponent(id)}/meta`;

/** Only authoritatively authenticated SUPER_ADMIN can request provider submission. */
export async function confirmWhatsAppMetaTemplates(input: ConfirmMetaInput): Promise<MetaControlResult> {
  const principal = await requirePlatformAdminMutation();
  requireTemplateSuperAdmin(principal);
  try {
    const wabaId = await resolveTrustedMetaWaba(prisma);
    const result = await confirmMetaSubmission(input, { db: prisma, principal, trustedWabaId: wabaId,
      ensureActor: (tx) => ensureDevelopmentPlatformAdmin(tx, principal) });
    revalidatePath(routePath(input.definitionId));
    return { ok: true, replay: result.replay, message: result.replay
      ? "Identical registrations already exist; no duplicate submission was created."
      : `${result.registered} immutable languages queued for Background submission. Provider approval is still pending.` };
  } catch (cause) { return { ok: false, message: message(cause) }; }
}

/** Explicit local status-only reconciliation request; does not call Graph API. */
export async function reconcileWhatsAppMetaTemplate(input: ReconcileInput): Promise<MetaControlResult> {
  const principal = await requirePlatformAdminMutation();
  requireTemplateSuperAdmin(principal);
  try {
    const trustedWabaId = await resolveTrustedMetaWaba(prisma);
    const result = await requestMetaReconciliation(input, { db: prisma, principal, trustedWabaId,
      ensureActor: (tx) => ensureDevelopmentPlatformAdmin(tx, principal) });
    revalidatePath(routePath(input.definitionId));
    return { ok: true, message: result.queued ? "Reconciliation requested. Background will check Meta status." : "A reconciliation is already pending." };
  } catch (cause) { return { ok: false, message: message(cause) }; }
}

/** Polling reads persisted observations ONLY; no credentials or provider requests. */
export async function readWhatsAppMetaTemplateStatus(definitionId: string): Promise<MetaStatusView> {
  const principal = await requirePlatformAdminRead();
  requireTemplateSuperAdmin(principal);
  return readMetaStatus(definitionId, { principal, db: prisma });
}

/** A retry request needs Background's explicit, matching provider-absence receipt. */
export async function retryWhatsAppMetaTechnicalSubmission(input: ReconcileInput): Promise<MetaControlResult> {
  const principal = await requirePlatformAdminMutation();
  requireTemplateSuperAdmin(principal);
  try {
    const trustedWabaId = await resolveTrustedMetaWaba(prisma);
    const result = await requestMetaTechnicalRetry(input, { db: prisma, principal, trustedWabaId,
      ensureActor: (tx) => ensureDevelopmentPlatformAdmin(tx, principal) });
    revalidatePath(routePath(input.definitionId));
    return { ok: true, message: result.queued ? "Technical retry requested. Background will recheck the frozen provider identity before attempting submission." : "A retry is already recorded for this reconciliation." };
  } catch (cause) { return { ok: false, message: message(cause) }; }
}
