import { targetTranslationLanguages } from "./locale-contract";

export type TranslationLocaleProgress = {
  languageTag: string;
  status: string;
  failureCode: string | null;
  retryCount: number;
  completedAt: string | null;
};
export type TranslationWorkspaceState = {
  definitionId: string;
  family: string;
  purpose: string | null;
  sourceLanguageTag: "en";
  sourceStatus: string;
  runId: string | null;
  runStatus: string | null;
  modelName: string | null;
  sourceHash: string;
  requestedAt: string | null;
  progress: "SAVED" | "TRANSLATION_QUEUED" | "TRANSLATING" | "PARTIALLY_FAILED" | "READY_FOR_REVIEW";
  completed: number;
  pending: number;
  failed: number;
  targets: TranslationLocaleProgress[];
  activelyProcessing: boolean;
};

const COMPLETE = new Set(["COMPLETED", "SUCCEEDED", "AVAILABLE", "READY_FOR_REVIEW", "REVIEWED"]);
const FAILED = new Set(["FAILED", "PARTIALLY_FAILED", "PERMANENTLY_FAILED"]);
const PROCESSING = new Set(["PROCESSING", "TRANSLATING", "RUNNING", "SUBMITTED", "BATCHED", "IN_PROGRESS"]);

export function isCompletedStatus(status: string): boolean { return COMPLETE.has(status); }
export function isFailedStatus(status: string): boolean { return FAILED.has(status); }

export function projectTranslationProgress(input: {
  definitionId: string; family: string; purpose: string | null; sourceHash: string;
  definitionStatus: string; run?: {
    id: string; status: string; requestedAt: Date | string;
    translationModel: { displayName: string };
    items: Array<{ targetLanguageTag: string; status: string; failureCode: string | null; retryCount: number; completedAt: Date | string | null }>;
  } | null;
}, languages: readonly string[] = targetTranslationLanguages()): TranslationWorkspaceState {
  const targets = languages.map((languageTag): TranslationLocaleProgress => {
    const matches = input.run?.items.filter((item) => item.targetLanguageTag === languageTag) ?? [];
    if (matches.length > 1) throw new Error("Duplicate target translation language in run.");
    const item = matches[0];
    return { languageTag, status: item?.status ?? "NOT_REQUESTED", failureCode: item?.failureCode?.slice(0, 128) ?? null,
      retryCount: item?.retryCount ?? 0, completedAt: item?.completedAt ? new Date(item.completedAt).toISOString() : null };
  });
  if (input.run && (input.run.items.length !== languages.length || targets.some((item) => item.status === "NOT_REQUESTED"))) {
    throw new Error("Translation run is missing one or more target language items.");
  }
  const completed = targets.filter((item) => isCompletedStatus(item.status)).length;
  const failed = targets.filter((item) => isFailedStatus(item.status)).length;
  const pending = targets.length - completed - failed;
  const activelyProcessing = Boolean(input.run && pending > 0 &&
    !["FAILED", "CANCELLED", "STALE"].includes(input.run.status));
  const progress: TranslationWorkspaceState["progress"] = !input.run ? "SAVED"
    : completed === targets.length ? "READY_FOR_REVIEW"
    : failed > 0 ? "PARTIALLY_FAILED"
    : targets.some((item) => PROCESSING.has(item.status)) || ["TRANSLATING", "PROCESSING"].includes(input.run.status)
      ? "TRANSLATING" : "TRANSLATION_QUEUED";
  return {
    definitionId: input.definitionId, family: input.family, purpose: input.purpose,
    sourceLanguageTag: "en", sourceStatus: input.definitionStatus, sourceHash: input.sourceHash,
    runId: input.run?.id ?? null, runStatus: input.run?.status ?? null,
    modelName: input.run?.translationModel.displayName ?? null,
    requestedAt: input.run?.requestedAt ? new Date(input.run.requestedAt).toISOString() : null,
    progress, completed, pending, failed, targets, activelyProcessing,
  };
}
