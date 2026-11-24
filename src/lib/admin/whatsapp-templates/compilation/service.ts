import { readSavedCommonLayout, readSavedCommonLayoutSet } from "../authoring/common-layout-repository";
import { Prisma } from "@prisma/client";
import type { PlatformAdminPrincipal } from "../../../auth/platform-admin";
import { requireTemplateSuperAdmin } from "../authoring/service";
import type { ReviewInput, ReviewedTranslationBatch } from "./contracts";
import { parseReviewedTranslationBatch } from "./batch-selection";
import { providerLanguageCode, REVIEW_LANGUAGES } from "./language-codes";
import { reconstructAndCompile } from "./reconstruction";
import { lifecycleItems, synchroniseCompletedTranslationLifecycle } from "./translation-lifecycle";
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

/** Load the immutable source and latest run once under the same definition lock
 * used by single-language review. A batch never creates a new review state. */
async function loadReviewContext(tx: Prisma.TransactionClient, input: Pick<ReviewInput, "definitionId" | "runId">, deps: ReviewDependencies) {
  await deps.ensureActor?.(tx);
  const locks = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "whatsapp"."WhatsAppTemplateDefinition"
    WHERE "id" = ${input.definitionId} FOR UPDATE
  `);
  if (locks.length !== 1) throw new ReviewRequestError("Template definition not found.");
  const definition = await tx.whatsAppTemplateDefinition.findUnique({ where: { id: input.definitionId } });
  if (!definition || definition.status === "RETIRED" || definition.retiredAt) throw new ReviewRequestError("Definition is unavailable for review.");
  const run = await tx.whatsAppTemplateTranslationRun.findFirst({
    where: { definitionId: input.definitionId }, orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
    include: { items: lifecycleItems },
  });
  if (!run || run.id !== input.runId || run.sourceHash !== definition.sourceHash) {
    throw new ReviewRequestError("Translation run is stale; refresh the review screen.");
  }
  const sourceLocale = await tx.whatsAppTemplateLocale.findUnique({
    where: { definitionId_languageTag: { definitionId: input.definitionId, languageTag: "en" } },
  });
  const english = validateEnglishEnvelope(sourceLocale?.localeAst, definition.sourceHash, sourceLocale?.contentHash ?? null);
  return { definition, run, english };
}
type ReviewContext = Awaited<ReturnType<typeof loadReviewContext>>;
type CommonReference = Awaited<ReturnType<typeof readSavedCommonLayout>>;

async function applyLocaleDecision(tx: Prisma.TransactionClient, context: ReviewContext, input: ReviewInput, deps: ReviewDependencies,
  options: { expectedContentHash?: string; commonLayouts?: CommonReference[] } = {}): Promise<{ replay: boolean }> {
  const { definition, run, english } = context;
  const item = await tx.whatsAppTemplateTranslationItem.findUnique({
    where: { runId_targetLanguageTag: { runId: run.id, targetLanguageTag: input.languageTag } },
  });
  if (!item || !isCompletedTranslationItem(item)) throw new ReviewRequestError(`Translated language is not complete: ${input.languageTag}.`);
  const providerCode = providerLanguageCode(input.languageTag, english.authoring.family);
  let commonLayout: CommonReference | undefined;
  if (input.decision === "APPROVE" && english.authoring.family === "META_RECOVERY" && english.authoring.commonLayout) {
    commonLayout = options.commonLayouts ? options.commonLayouts.find(ref => ref.languageTag === input.languageTag)
      : await readSavedCommonLayout(tx, english.authoring.commonLayout.definitionId, input.languageTag, english.authoring.commonLayout.sourceHash);
    if (!commonLayout) throw new ReviewRequestError(`Matching common layout is unavailable for ${input.languageTag}.`);
  }
  const candidate = input.decision === "APPROVE" ? reconstructAndCompile({
    definitionId: definition.id, definitionSourceHash: definition.sourceHash,
    runSourceHash: run.sourceHash, languageTag: input.languageTag,
    commonLayout, english: english.authoring, snapshot: run.sourceSnapshot,
    translated: item.translatedAst, outputContentHash: item.outputContentHash,
  }) : null;
  if (options.expectedContentHash !== undefined && candidate?.contentHash !== options.expectedContentHash) {
    throw new ReviewRequestError(`Translation preview changed for ${input.languageTag}; review it again.`);
  }
  const existing = await tx.whatsAppTemplateLocale.findUnique({
    where: { definitionId_languageTag: { definitionId: input.definitionId, languageTag: input.languageTag } },
  });
  if (item.resultLocaleId && (!existing || item.resultLocaleId !== existing.id)) {
    throw new ReviewRequestError("Translation item links to a different finalised locale.");
  }
  return finaliseLocaleTransaction(tx, {
    definitionId: input.definitionId, languageTag: input.languageTag, providerCode,
    actorId: deps.principal.id, itemId: item.id, decision: input.decision, existing, candidate,
  });
}
function rethrowReviewError(error: unknown): never {
  if (error && typeof error === "object" && "code" in error && (error.code === "P2034" || error.code === "P2002")) {
    throw new ReviewRequestError("Another administrator changed this locale; refresh before retrying.");
  }
  throw error;
}

/** Row-lock serialisation + unique locale constraint; failed audits roll back the locale and item link. */
export async function reviewTranslation(input: ReviewInput, deps: ReviewDependencies): Promise<{ replay: boolean }> {
  requireTemplateSuperAdmin(deps.principal);
  checkRequest(input);
  try {
    return await deps.db.$transaction(async (tx) => {
      const context = await loadReviewContext(tx, input, deps);
      const result = await applyLocaleDecision(tx, context, input, deps);
      if (input.decision === "APPROVE") await synchroniseCompletedTranslationLifecycle(tx, context.definition, context.run);
      return result;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
  } catch (error) { return rethrowReviewError(error); }
}

/** Explicit operator-reviewed set, not automatic approval. All writes and their
 * existing per-locale audit events commit together or roll back together. The
 * exact compiled bytes shown to the operator are fenced inside the transaction. */
export async function approveReviewedTranslations(raw: ReviewedTranslationBatch, deps: ReviewDependencies): Promise<{ approved: number; replayed: number }> {
  requireTemplateSuperAdmin(deps.principal);
  const input = parseReviewedTranslationBatch(raw);
  if (!input) throw new ReviewRequestError("Invalid reviewed translation selection.");
  try {
    return await deps.db.$transaction(async tx => {
      const context = await loadReviewContext(tx, input, deps);
      const actors = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "public"."PlatformAdmin" WHERE "id"=${deps.principal.id} AND "active"=true AND "role"='SUPER_ADMIN' FOR SHARE
      `);
      if (actors.length !== 1) throw new ReviewRequestError("An active SUPER_ADMIN is required.");
      if (context.english.authoring.family !== "META_RECOVERY") throw new ReviewRequestError("Consolidated review is available for recovery templates only.");
      const ref = context.english.authoring.commonLayout;
      const commonLayouts = ref ? await readSavedCommonLayoutSet(tx, ref.definitionId, ref.sourceHash) : undefined;
      let approved = 0, replayed = 0;
      for (const locale of input.locales) {
        const result = await applyLocaleDecision(tx, context, { definitionId: input.definitionId, runId: input.runId,
          languageTag: locale.languageTag, decision: "APPROVE" }, deps, { expectedContentHash: locale.contentHash, commonLayouts });
        if (result.replay) replayed++; else approved++;
      }
      await synchroniseCompletedTranslationLifecycle(tx, context.definition, context.run);
      return { approved, replayed };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 60_000 });
  } catch (error) { return rethrowReviewError(error); }
}

/** Explicit repair for historical definitions whose completed run never advanced
 * the definition lifecycle. No new translation, review or provider operation. */
export async function synchroniseTranslationLifecycle(definitionId: string, deps: ReviewDependencies): Promise<boolean> {
  requireTemplateSuperAdmin(deps.principal);
  if (typeof definitionId !== "string" || !/^wtdef_[a-f0-9]{64}$/.test(definitionId)) throw new ReviewRequestError("Invalid template definition ID.");
  return deps.db.$transaction(async tx => {
    await deps.ensureActor?.(tx);
    const locks = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "whatsapp"."WhatsAppTemplateDefinition" WHERE "id"=${definitionId} FOR UPDATE
    `);
    if (locks.length !== 1) throw new ReviewRequestError("Template definition not found.");
    const actors = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "public"."PlatformAdmin" WHERE "id"=${deps.principal.id} AND "active"=true AND "role"='SUPER_ADMIN' FOR SHARE
    `);
    if (actors.length !== 1) throw new ReviewRequestError("An active SUPER_ADMIN is required.");
    const definition = await tx.whatsAppTemplateDefinition.findUnique({ where: { id: definitionId } });
    if (!definition) throw new ReviewRequestError("Template definition not found.");
    const run = await tx.whatsAppTemplateTranslationRun.findFirst({ where: { definitionId },
      orderBy: [{ requestedAt: "desc" }, { id: "desc" }], include: { items: lifecycleItems } });
    return synchroniseCompletedTranslationLifecycle(tx, definition, run);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
}
