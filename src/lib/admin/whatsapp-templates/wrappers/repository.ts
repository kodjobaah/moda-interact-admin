import type { Prisma, PrismaClient } from "@prisma/client";
import type { Audience } from "./contracts";

export type WrapperRepository = Pick<PrismaClient, "$transaction">;

/**
 * Only the audience's row may be changed. The expected *definition* guards
 * accidental ABA from a client that has kept an old review panel open.
 * Unique PK and the surrounding SERIALIZABLE transaction fence empty-slot races.
 */
export async function replaceWrapperSlot(tx: Prisma.TransactionClient, input: {
  audience: Audience;
  definitionId: string;
  expectedDefinitionId: string | null;
  expectedVersion: number | null;
  actorId: string;
}): Promise<{ previousDefinitionId: string | null; editVersion: number; replay: boolean }> {
  const slot = await tx.whatsAppConversationWrapperActiveSlot.findUnique({ where: { audience: input.audience } });
  if ((slot?.editVersion ?? null) !== input.expectedVersion ||
      (slot?.definitionId ?? null) !== input.expectedDefinitionId) {
    throw new WrapperConflictError("The active wrapper changed during review. Refresh and compare before activating.");
  }
  if (slot?.definitionId === input.definitionId) return { previousDefinitionId: slot.definitionId,
    editVersion: slot.editVersion, replay: true };
  if (slot) {
    const previousDefinitionId = slot.definitionId;
    const previousVersion = slot.editVersion;
    const result = await tx.whatsAppConversationWrapperActiveSlot.updateMany({
      where: { audience: input.audience, editVersion: previousVersion, definitionId: previousDefinitionId },
      data: { definitionId: input.definitionId, editVersion: { increment: 1 },
        updatedByAdminId: input.actorId, updatedAt: new Date() },
    });
    if (result.count !== 1) throw new WrapperConflictError("Another administrator changed this wrapper slot. Refresh before retrying.");
    return { previousDefinitionId, editVersion: previousVersion + 1, replay: false };
  }
  await tx.whatsAppConversationWrapperActiveSlot.create({ data: {
    audience: input.audience, definitionId: input.definitionId, editVersion: 1,
    updatedByAdminId: input.actorId,
  } });
  return { previousDefinitionId: null, editVersion: 1, replay: false };
}

export class WrapperConflictError extends Error {
  constructor(message: string) { super(message); this.name = "WrapperConflictError"; }
}

/** Must be invoked in the same transaction as the pointer change. */
export async function recordWrapperActivation(tx: Prisma.TransactionClient, input: {
  audience: Audience;
  previousDefinitionId: string | null;
  definitionId: string;
  sourceHash: string;
  editVersion: number;
  actorId: string;
  reason: string;
}): Promise<void> {
  await tx.commerceAuditEvent.create({ data: {
    actorType: "PLATFORM_ADMIN", actorAdminId: input.actorId,
    action: "ACTIVATE_WHATSAPP_CONVERSATION_WRAPPER",
    operationId: `wrapper:${input.audience}:${input.editVersion}:${input.definitionId.slice(-20)}`,
    reason: input.reason,
    metadata: { audience: input.audience, previousDefinitionId: input.previousDefinitionId,
      newDefinitionId: input.definitionId, editVersion: input.editVersion, sourceHash: input.sourceHash,
      reviewedLanguageCount: 20 },
  } });
}
