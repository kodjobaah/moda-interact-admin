/** Versioned, allowlisted CommerceAgent budget descriptors shared by Admin policy editors. */
export const COMMERCE_MODEL_BUDGET_SCHEMA_VERSION = 1 as const;
export const LIVE_BACKGROUND_DEADLINE_ENVELOPE_MS = 90_000;

export const COMMERCE_MODEL_BUDGET_FIELDS = [
  {
    key: "deadlineMs",
    label: "Conversation deadline",
    unit: "ms",
    description: "Total wall-clock time allowed for a CommerceAgent turn, including model and tool execution.",
  },
  {
    key: "outputTokens",
    label: "Model output tokens",
    unit: "tokens",
    description: "Maximum output tokens requested for each model invocation, not the entire conversation.",
  },
] as const;

export type CommerceBudgetKey = (typeof COMMERCE_MODEL_BUDGET_FIELDS)[number]["key"];
export type CommerceModelBudget = Record<CommerceBudgetKey, number>;
export type CommerceBudgetFieldErrors = Partial<Record<CommerceBudgetKey | "reason" | "expectedEditVersion", string>>;

export class CommerceBudgetValidationError extends Error {
  readonly fieldErrors: CommerceBudgetFieldErrors;
  constructor(fieldErrors: CommerceBudgetFieldErrors, message = "Correct the highlighted policy values.") {
    super(message);
    this.fieldErrors = fieldErrors;
    this.name = "CommerceBudgetValidationError";
  }
}

function positiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/** Reject unsupported JSON versions and keys; never silently replace an unknown policy. */
export function readCommerceModelBudget(value: unknown, schemaVersion: number): CommerceModelBudget {
  if (schemaVersion !== COMMERCE_MODEL_BUDGET_SCHEMA_VERSION || !value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("CommerceAgent policy schema is unsupported. Contact a platform administrator.");
  }
  const source = value as Record<string, unknown>;
  if (Object.keys(source).length !== COMMERCE_MODEL_BUDGET_FIELDS.length ||
      Object.keys(source).some((key) => !COMMERCE_MODEL_BUDGET_FIELDS.some((field) => field.key === key))) {
    throw new Error("CommerceAgent policy contains unsupported budget fields.");
  }
  if (!positiveSafeInteger(source.deadlineMs) || !positiveSafeInteger(source.outputTokens)) {
    throw new Error("CommerceAgent policy contains invalid budget values.");
  }
  return { deadlineMs: source.deadlineMs, outputTokens: source.outputTokens };
}

function parseField(value: unknown, key: CommerceBudgetKey, errors: CommerceBudgetFieldErrors): number {
  const input = typeof value === "string" ? value.trim() : "";
  if (!/^[1-9]\d*$/.test(input) || !Number.isSafeInteger(Number(input))) {
    errors[key] = `${key === "deadlineMs" ? "Conversation deadline" : "Model output tokens"} must be a positive whole number.`;
    return 0;
  }
  const parsed = Number(input);
  if (key === "deadlineMs" && parsed > LIVE_BACKGROUND_DEADLINE_ENVELOPE_MS) {
    errors[key] = `The live Background execution envelope currently supports at most ${LIVE_BACKGROUND_DEADLINE_ENVELOPE_MS} ms. A larger budget requires a coordinated runtime change.`;
  }
  return parsed;
}

export function parseLivePlatformBudgetForm(form: FormData): {
  budget: CommerceModelBudget;
  expectedEditVersion: number;
  reason: string;
} {
  const errors: CommerceBudgetFieldErrors = {};
  const deadlineMs = parseField(form.get("deadlineMs"), "deadlineMs", errors);
  const outputTokens = parseField(form.get("outputTokens"), "outputTokens", errors);
  const version = form.get("expectedEditVersion");
  const versionText = typeof version === "string" ? version.trim() : "";
  const expectedEditVersion = Number(versionText);
  if (!/^[1-9]\d*$/.test(versionText) || !Number.isSafeInteger(expectedEditVersion)) {
    errors.expectedEditVersion = "Policy version is invalid; reload before saving.";
  }
  const rawReason = form.get("reason");
  const reason = typeof rawReason === "string" ? rawReason.trim() : "";
  if (!reason || reason.length > 1000) errors.reason = "An audit reason of 1–1000 characters is required.";
  // The scope and environment must be resolved server-side, never trusted from form data.
  if (Object.keys(errors).length) throw new CommerceBudgetValidationError(errors);
  return { budget: { deadlineMs, outputTokens }, expectedEditVersion, reason };
}

/** Privileged LIVE controls are not merchant-configurable. */
export function canEditLiveCommerceBudget(role: string): boolean {
  return role === "SUPER_ADMIN";
}
