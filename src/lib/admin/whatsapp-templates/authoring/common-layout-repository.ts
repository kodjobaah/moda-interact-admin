import type { Prisma } from "@prisma/client";
import type { CommonRecoveryLayoutReference } from "@modainteract/moda-interact-shared/commerce/presentation";
import { requireCommonLayout } from "./common-layout";
import { templateHash } from "./identifiers";
import {
  checkWrapperEligibility,
  WRAPPER_STAGING_STATUSES,
} from "../wrappers/eligibility";

export class SavedCommonLayoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SavedCommonLayoutError";
  }
}

type LayoutReader = Pick<
  Prisma.TransactionClient,
  "whatsAppTemplateDefinition"
>;
/** Re-read all reviewed locales from the same immutable SHARED revision. Active pointers are deliberately not changed. */
export async function readSavedCommonLayoutSet(
  db: LayoutReader,
  definitionId: string,
  expectedSourceHash?: string,
): Promise<CommonRecoveryLayoutReference[]> {
  const definition = await db.whatsAppTemplateDefinition.findUnique({
    where: { id: definitionId },
    include: { locales: true },
  });
  if (
    !definition ||
    (expectedSourceHash && definition.sourceHash !== expectedSourceHash)
  )
    throw new SavedCommonLayoutError(
      "Common layout source changed or is unavailable.",
    );
  const eligible = checkWrapperEligibility(definition, "SHARED");
  if (!eligible.eligible)
    throw new SavedCommonLayoutError(
      `Common layout is not ready: ${eligible.reason}`,
    );
  return definition.locales.map((locale) => {
    try {
      return requireCommonLayout({
        schemaVersion: 1,
        definitionId,
        sourceHash: definition.sourceHash,
        localeId: locale.id,
        languageTag: locale.languageTag,
        contentHash: locale.contentHash,
        prepared: eligible.projections[locale.languageTag],
      });
    } catch (error) {
      throw new SavedCommonLayoutError(
        `${locale.languageTag}: ${error instanceof Error ? error.message : "Invalid saved common layout reference."}`,
      );
    }
  });
}
export async function readSavedCommonLayout(
  db: LayoutReader,
  definitionId: string,
  languageTag: string,
  expectedSourceHash?: string,
): Promise<CommonRecoveryLayoutReference> {
  const saved = (
    await readSavedCommonLayoutSet(db, definitionId, expectedSourceHash)
  ).find((ref) => ref.languageTag === languageTag);
  if (!saved)
    throw new SavedCommonLayoutError(
      "The matching common layout language is not reviewed.",
    );
  return saved;
}
export async function assertSavedCommonLayout(
  db: LayoutReader,
  raw: unknown,
): Promise<void> {
  const ref = requireCommonLayout(raw);
  const saved = await readSavedCommonLayout(
    db,
    ref.definitionId,
    ref.languageTag,
    ref.sourceHash,
  );
  if (templateHash(saved) !== templateHash(ref))
    throw new SavedCommonLayoutError(
      "Common layout snapshot differs from its saved immutable locale. Refresh the selection.",
    );
}

/** Selector and save gates share the same immutable readiness checks; status alone is never readiness. */
export async function listReviewedCommonLayouts(
  db: LayoutReader,
): Promise<CommonRecoveryLayoutReference[]> {
  const rows = await db.whatsAppTemplateDefinition.findMany({
    where: {
      kind: "MODA_CONVERSATION_WRAPPER",
      audience: "SHARED",
      retiredAt: null,
      status: { in: WRAPPER_STAGING_STATUSES },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 40,
    select: { id: true },
  });
  const result: CommonRecoveryLayoutReference[] = [];
  for (const row of rows) {
    try {
      result.push(await readSavedCommonLayout(db, row.id, "en"));
    } catch (error) {
      if (!(error instanceof SavedCommonLayoutError))
        throw error; /* Ineligible historical sources are not choices. */
    }
  }
  return result;
}
