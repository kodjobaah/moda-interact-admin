import type { Prisma } from "@prisma/client";
import { templateHash } from "../authoring/identifiers";
import { frozenLocaleSnapshot } from "./snapshot";
import { MetaSubmissionError, type MetaSubmissionPlan } from "./contracts";

/** Caller holds definition and English row locks in the confirmed submission transaction. */
export async function reviewConfirmedEnglish(tx: Prisma.TransactionClient, plan: MetaSubmissionPlan, actorId: string): Promise<void> {
  const actors = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "public"."PlatformAdmin"
    WHERE "id"=${actorId} AND "active"=true AND "role"='SUPER_ADMIN' FOR SHARE
  `;
  if (actors.length !== 1) throw new MetaSubmissionError("FORBIDDEN", "An active SUPER_ADMIN must confirm this review.");
  const definition = await tx.whatsAppTemplateDefinition.findUnique({ where: { id: plan.definitionId } });
  const english = await tx.whatsAppTemplateLocale.findUnique({ where: {
    definitionId_languageTag: { definitionId: plan.definitionId, languageTag: "en" },
  } });
  const planned = plan.locales.find(locale => locale.languageTag === "en");
  if (!definition || definition.kind !== "META_RECOVERY" || definition.retiredAt ||
      definition.sourceHash !== plan.sourceHash || !english || !planned ||
      english.id !== planned.localeId || english.contentHash !== planned.contentHash ||
      !["SOURCE_SAVED", "REVIEWED"].includes(english.status) ||
      templateHash(frozenLocaleSnapshot(english, definition)) !== templateHash(planned)) {
    throw new MetaSubmissionError("STALE_PREVIEW", "The confirmed immutable English source changed. Refresh and review again.");
  }
  if (english.status === "REVIEWED") {
    if (!english.reviewedAt || !english.reviewedByAdminId) throw new MetaSubmissionError("INVALID_LOCALE", "English review attribution is missing.");
    return;
  }
  const changed = await tx.whatsAppTemplateLocale.updateMany({
    where: { id: english.id, definitionId: plan.definitionId, languageTag: "en", status: "SOURCE_SAVED", contentHash: planned.contentHash },
    data: { status: "REVIEWED", reviewedByAdminId: actorId, reviewedAt: new Date() },
  });
  if (changed.count !== 1) throw new MetaSubmissionError("STALE_PREVIEW", "The English review changed concurrently.");
  await tx.commerceAuditEvent.create({ data: {
    actorType: "PLATFORM_ADMIN", actorAdminId: actorId, action: "REVIEW_WHATSAPP_TEMPLATE_LOCALE",
    operationId: `${plan.definitionId}:en`, reason: "Immutable English source explicitly reviewed during all-language Meta confirmation",
    metadata: { definitionId: plan.definitionId, languageTag: "en", decision: "APPROVE",
      sourceHash: plan.sourceHash, contentHash: planned.contentHash, confirmedPlanDigest: plan.digest },
  } });
}
