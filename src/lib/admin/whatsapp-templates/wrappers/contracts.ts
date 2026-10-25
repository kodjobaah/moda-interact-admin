import type { WrapperPrepared, WrapperAudience } from "../authoring/types";

/** Persisted JSONB is untrusted until validated by eligibility.ts. */
export type WrapperLocaleRow = {
  languageTag: string;
  status: string;
  providerLanguageCode: string | null;
  localeAst: unknown;
  contentHash: string | null;
  reviewedByAdminId: string | null;
  reviewedAt: Date | null;
};
export type WrapperDefinitionRow = {
  id: string;
  kind: string;
  audience: string | null;
  status: string;
  sourceLanguageTag: string;
  astSchemaVersion: number;
  sourceHash: string;
  createdByAdminId: string;
  publishedAt: Date | null;
  retiredAt: Date | null;
  createdAt: Date;
  locales: WrapperLocaleRow[];
};
export type WrapperEligibility =
  | { eligible: true; projections: Record<string, WrapperPrepared> }
  | { eligible: false; reason: string };

export const WRAPPER_AUDIENCES = ["SHARED", "AI", "HUMAN"] as const;
export type Audience = WrapperAudience;
export const WRAPPER_DEFINITION_ID = /^wtdef_[a-f0-9]{64}$/;

export type WrapperSlot = {
  audience: Audience;
  definitionId: string | null;
  editVersion: number | null;
  updatedAt: string | null;
  effectiveDefinitionId: string | null;
  effectiveFrom: Audience | null;
};
export type WrapperCandidate = {
  id: string;
  audience: Audience;
  sourceHash: string;
  publishedAt: string | null;
  createdAt: string;
  eligible: boolean;
  reason: string | null;
};
export type WrapperPreviewDefinition = {
  id: string;
  audience: Audience;
  sourceHash: string;
  publishedAt: string | null;
  projections: Record<string, WrapperPrepared>;
};
export type WrapperActivationHistory = {
  createdAt: string;
  actorId: string | null;
  audience: Audience;
  previousDefinitionId: string | null;
  newDefinitionId: string;
  editVersion: number;
  reason: string;
};
export type WrapperPublicationWorkspace = {
  slots: WrapperSlot[];
  candidates: WrapperCandidate[];
  selectedDefinitionId: string | null;
  proposed: WrapperPreviewDefinition | null;
  current: WrapperPreviewDefinition | null;
  history: WrapperActivationHistory[];
};

/** The client supplies only the intended pointer and the version seen during review. */
export type ActivateWrapperInput = {
  audience: Audience;
  definitionId: string;
  expectedDefinitionId: string | null;
  expectedVersion: number | null;
  reason: string;
};
export type ActivateWrapperResult = { replay: boolean; editVersion: number };
