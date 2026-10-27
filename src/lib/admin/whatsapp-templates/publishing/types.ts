/** Client-safe ARCH-047 publication contracts. No database records or credentials. */
export type PublicationScope =
  | { mode: "one"; shopId: string }
  | { mode: "selected"; shopIds: string[] }
  | { mode: "all" };
export type ImpactKind = "new" | "unchanged" | "replaced" | "override" | "conflict";
export type BrandAvailability = "configured" | "missing" | "unverifiable";
export type BrandIndicator = { key: string; availability: BrandAvailability };
export type CompiledTemplateView = {
  provenance: "moda" | "legacy" | "none";
  label: string;
  providerTemplateName: string | null;
  providerLanguageCode: string | null;
  status: string | null;
  category: string | null;
  header: string | null;
  headerFormat?: "IMAGE";
  body: string | null;
  footer: string | null;
  buttons: Array<{ text: string; url: string; type: string }> | null;
  bindings: { headerMediaRole?: "LOGO" | "SQUARE_LOGO" | "COVER_IMAGE";
    header: Array<{ position: number; variable: string }>;
    body: Array<{ position: number; variable: string }>;
    buttons: Array<{ index: number; variable: string }> } | null;
};
export type LanguageComparison = {
  shopId: string; languageTag: string; impact: ImpactKind;
  previous: CompiledTemplateView; proposed: CompiledTemplateView;
  brand: BrandIndicator[];
};
export type PublicationShopImpact = {
  shopId: string; domain: string; platform: string;
  counts: Record<ImpactKind, number>;
  brand: BrandIndicator[];
};
export type PublicationPreview = {
  definitionId: string; fingerprint: string; issuedAt: string;
  totalShops: number; totalTargets: number;
  excludedCount: number; exclusionReasons: Array<{ reason: string; count: number }>;
  page: number; pageSize: number; hasNext: boolean;
  shops: PublicationShopImpact[];
  impactCounts: Record<ImpactKind, number>;
  brandFields: string[];
  expiresAt: string;
};
export type ConfirmationRequest = {
  definitionId: string; scope: PublicationScope; previewFingerprint: string; previewIssuedAt: string;
  operationKey: string; reason: string; acknowledgeOverrides: boolean;
};
export type PublicationProgress = {
  operationId: string; status: string;
  totalShops: number; succeededShops: number; failedShops: number; pendingShops: number;
  totalTargets: number; succeededTargets: number; failedTargets: number; pendingTargets: number;
  nextPageCursor: string | null; failureCode: string | null;
};

export const SHOP_PAGE_SIZE = 10;
export const PROCESS_PAGE_SIZE = 5;
export const MAX_SELECTED_SHOPS = 200;
export const MAX_SNAPSHOT_SHOPS = 20000;
export const EXPECTED_LANGUAGES = 20;
export const PREVIEW_TTL_MS = 5 * 60_000;
