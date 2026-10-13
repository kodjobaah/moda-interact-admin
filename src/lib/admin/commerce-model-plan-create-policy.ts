import { COMMERCE_MODEL_BUDGET_FIELDS, CommerceBudgetValidationError, type CommerceBudgetFieldErrors } from "./commerce-model-policy-fields.ts";
import { parseLivePlanBudgetForm, type SparseCommerceBudget } from "./commerce-model-plan-policy-fields.ts";

export type CreatePlanPolicyDraft = { budget: SparseCommerceBudget; reason: string };

/** A new plan has no ID yet. Validate its optional policy before opening the plan transaction. */
export function parseCreatePlanPolicyDraft(raw: unknown): CreatePlanPolicyDraft | null {
  if (typeof raw !== "string") throw new Error("The CommerceAgent policy draft is missing.");
  let data: unknown;
  try { data = JSON.parse(raw); } catch { throw new Error("The CommerceAgent policy draft is invalid."); }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("The CommerceAgent policy draft is invalid.");
  const input = data as Record<string, unknown>;
  if (Object.keys(input).some((key) => !["budget", "reason"].includes(key)) ||
    !input.budget || typeof input.budget !== "object" || Array.isArray(input.budget)) {
    throw new Error("The CommerceAgent policy draft has unsupported fields.");
  }
  const budget = input.budget as Record<string, unknown>;
  if (Object.keys(budget).some((key) => !COMMERCE_MODEL_BUDGET_FIELDS.some((field) => field.key === key))) {
    throw new Error("The CommerceAgent policy draft has unsupported budget fields.");
  }
  if (Object.keys(budget).length === 0) {
    if (input.reason !== "" && typeof input.reason !== "string") throw new Error("The CommerceAgent policy draft reason is invalid.");
    return null; // Both fields inherit Platform: no override row or policy audit is needed.
  }
  const form = new FormData();
  form.set("planId", "pending-new-plan");
  form.set("expectedEditVersion", "0");
  form.set("reason", typeof input.reason === "string" ? input.reason : "");
  for (const field of COMMERCE_MODEL_BUDGET_FIELDS) {
    if (!Object.hasOwn(budget, field.key)) continue;
    if (typeof budget[field.key] !== "string") {
      const errors: CommerceBudgetFieldErrors = { [field.key]: `${field.label} must be a positive whole number.` };
      throw new CommerceBudgetValidationError(errors);
    }
    form.set(`override_${field.key}`, "on");
    form.set(field.key, budget[field.key] as string);
  }
  const parsed = parseLivePlanBudgetForm(form);
  return { budget: parsed.budget, reason: parsed.reason };
}
