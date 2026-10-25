import { requirePlatformAdminRead } from "../../../auth/platform-admin";
import { prisma } from "../../../prisma";
import { requireTemplateSuperAdmin } from "../authoring/service";
import { templateHash } from "../authoring/identifiers";
import { compileTemplateAst } from "../authoring/compiler";
import { makeExamplePreview } from "../authoring/preview";
import { validateTemplateAst } from "../authoring/validation";
import type { ImmutableAuthoringRecord, TemplateAst } from "../authoring/types";
import { isCompletedTranslationItem } from "./service";
import type { ReviewLocaleDTO, ReviewWorkspaceDTO } from "./contracts";
import { reconstructAndCompile } from "./reconstruction";
import { REVIEW_LANGUAGES, providerLanguageCode } from "./language-codes";
import { validateEnglishEnvelope } from "./repository";

const DEF_ID = /^wtdef_[a-f0-9]{64}$/;
const diagnostic = (error: unknown): string => {
  // Only local compiler/validation messages, not raw DB/provider errors, reach the preview UI.
  const message = error instanceof Error ? error.message : "Unable to reconstruct translation.";
  return message.slice(0, 280);
};

function savedLocale(record: unknown, contentHash: string | null, family: TemplateAst["family"]): {
  record: ImmutableAuthoringRecord; preview: ReviewLocaleDTO["preview"];
} {
  if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("Saved locale content missing.");
  const saved = record as ImmutableAuthoringRecord;
  const checked = validateTemplateAst(saved.authoring);
  if (saved.schemaVersion !== 1 || !checked.ok || checked.value.family !== family ||
      !saved.prepared || templateHash(saved.prepared) !== contentHash ||
      templateHash(compileTemplateAst(checked.value)) !== contentHash) {
    throw new Error("Finalised locale failed content or compilation integrity checks.");
  }
  return { record: saved, preview: makeExamplePreview(saved.prepared) };
}

/** SUPER_ADMIN only; 20 full preview DTOs based on durable English, latest run and saved reviews. */
export async function getTranslationReviewWorkspace(definitionId: string): Promise<ReviewWorkspaceDTO | null> {
  requireTemplateSuperAdmin(await requirePlatformAdminRead());
  if (!DEF_ID.test(definitionId)) return null;
  const definition = await prisma.whatsAppTemplateDefinition.findUnique({
    where: { id: definitionId }, include: { locales: true,
      translationRuns: { orderBy: [{ requestedAt: "desc" }, { id: "desc" }], take: 1,
        include: { items: true } },
    },
  });
  if (!definition) return null;
  const englishRow = definition.locales.find((locale) => locale.languageTag === "en");
  const english = validateEnglishEnvelope(englishRow?.localeAst, definition.sourceHash, englishRow?.contentHash ?? null);
  const validated = validateTemplateAst(english.authoring);
  if (!validated.ok || validated.value.family !== definition.kind) throw new Error("Saved source AST is invalid.");
  const englishDTO: ReviewLocaleDTO = {
    languageTag: "en", providerLanguageCode: providerLanguageCode("en", english.authoring.family),
    status: "SOURCE", reason: null, preview: makeExamplePreview(english.prepared), authoring: english.authoring,
    prepared: english.prepared, contentHash: englishRow?.contentHash ?? null, reviewedAt: null, runId: null,
  };
  const run = definition.translationRuns[0];
  const items = new Map(run?.items.map((item) => [item.targetLanguageTag, item]) ?? []);
  const rows = new Map(definition.locales.map((locale) => [locale.languageTag, locale]));
  const locales: ReviewLocaleDTO[] = REVIEW_LANGUAGES.map((tag): ReviewLocaleDTO => {
    if (tag === "en") return englishDTO;
    const row = rows.get(tag);
    const item = items.get(tag);
    const base: ReviewLocaleDTO = {
      languageTag: tag, providerLanguageCode: providerLanguageCode(tag, english.authoring.family),
      status: "WAITING", reason: null, preview: null, authoring: null, prepared: null,
      contentHash: null, reviewedAt: row?.reviewedAt?.toISOString() ?? null, runId: run?.id ?? null,
    };
    if (row?.localeAst != null || row?.contentHash != null) {
      try {
        if (row?.status !== "REVIEWED" || row.providerLanguageCode !== base.providerLanguageCode) {
          throw new Error("Saved locale has incompatible review/provider status.");
        }
        const persisted = savedLocale(row.localeAst, row.contentHash, english.authoring.family);
        return { ...base, status: "APPROVED", preview: persisted.preview, authoring: persisted.record.authoring,
          prepared: persisted.record.prepared, contentHash: row.contentHash };
      } catch (error) { return { ...base, status: "INVALID", reason: diagnostic(error) }; }
    }
    if (!run || !item) return { ...base, status: row?.status === "REJECTED" ? "REJECTED" : "WAITING",
      reason: run ? "Language translation has not returned." : "Start a translation run to review this language." };
    if (!isCompletedTranslationItem(item)) return { ...base, status: row?.status === "REJECTED" ? "REJECTED" : "WAITING",
      reason: item.failureCode ? "Translation failed. Retry it in the translation workspace." : "Translation pending or processing." };
    try {
      const candidate = reconstructAndCompile({ definitionId: definition.id,
        definitionSourceHash: definition.sourceHash, runSourceHash: run.sourceHash,
        languageTag: tag, english: english.authoring, snapshot: run.sourceSnapshot,
        translated: item.translatedAst, outputContentHash: item.outputContentHash });
      return { ...base, status: row?.status === "REJECTED" ? "REJECTED" : "READY", reason: null,
        preview: candidate.preview, authoring: candidate.record.authoring,
        prepared: candidate.record.prepared, contentHash: candidate.contentHash };
    } catch (error) { return { ...base, status: "INVALID", reason: diagnostic(error) }; }
  });
  const approvedCount = locales.filter((locale) => locale.status === "APPROVED" || locale.status === "SOURCE").length;
  return { definitionId: definition.id, sourceHash: definition.sourceHash, family: english.authoring.family,
    source: englishDTO, locales, approvedCount, readyForPublication: approvedCount === REVIEW_LANGUAGES.length };
}
