import { Prisma } from "@prisma/client";
import type { PlatformAdminPrincipal } from "../../../auth/platform-admin";
import { requireTemplateSuperAdmin } from "../authoring/service";
import { checkWrapperEligibility } from "./eligibility";
import { WRAPPER_AUDIENCES, WRAPPER_DEFINITION_ID, type ActivateWrapperInput, type ActivateWrapperResult } from "./contracts";
import { recordWrapperActivation, replaceWrapperSlot, WrapperConflictError, type WrapperRepository } from "./repository";

export class WrapperRequestError extends Error {
  constructor(message: string) { super(message); this.name = "WrapperRequestError"; }
}

export type WrapperActivationDependencies = {
  principal: Pick<PlatformAdminPrincipal, "id" | "role">;
  db: WrapperRepository;
  ensureActor?: (tx: Prisma.TransactionClient) => Promise<void>;
};

function checkInput(value: ActivateWrapperInput): void {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some((key) => !["audience", "definitionId", "expectedDefinitionId", "expectedVersion", "reason"].includes(key)) ||
      !WRAPPER_AUDIENCES.includes(value.audience) || !WRAPPER_DEFINITION_ID.test(value.definitionId) ||
      (value.expectedDefinitionId !== null && (typeof value.expectedDefinitionId !== "string" ||
        !WRAPPER_DEFINITION_ID.test(value.expectedDefinitionId))) ||
      (value.expectedVersion !== null && (!Number.isSafeInteger(value.expectedVersion) || value.expectedVersion < 0)) ||
      (value.expectedVersion === null) !== (value.expectedDefinitionId === null) ||
      typeof value.reason !== "string" || value.reason.trim().length < 10 || value.reason.length > 500) {
    throw new WrapperRequestError("Invalid activation request. Provide an audience, current pointer/version and reason (10–500 characters).");
  }
}

/** A single durable transaction for semantic eligibility, versioned CAS, first publication and audit. */
export async function activateConversationWrapper(input: ActivateWrapperInput, deps: WrapperActivationDependencies): Promise<ActivateWrapperResult> {
  requireTemplateSuperAdmin(deps.principal);
  checkInput(input);
  try {
    return await deps.db.$transaction(async (tx) => {
      await deps.ensureActor?.(tx);
      const definition = await tx.whatsAppTemplateDefinition.findUnique({
        where: { id: input.definitionId }, include: { locales: true },
      });
      if (!definition) throw new WrapperRequestError("Wrapper definition not found.");
      const eligibility = checkWrapperEligibility(definition, input.audience);
      if (!eligibility.eligible) throw new WrapperRequestError(eligibility.reason);
      const result = await replaceWrapperSlot(tx, { ...input, actorId: deps.principal.id });
      if (result.replay) return { replay: true, editVersion: result.editVersion };
      // This is only a lifecycle marker. Locale JSONB/source hashes are never revised.
      await tx.whatsAppTemplateDefinition.updateMany({
        where: { id: input.definitionId, publishedAt: null },
        data: { publishedAt: new Date(), status: "PUBLISHED" },
      });
      await recordWrapperActivation(tx, {
        audience: input.audience, previousDefinitionId: result.previousDefinitionId,
        definitionId: input.definitionId, sourceHash: definition.sourceHash,
        editVersion: result.editVersion, actorId: deps.principal.id, reason: input.reason.trim(),
      });
      return { replay: false, editVersion: result.editVersion };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
  } catch (error) {
    if (error instanceof WrapperRequestError || error instanceof WrapperConflictError) throw error;
    if (error && typeof error === "object" && "code" in error && ["P2034", "P2002"].includes(String(error.code))) {
      throw new WrapperConflictError("Another administrator activated or updated this wrapper. Refresh and re-review the latest pointer.");
    }
    throw error;
  }
}
