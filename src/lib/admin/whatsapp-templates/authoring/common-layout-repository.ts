import type { Prisma } from "@prisma/client";
import type { CommonRecoveryLayoutReference } from "@modainteract/moda-interact-shared/commerce/presentation";
import { requireCommonLayout } from "./common-layout";
import { templateHash } from "./identifiers";
import { checkWrapperEligibility, WRAPPER_STAGING_STATUSES } from "../wrappers/eligibility";

type LayoutReader = Pick<Prisma.TransactionClient, "whatsAppTemplateDefinition">;
/** Re-read all reviewed locales from the same immutable SHARED revision. Active pointers are deliberately not changed. */
export async function readSavedCommonLayout(db: LayoutReader, definitionId: string, languageTag: string,
  expectedSourceHash?: string): Promise<CommonRecoveryLayoutReference> {
  const definition = await db.whatsAppTemplateDefinition.findUnique({ where: { id: definitionId }, include: { locales: true } });
  if (!definition || (expectedSourceHash && definition.sourceHash !== expectedSourceHash)) throw new Error("Common layout source changed or is unavailable.");
  const eligible = checkWrapperEligibility(definition, "SHARED");
  if (!eligible.eligible) throw new Error(`Common layout is not ready: ${eligible.reason}`);
  const locale = definition.locales.find(row => row.languageTag === languageTag);
  if (!locale) throw new Error("The matching common layout language is not reviewed.");
  return requireCommonLayout({ schemaVersion: 1, definitionId, sourceHash: definition.sourceHash,
    localeId: locale.id, languageTag, contentHash: locale.contentHash, prepared: eligible.projections[languageTag] });
}
export async function assertSavedCommonLayout(db: LayoutReader, raw: unknown): Promise<void> {
  const ref = requireCommonLayout(raw);
  const saved = await readSavedCommonLayout(db, ref.definitionId, ref.languageTag, ref.sourceHash);
  if (templateHash(saved) !== templateHash(ref)) throw new Error("Common layout snapshot differs from its saved immutable locale. Refresh the selection.");
}

/** Selector and save gates share the same immutable readiness checks; status alone is never readiness. */
export async function listReviewedCommonLayouts(db: LayoutReader): Promise<CommonRecoveryLayoutReference[]> {
  const rows = await db.whatsAppTemplateDefinition.findMany({
    where: { kind: "MODA_CONVERSATION_WRAPPER", audience: "SHARED", retiredAt: null,
      status: { in: WRAPPER_STAGING_STATUSES } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 40, select: { id: true },
  });
  const result: CommonRecoveryLayoutReference[] = [];
  for (const row of rows) {
    try { result.push(await readSavedCommonLayout(db, row.id, "en")); }
    catch { /* Incomplete or invalid immutable sources remain unavailable. */ }
  }
  return result;
}
