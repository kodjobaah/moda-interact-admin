export const PROMOTION_SCOPES = ["GLOBAL", "PLAN", "SHOP"] as const;
export type PromotionScope = (typeof PROMOTION_SCOPES)[number];

export type PromotionCampaignFormValues = {
  id: string | null;
  intent: "create" | "update" | "activate";
  name: string;
  merchantDescription: string | null;
  scope: PromotionScope;
  quantity: number;
  targetPlanId: string | null;
  targetShopId: string | null;
  startsAt: Date;
  expiresAt: Date;
};

function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function requiredText(value: FormDataEntryValue | null, label: string): string {
  const result = text(value);
  if (!result) throw new Error(`${label} is required.`);
  return result;
}

function requiredDate(value: FormDataEntryValue | null, label: string): Date {
  const raw = requiredText(value, label);
  const result = new Date(raw);
  if (Number.isNaN(result.getTime())) throw new Error(`${label} is invalid.`);
  return result;
}

function requiredPositiveInteger(
  value: FormDataEntryValue | null,
  label: string,
): number {
  const result = Number(requiredText(value, label));
  if (!Number.isSafeInteger(result) || result <= 0 || result > 1_000_000) {
    throw new Error(`${label} must be a positive integer up to 1,000,000.`);
  }
  return result;
}

export function validatePromotionTarget(
  scope: PromotionScope,
  targetPlanId: string | null,
  targetShopId: string | null,
): void {
  const validShape =
    (scope === "GLOBAL" && !targetPlanId && !targetShopId) ||
    (scope === "PLAN" && Boolean(targetPlanId) && !targetShopId) ||
    (scope === "SHOP" && !targetPlanId && Boolean(targetShopId));
  if (!validShape) throw new Error("Campaign target does not match its scope.");
}

export function validatePromotionCampaignTerms(values: {
  name: string;
  merchantDescription: string | null;
  scope: PromotionScope;
  quantity: number;
  targetPlanId: string | null;
  targetShopId: string | null;
  startsAt: Date;
  expiresAt: Date;
}): void {
  validatePromotionTarget(values.scope, values.targetPlanId, values.targetShopId);
  if (!Number.isSafeInteger(values.quantity) || values.quantity <= 0 || values.quantity > 1_000_000) {
    throw new Error("Quantity must be a positive integer up to 1,000,000.");
  }
  if (values.expiresAt <= values.startsAt) {
    throw new Error("Expiry must be after the start time.");
  }
  if (values.name.length > 255) throw new Error("Campaign name must be at most 255 characters.");
  if ((values.merchantDescription ?? "").length > 10_000) {
    throw new Error("Merchant description must be at most 10,000 characters.");
  }
}

export function parsePromotionCampaignForm(
  formData: FormData,
): PromotionCampaignFormValues {
  const intent = text(formData.get("intent"));
  if (intent !== "create" && intent !== "update" && intent !== "activate") {
    throw new Error("Invalid promotion campaign action.");
  }

  const scope = text(formData.get("scope"));
  if (!PROMOTION_SCOPES.includes(scope as PromotionScope)) {
    throw new Error("Campaign scope must be GLOBAL, PLAN or SHOP.");
  }
  const targetPlanId = text(formData.get("targetPlanId")) || null;
  const targetShopId = text(formData.get("targetShopId")) || null;
  validatePromotionTarget(scope as PromotionScope, targetPlanId, targetShopId);

  const startsAt = requiredDate(formData.get("startsAt"), "Start time");
  const expiresAt = requiredDate(formData.get("expiresAt"), "Expiry time");
  const name = requiredText(formData.get("name"), "Campaign name");
  const description = text(formData.get("merchantDescription"));
  const values = {
    id: text(formData.get("id")) || null,
    intent: intent as "create" | "update" | "activate",
    name,
    merchantDescription: description || null,
    scope: scope as PromotionScope,
    quantity: requiredPositiveInteger(formData.get("quantity"), "Quantity"),
    targetPlanId,
    targetShopId,
    startsAt,
    expiresAt,
  };
  validatePromotionCampaignTerms(values);
  return values;
}