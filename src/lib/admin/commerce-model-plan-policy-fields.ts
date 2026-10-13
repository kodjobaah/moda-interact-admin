import {
  COMMERCE_MODEL_BUDGET_FIELDS,
  CommerceBudgetValidationError,
  LIVE_BACKGROUND_DEADLINE_ENVELOPE_MS,
  type CommerceBudgetFieldErrors,
  type CommerceBudgetKey,
} from "./commerce-model-policy-fields.ts";

export type SparseCommerceBudget = Partial<Record<CommerceBudgetKey, number>>;

/** An omitted property means inherit. Neither explicit null nor unknown JSON is permitted. */
export function readSparseCommerceBudget(value: unknown, schemaVersion: number): SparseCommerceBudget {
  if (schemaVersion !== 1 || !value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("CommerceAgent Price Plan policy schema is unsupported.");
  }
  const source = value as Record<string, unknown>;
  if (Object.keys(source).length === 0 || Object.keys(source).some((key) => !COMMERCE_MODEL_BUDGET_FIELDS.some((field) => field.key === key))) {
    throw new Error("CommerceAgent Price Plan policy contains unsupported fields.");
  }
  const result: SparseCommerceBudget = {};
  for (const field of COMMERCE_MODEL_BUDGET_FIELDS) {
    if (!Object.hasOwn(source, field.key)) continue;
    const n = source[field.key];
    if (typeof n !== "number" || !Number.isSafeInteger(n) || n <= 0) {
      throw new Error("CommerceAgent Price Plan policy contains invalid values.");
    }
    result[field.key] = n;
  }
  return result;
}

export function parseLivePlanBudgetForm(form: FormData): {
  planId: string;
  expectedEditVersion: number;
  budget: SparseCommerceBudget;
  reason: string;
} {
  const errors: CommerceBudgetFieldErrors = {};
  const budget: SparseCommerceBudget = {};
  for (const field of COMMERCE_MODEL_BUDGET_FIELDS) {
    const override = form.get(`override_${field.key}`) === "on";
    if (!override) continue;
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
  const rawPlanId = form.get("planId");
  const planId = typeof rawPlanId === "string" ? rawPlanId.trim() : "";
  if (!planId || planId.length > 128) {
    throw new Error("Select a valid existing Price Plan before editing its policy.");
  }
  if (Object.keys(errors).length) throw new CommerceBudgetValidationError(errors);
  return { planId, expectedEditVersion: Number(version), budget, reason };
}
