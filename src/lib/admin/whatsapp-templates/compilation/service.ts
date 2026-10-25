import { Prisma } from "@prisma/client";
import type { PlatformAdminPrincipal } from "../../../auth/platform-admin";
import { requireTemplateSuperAdmin } from "../authoring/service";
import type { ReviewInput } from "./contracts";
import { providerLanguageCode, REVIEW_LANGUAGES } from "./language-codes";
import { reconstructAndCompile } from "./reconstruction";
import { finaliseLocaleTransaction, validateEnglishEnvelope, type ReviewRepository } from "./repository";

export class ReviewRequestError extends Error {
  constructor(message: string) { super(message); this.name = "ReviewRequestError"; }
}
export type ReviewDependencies = {
  db: ReviewRepository;
  principal: Pick<PlatformAdminPrincipal, "id" | "role">;
  ensureActor?: (tx: Prisma.TransactionClient) => Promise<void>;
};

function checkRequest(value: ReviewInput): void {
  if (!value || typeof value !== "object" || Object.keys(value).some((key) =>
      !["definitionId", "languageTag", "runId", "decision"].includes(key)) ||
      !/^wtdef_[a-f0-9]{64}$/.test(value.definitionId) ||
      typeof value.runId !== "string" || value.runId.length > 160 ||
      !REVIEW_LANGUAGES.includes(value.languageTag) || value.languageTag === "en" ||
      !["APPROVE", "REJECT"].includes(value.decision)) throw new ReviewRequestError("Invalid translation review request.");
}

export function isCompletedTranslationItem(item: { status: string; failureCode: string | null; translatedAst: unknown }): boolean {
  return ["COMPLETED", "COMPLETE", "SUCCEEDED", "AVAILABLE"].includes(item.status) &&
    !item.failureCode && item.translatedAst !== null && item.translatedAst !== undefined;
}

/** Row-lock serialisation + unique locale constraint; failed audits roll back the locale and item link. */
export async function reviewTranslation(input: ReviewInput, deps: ReviewDependencies): Promise<{ replay: boolean }> {
  requireTemplateSuperAdmin(deps.principal);
  checkRequest(input);
  try {
    return await deps.db.$transaction(async (tx) => {
      await deps.ensureActor?.(tx);
      const locks = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "whatsapp"."WhatsAppTemplateDefinition"
        WHERE "id" = ${input.definitionId} FOR UPDATE
      `);
      if (locks.length !== 1) throw new ReviewRequestError("Template definition not found.");
      const definition = await tx.whatsAppTemplateDefinition.findUnique({ where: { id: input.definitionId } });
      if (!definition || definition.status === "RETIRED") throw new ReviewRequestError("Definition is unavailable for review.");
      const run = await tx.whatsAppTemplateTranslationRun.findFirst({
        where: { definitionId: input.definitionId }, orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
      });
      if (!run || run.id !== input.runId || run.sourceHash !== definition.sourceHash) {
        throw new ReviewRequestError("Translation run is stale; refresh the review screen.");
      }
      const sourceLocale = await tx.whatsAppTemplateLocale.findUnique({
        where: { definitionId_languageTag: { definitionId: input.definitionId, languageTag: "en" } },
      });
      const english = validateEnglishEnvelope(sourceLocale?.localeAst, definition.sourceHash, sourceLocale?.contentHash ?? null);
      const item = await tx.whatsAppTemplateTranslationItem.findUnique({
        where: { runId_targetLanguageTag: { runId: run.id, targetLanguageTag: input.languageTag } },
      });
      if (!item || !isCompletedTranslationItem(item)) throw new ReviewRequestError("Translated language is not complete.");
      const providerCode = providerLanguageCode(input.languageTag, english.authoring.family);
      const candidate = input.decision === "APPROVE" ? reconstructAndCompile({
        definitionId: definition.id, definitionSourceHash: definition.sourceHash,
        runSourceHash: run.sourceHash, languageTag: input.languageTag,
        english: english.authoring, snapshot: run.sourceSnapshot,
        translated: item.translatedAst, outputContentHash: item.outputContentHash,
      }) : null;
      const existing = await tx.whatsAppTemplateLocale.findUnique({
        where: { definitionId_languageTag: { definitionId: input.definitionId, languageTag: input.languageTag } },
      });
      if (item.resultLocaleId && (!existing || item.resultLocaleId !== existing.id)) {
        throw new ReviewRequestError("Translation item links to a different finalised locale.");
      }
      return finaliseLocaleTransaction(tx, {
        definitionId: input.definitionId, languageTag: input.languageTag, providerCode,
        actorId: deps.principal.id, itemId: item.id, decision: input.decision,
        existing, candidate,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error.code === "P2034" || error.code === "P2002")) {
      throw new ReviewRequestError("Another administrator changed this locale; refresh before retrying.");
    }
    throw error;
  }
}
