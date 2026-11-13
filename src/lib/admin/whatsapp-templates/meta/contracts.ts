import type { RecoveryTemplateHeaderMediaRole } from "@modainteract/moda-interact-shared/recovery-template-bindings";

/** Safe values crossing the Admin Server Component/action boundary (no sender secrets). */
export type MetaLocaleSnapshot = {
  localeId: string;
  languageTag: string;
  providerLanguageCode: string;
  contentHash: string;
  components: Array<Record<string, unknown>>;
  bindings: {
    schemaVersion: 1;
    /** Existing TEXT submissions retain these audit fields; IMAGE role bindings use the frozen v1 five-field projection. */
    sourceHash?: string;
    localeContentHash?: string;
    promotionTarget?: "CHECKOUT" | "ALTERNATIVE_PRODUCT";
    headerMediaRole?: RecoveryTemplateHeaderMediaRole;
    header: Array<{ position: number; variable: string }>;
    body: Array<{ position: number; variable: string }>;
    buttons: Array<{ index: number; subType: "url"; variable: "checkout.url" | "promotion.productUrl" }>;
  };
};

export type MetaSubmissionPlan = {
  definitionId: string;
  sourceHash: string;
  providerTemplateName: string;
  category: "MARKETING";
  wabaId: string;
  digest: string;
  locales: MetaLocaleSnapshot[];
};

export type MetaEventView = {
  id: string;
  eventType: string;
  source: string;
  outcome: string | null;
  reasonCode: string | null;
  failureCode: string | null;
  receivedAt: string;
};

export type MetaRegistrationView = {
  id: string;
  localeId: string;
  languageTag: string;
  providerLanguageCode: string;
  wabaId: string;
  submittedContentHash: string;
  /** Server-derived provider component fingerprint; distinct from prepared identity. */
  expectedProviderContentHash: string | null;
  submissionState: string;
  providerStatus: string | null;
  failureCode: string | null;
  providerTemplateId: string | null;
  lastSubmittedAt: string | null;
  nextRetryAt: string | null;
  lastReconciledAt: string | null;
  driftDetectedAt: string | null;
  lastObservedContentHash: string | null;
  lastObservedCategory: string | null;
  events: MetaEventView[];
};

export type MetaStatusView = {
  definitionId: string;
  registrations: MetaRegistrationView[];
  updatedAt: string;
};

/** Provider observations compare only to the server-derived component fingerprint. */
export function hasMetaProviderDrift(row: Pick<MetaRegistrationView,
  "driftDetectedAt" | "lastObservedContentHash" | "expectedProviderContentHash" | "lastObservedCategory">): boolean {
  if (row.driftDetectedAt != null) return true;
  const observed = row.lastObservedContentHash;
  const category = row.lastObservedCategory;
  if (observed == null && category == null) return false;
  const expected = row.expectedProviderContentHash;
  if (typeof expected !== "string" || !DIGEST.test(expected)) return true;
  return (observed != null && (typeof observed !== "string" || !DIGEST.test(observed) || observed !== expected)) ||
    (category != null && category !== "MARKETING");
}

export class MetaSubmissionError extends Error {
  constructor(readonly reasonCode: string, message: string) {
    super(message);
    this.name = "MetaSubmissionError";
  }
}

export const DEFINITION_ID = /^wtdef_[0-9a-f]{64}$/;
export const DIGEST = /^[0-9a-f]{64}$/;
