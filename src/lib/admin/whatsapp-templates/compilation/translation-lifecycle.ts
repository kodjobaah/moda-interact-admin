import type { Prisma } from "@prisma/client";
import { REVIEW_LANGUAGES } from "./language-codes";

const STAGING = new Set([
  "SAVED",
  "TRANSLATION_QUEUED",
  "TRANSLATING",
  "PARTIALLY_FAILED",
]);
const AVAILABLE = new Set(["AVAILABLE", "COMPLETED", "COMPLETE", "SUCCEEDED"]);
const TERMINAL = new Set(["COMPLETED", "READY_FOR_REVIEW"]);
type Definition = {
  id: string;
  status: string;
  sourceHash: string;
  retiredAt: Date | null;
  publishedAt: Date | null;
};
type Run = {
  sourceHash: string;
  status: string;
  items: Array<{
    targetLanguageTag: string;
    status: string;
    failureCode: string | null;
    outputContentHash: string | null;
    currentBatchId: string | null;
    translatedAst: unknown;
  }>;
};

/** The run owns translation execution; READY_FOR_REVIEW only records that all
 * nineteen translations are available. It is not a review or Meta approval. */
export function canSynchroniseTranslationLifecycle(
  definition: Definition,
  run: Run | null | undefined,
): boolean {
  if (
    !STAGING.has(definition.status) ||
    definition.retiredAt ||
    definition.publishedAt ||
    !run ||
    !TERMINAL.has(run.status) ||
    run.sourceHash !== definition.sourceHash
  )
    return false;
  const targets = REVIEW_LANGUAGES.filter((tag) => tag !== "en");
  return (
    run.items.length === targets.length &&
    targets.every((tag) => {
      const rows = run.items.filter((item) => item.targetLanguageTag === tag);
      return (
        rows.length === 1 &&
        AVAILABLE.has(rows[0].status) &&
        !rows[0].failureCode &&
        rows[0].currentBatchId === null &&
        rows[0].translatedAst != null &&
        typeof rows[0].outputContentHash === "string" &&
        /^[a-f0-9]{64}$/.test(rows[0].outputContentHash)
      );
    })
  );
}

/** Caller holds the definition row lock. Never change reviewed content, run
 * outcomes, registration approvals, or a published/retired definition. */
export async function synchroniseCompletedTranslationLifecycle(
  tx: Prisma.TransactionClient,
  definition: Definition,
  run: Run | null | undefined,
): Promise<boolean> {
  if (!canSynchroniseTranslationLifecycle(definition, run)) return false;
  const result = await tx.whatsAppTemplateDefinition.updateMany({
    where: {
      id: definition.id,
      status: definition.status,
      sourceHash: definition.sourceHash,
      publishedAt: null,
      retiredAt: null,
    },
    data: { status: "READY_FOR_REVIEW" },
  });
  return result.count === 1;
}
export const lifecycleItems = {
  select: {
    targetLanguageTag: true,
    status: true,
    failureCode: true,
    outputContentHash: true,
    currentBatchId: true,
    translatedAst: true,
  },
} as const;
