import type { ImmutableAuthoringRecord, PreparedTemplate, TemplateAst, TemplatePreviewDTO, SemanticVariable } from "../authoring/types";

/** ADMIN-004 -> Background -> ADMIN-005 persisted JSONB handoff (not a new Shared contract). */
export type ProtectedOccurrence = { marker: string; variable: SemanticVariable };
export type SourceSegment = { key: string; text: string; protectedTokens: ProtectedOccurrence[] };
export type TranslationSourceSnapshot = {
  schemaVersion: 1;
  definitionId: string;
  sourceHash: string;
  sourceLanguageTag: "en";
  segments: SourceSegment[];
};
export type TranslationSegmentResult = { schemaVersion: 1; segments: Array<{ key: string; text: string }> };
export type CompilationCandidate = {
  record: ImmutableAuthoringRecord;
  contentHash: string;
  preview: TemplatePreviewDTO;
};
export type CompiledBindings = PreparedTemplate;

export type ReviewLocaleStatus = "SOURCE" | "APPROVED" | "REJECTED" | "READY" | "WAITING" | "INVALID";
export type ReviewLocaleDTO = {
  languageTag: string;
  providerLanguageCode: string | null;
  status: ReviewLocaleStatus;
  reason: string | null;
  preview: TemplatePreviewDTO | null;
  authoring: TemplateAst | null;
  prepared: PreparedTemplate | null;
  contentHash: string | null;
  reviewedAt: string | null;
  runId: string | null;
};
export type ReviewWorkspaceDTO = {
  definitionId: string;
  sourceHash: string;
  family: TemplateAst["family"];
  source: ReviewLocaleDTO;
  locales: ReviewLocaleDTO[];
  approvedCount: number;
  readyForPublication: boolean;
};
export type ReviewDecision = "APPROVE" | "REJECT";
export type ReviewInput = { definitionId: string; languageTag: string; runId: string; decision: ReviewDecision };

export type SegmentLocation = {
  key: string;
  nodes?: import("../authoring/types").ContentNode[];
  buttonIndex?: number;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
