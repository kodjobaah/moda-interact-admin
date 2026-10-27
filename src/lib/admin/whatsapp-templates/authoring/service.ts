import type { Prisma } from "@prisma/client";
import type { PlatformAdminPrincipal } from "../../../auth/platform-admin";
import { makeImmutableAuthoringRecord } from "./compiler";
import { definitionIdForSubmit, providerTemplateName, templateHash } from "./identifiers";
import { insertTemplateRecord, type TemplateRepository } from "./repository";
import { validateTemplateAst } from "./validation";

export type SaveTemplateInput = { submissionId: string; draft: unknown; cloneFromDefinitionId?: string };

import { requireTemplateSuperAdmin } from "./super-admin";
export { requireTemplateSuperAdmin } from "./super-admin";

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

/** Service validates intent, including clone provenance, immediately before atomic write. */
export async function saveEnglishTemplate(input: SaveTemplateInput, dependencies: {
  principal: PlatformAdminPrincipal;
  db: TemplateRepository;
  ensureActor?: (tx: Prisma.TransactionClient) => Promise<void>;
}): Promise<{ id: string; replay: boolean }> {
  requireTemplateSuperAdmin(dependencies.principal);
  if (!input || typeof input !== "object" || Object.keys(input).some((key) => !["submissionId", "draft", "cloneFromDefinitionId"].includes(key))) {
    throw new Error("Unexpected template request fields.");
  }
  const validated = validateTemplateAst(input.draft);
  if (!validated.ok) throw new Error(validated.issues.map((i) => `${i.path}: ${i.message}`).join("; "));
  const draft = validated.value;
  const cloneId = input.cloneFromDefinitionId;
  if (cloneId !== undefined && (typeof cloneId !== "string" || !/^wtdef_[a-f0-9]{64}$/.test(cloneId))) throw new Error("Invalid clone source.");
  const id = definitionIdForSubmit(dependencies.principal.id, input.submissionId);
  const sourceHash = templateHash(draft);
  const record = makeImmutableAuthoringRecord(draft);
  const contentHash = templateHash(record.prepared);
  const existing = async () => dependencies.db.whatsAppTemplateDefinition.findUnique({ where: { id } });
  const resolveReplay = async () => {
    const saved = await existing();
    if (!saved || saved.createdByAdminId !== dependencies.principal.id || saved.sourceHash !== sourceHash ||
        saved.clonedFromDefinitionId !== (cloneId ?? null)) throw new Error("Submission ID already used for different content.");
    return { id, replay: true };
  };
  if (await existing()) return resolveReplay();
  if (cloneId) {
    const cloned = await dependencies.db.whatsAppTemplateDefinition.findUnique({ where: { id: cloneId } });
    if (!cloned) throw new Error("Clone source not found.");
  }
  try {
    await insertTemplateRecord(dependencies.db, {
      id, actorAdminId: dependencies.principal.id, sourceHash, contentHash,
      providerName: providerTemplateName(draft, id), clonedFromDefinitionId: cloneId ?? null,
      draft, record, ensureActor: dependencies.ensureActor,
    });
    return { id, replay: false };
  } catch (error) {
    if (isUniqueViolation(error)) return resolveReplay();
    throw error;
  }
}
