/** Platform pointers are per WABA and recovery purpose, never per shop or locale. */
export const RECOVERY_DEFAULT_PURPOSES = [
  "INITIAL_NO_OFFER", "INITIAL_CODE_OFFER", "INITIAL_AUTOMATIC_OFFER",
  "FOLLOW_UP_NO_OFFER", "FOLLOW_UP_CODE_OFFER", "FOLLOW_UP_AUTOMATIC_OFFER",
] as const;
export type RecoveryDefaultPurpose = typeof RECOVERY_DEFAULT_PURPOSES[number];
export const RECOVERY_DEFAULT_LABELS: Record<RecoveryDefaultPurpose, string> = {
  INITIAL_NO_OFFER: "Initial — no offer",
  INITIAL_CODE_OFFER: "Initial — code offer",
  INITIAL_AUTOMATIC_OFFER: "Initial — automatic offer",
  FOLLOW_UP_NO_OFFER: "Follow-up — no offer",
  FOLLOW_UP_CODE_OFFER: "Follow-up — code offer",
  FOLLOW_UP_AUTOMATIC_OFFER: "Follow-up — automatic offer",
};
export type DefaultPointerView = {
  definitionId: string;
  providerTemplateName: string | null;
  definitionStatus: string;
  publishedAt: string | null;
  updatedAt: string;
};
export type RecoveryDefaultOverview = {
  wabaId: string;
  slots: Array<{ purpose: RecoveryDefaultPurpose; current: DefaultPointerView | null }>;
};
export type RecoveryDefaultPreview = {
  definitionId: string;
  purpose: RecoveryDefaultPurpose;
  wabaId: string;
  providerTemplateName: string;
  headerKind: "NONE" | "TEXT" | "IMAGE";
  languageTags: string[];
  current: DefaultPointerView | null;
  fingerprint: string;
  issuedAt: string;
};
export type SetRecoveryDefaultInput = {
  definitionId: string;
  fingerprint: string;
  issuedAt: string;
  reason: string;
};
export type SetRecoveryDefaultResult = { definitionId: string; purpose: RecoveryDefaultPurpose; unchanged: boolean };
