import type { Prisma, PrismaClient } from "@prisma/client";
import type { TemplateAst, ImmutableAuthoringRecord } from "./types";

export type TemplateRepository = Pick<PrismaClient, "$transaction" | "whatsAppTemplateDefinition">;
export type DefinitionRecordInput = {
  id: string;
  actorAdminId: string;
  sourceHash: string;
  contentHash: string;
  providerName: string | null;
  clonedFromDefinitionId: string | null;
  draft: TemplateAst;
  record: ImmutableAuthoringRecord;
  ensureActor?: (tx: Prisma.TransactionClient) => Promise<void>;
};

/** One transaction for source definition, English content and bounded audit. */
export async function insertTemplateRecord(database: TemplateRepository, input: DefinitionRecordInput): Promise<void> {
  await database.$transaction(async (tx) => {
    await input.ensureActor?.(tx);
    await tx.whatsAppTemplateDefinition.create({ data: {
      id: input.id,
      kind: input.draft.family,
      purpose: input.draft.family === "META_RECOVERY" ? input.draft.stage : null,
      offerType: input.draft.family === "META_RECOVERY" ? input.draft.offerType : null,
      audience: input.draft.family === "MODA_CONVERSATION_WRAPPER" ? input.draft.audience : null,
      providerTemplateName: input.providerName, category: input.draft.family === "META_RECOVERY" ? "MARKETING" : null,
      sourceLanguageTag: "en", astSchemaVersion: 1, sourceHash: input.sourceHash,
      status: "SAVED", createdByAdminId: input.actorAdminId, clonedFromDefinitionId: input.clonedFromDefinitionId,
    } });
    await tx.whatsAppTemplateLocale.create({ data: {
      definitionId: input.id, languageTag: "en",
      providerLanguageCode: input.draft.family === "META_RECOVERY" ? "en" : null,
      localeAst: input.record as unknown as Prisma.InputJsonValue,
      contentHash: input.contentHash, status: "SOURCE_SAVED",
    } });
    await tx.commerceAuditEvent.create({ data: {
      actorType: "PLATFORM_ADMIN", actorAdminId: input.actorAdminId,
      action: input.clonedFromDefinitionId ? "CLONE_WHATSAPP_TEMPLATE_DEFINITION" : "CREATE_WHATSAPP_TEMPLATE_DEFINITION",
      operationId: input.id.slice(0, 100), reason: input.clonedFromDefinitionId ? "Immutable template cloned" : "English template created",
      metadata: { definitionId: input.id, family: input.draft.family,
        ...(input.clonedFromDefinitionId ? { clonedFromDefinitionId: input.clonedFromDefinitionId } : {}) },
    } });
  });
}
