import { REVIEW_LANGUAGES } from "./language-codes";
import { isRecord, type ReviewedTranslationBatch } from "./contracts";

/** Only identities, candidate digests and an explicit operator acknowledgement
 * are accepted. No translated content or actor identity can arrive from the UI. */
export function parseReviewedTranslationBatch(value: unknown): ReviewedTranslationBatch | null {
  if (!isRecord(value) || Object.keys(value).sort().join() !== "acknowledged,definitionId,locales,runId" ||
      value.acknowledged !== true || typeof value.definitionId !== "string" || !/^wtdef_[a-f0-9]{64}$/.test(value.definitionId) ||
      typeof value.runId !== "string" || !value.runId || value.runId.length > 160 || !Array.isArray(value.locales) ||
      value.locales.length < 1 || value.locales.length > REVIEW_LANGUAGES.length - 1) return null;
  const locales: ReviewedTranslationBatch["locales"] = [];
  const seen = new Set<string>();
  for (const row of value.locales) {
    if (!isRecord(row) || Object.keys(row).sort().join() !== "contentHash,languageTag" || typeof row.languageTag !== "string" ||
        row.languageTag === "en" || !REVIEW_LANGUAGES.includes(row.languageTag) || seen.has(row.languageTag) ||
        typeof row.contentHash !== "string" || !/^[a-f0-9]{64}$/.test(row.contentHash)) return null;
    seen.add(row.languageTag); locales.push({ languageTag: row.languageTag, contentHash: row.contentHash });
  }
  return { definitionId: value.definitionId, runId: value.runId, acknowledged: true,
    locales: locales.sort((a,b) => a.languageTag.localeCompare(b.languageTag)) };
}
