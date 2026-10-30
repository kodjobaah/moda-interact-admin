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
    headerMediaRole?: "LOGO" | "SQUARE_LOGO" | "COVER_IMAGE" | "CHECKOUT_PRODUCT";
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

/** The provider can drift without having populated the explicit drift timestamp yet. */
export function hasMetaProviderDrift(row: Pick<MetaRegistrationView,
  "driftDetectedAt" | "lastObservedContentHash" | "submittedContentHash" | "lastObservedCategory">): boolean {
  return Boolean(row.driftDetectedAt ||
    (row.lastObservedContentHash && row.lastObservedContentHash !== row.submittedContentHash) ||
    (row.lastObservedCategory && row.lastObservedCategory !== "MARKETING"));
}

export class MetaSubmissionError extends Error {
  constructor(readonly reasonCode: string, message: string) {
    super(message);
    this.name = "MetaSubmissionError";
  }
}

export const DEFINITION_ID = /^wtdef_[0-9a-f]{64}$/;
export const DIGEST = /^[0-9a-f]{64}$/;
