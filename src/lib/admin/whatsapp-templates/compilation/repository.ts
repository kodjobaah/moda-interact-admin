import { Prisma, type PrismaClient } from "@prisma/client";
import type { ImmutableAuthoringRecord } from "../authoring/types";
import { templateHash } from "../authoring/identifiers";
import { stableJson } from "../authoring/canonical";
import type { CompilationCandidate, ReviewDecision } from "./contracts";

export type ReviewRepository = Pick<PrismaClient,
  "$transaction" | "whatsAppTemplateDefinition" | "whatsAppTemplateTranslationRun" | "whatsAppTemplateLocale">;

export type FinalisationRecord = {
  definitionId: string;
  languageTag: string;
  providerCode: string | null;
  actorId: string;
  itemId: string;
  decision: ReviewDecision;
  existing: {
    id: string;
    localeAst: unknown;
    contentHash: string | null;
    status: string;
    providerLanguageCode: string | null;
  } | null;
  candidate: CompilationCandidate | null;
};

/** Caller holds a per-definition PostgreSQL row lock. Never revise finalised JSONB. */
export async function finaliseLocaleTransaction(tx: Prisma.TransactionClient, input: FinalisationRecord): Promise<{ replay: boolean }> {
  const { existing, candidate, decision } = input;
  if (existing?.localeAst != null || existing?.contentHash != null) {
    if (decision === "APPROVE" && existing.status === "REVIEWED" && candidate &&
        existing.contentHash === candidate.contentHash &&
        stableJson(existing.localeAst) === stableJson(candidate.record) &&
        existing.providerLanguageCode === input.providerCode) return { replay: true };
    throw new Error("Locale content is already finalised and immutable. Clone as New to correct it.");
  }
  if (existing?.providerLanguageCode != null && existing.providerLanguageCode !== input.providerCode) {
    throw new Error("Existing locale has an incompatible provider language code.");
  }
  if (existing?.status === "REJECTED") {
    if (decision === "REJECT") return { replay: true };
    throw new Error("Rejected translation is closed. Clone as New for a new translation/review lifecycle.");
  }
  if (decision === "APPROVE" && !candidate) throw new Error("Cannot approve a malformed translation.");
  const nextStatus = decision === "APPROVE" ? "REVIEWED" : "REJECTED";
  const data = {
    providerLanguageCode: input.providerCode,
    localeAst: decision === "APPROVE" ? candidate!.record as unknown as Prisma.InputJsonValue : Prisma.DbNull,
    contentHash: decision === "APPROVE" ? candidate!.contentHash : null,
    status: nextStatus,
    reviewedByAdminId: input.actorId,
    reviewedAt: new Date(),
  };
  const locale = existing
    ? await tx.whatsAppTemplateLocale.update({ where: { id: existing.id }, data })
    : await tx.whatsAppTemplateLocale.create({ data: {
        definitionId: input.definitionId, languageTag: input.languageTag, ...data,
      } });
  if (decision === "APPROVE") {
    await tx.whatsAppTemplateTranslationItem.update({ where: { id: input.itemId }, data: { resultLocaleId: locale.id } });
  }
  await tx.commerceAuditEvent.create({ data: {
    actorType: "PLATFORM_ADMIN", actorAdminId: input.actorId,
    action: "REVIEW_WHATSAPP_TEMPLATE_LOCALE",
    operationId: `${input.definitionId.slice(0, 80)}:${input.languageTag}`.slice(0, 128),
    reason: decision === "APPROVE" ? "Immutable translation approved" : "Translation rejected without publishing",
    metadata: { definitionId: input.definitionId, languageTag: input.languageTag,
      decision, ...(candidate && decision === "APPROVE" ? { contentHash: candidate.contentHash } : {}) },
  } });
  return { replay: false };
}

export function validateEnglishEnvelope(value: unknown, definitionSourceHash: string, persistedContentHash: string | null): ImmutableAuthoringRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Immutable English locale is missing.");
  const record = value as ImmutableAuthoringRecord;
  if (record.schemaVersion !== 1 || !record.authoring || !record.prepared) throw new Error("English locale has no prepared source.");
  if (templateHash(record.authoring) !== definitionSourceHash ||
      templateHash(record.prepared) !== persistedContentHash) {
    throw new Error("English locale digest differs from the immutable source.");
  }
  return record;
}
