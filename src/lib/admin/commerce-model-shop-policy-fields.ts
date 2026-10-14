import {
  COMMERCE_MODEL_BUDGET_FIELDS,
  CommerceBudgetValidationError,
  LIVE_BACKGROUND_DEADLINE_ENVELOPE_MS,
  type CommerceBudgetFieldErrors,
  type CommerceBudgetKey,
} from "./commerce-model-policy-fields.ts";
export type SparseShopCommerceBudget = Partial<Record<CommerceBudgetKey, number>>;

/** The only accepted Shop override keys are those shared with the Platform editor. */
export function parseLiveShopBudgetForm(form: FormData, trustedShopId: string): {
  shopId: string;
  expectedEditVersion: number;
  budget: SparseShopCommerceBudget;
  reason: string;
} {
  const errors: CommerceBudgetFieldErrors = {};
  const budget: SparseShopCommerceBudget = {};
  for (const field of COMMERCE_MODEL_BUDGET_FIELDS) {
    if (form.get(`override_${field.key}`) !== "on") continue;
    const raw = form.get(field.key);
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
      errors[field.key] = `${field.label} must be a positive whole number.`;
      continue;
    }
    const number = Number(value);
    if (field.key === "deadlineMs" && number > LIVE_BACKGROUND_DEADLINE_ENVELOPE_MS) {
      errors.deadlineMs = `The current LIVE Background envelope supports up to ${LIVE_BACKGROUND_DEADLINE_ENVELOPE_MS} ms.`;
      continue;
    }
    budget[field.key] = number;
  }
  const rawVersion = form.get("expectedEditVersion");
  const version = typeof rawVersion === "string" ? rawVersion.trim() : "";
  if (!/^(0|[1-9]\d*)$/.test(version) || !Number.isSafeInteger(Number(version))) {
    errors.expectedEditVersion = "Policy version is invalid; reload before saving.";
  }
  const rawReason = form.get("reason");
  const reason = typeof rawReason === "string" ? rawReason.trim() : "";
  if (!reason || reason.length > 1000) errors.reason = "An audit reason of 1–1000 characters is required.";
  if (!trustedShopId || trustedShopId.length > 128) {
    throw new Error("Select an existing merchant before changing the CommerceAgent policy.");
  }
  // Form values are never trusted as the mutation owner, even if the attacker
  // chooses the ID of another real Shop. The server-issued scope controls it.
  if (form.get("shopId") !== trustedShopId) {
    throw new Error("Merchant scope does not match the selected tenant. Reload before saving.");
  }
  if (Object.keys(errors).length) throw new CommerceBudgetValidationError(errors);
  return { shopId: trustedShopId, expectedEditVersion: Number(version), budget, reason };
}
