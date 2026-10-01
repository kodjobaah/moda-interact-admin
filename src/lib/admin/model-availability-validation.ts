export type CreateShopModelAvailabilityInput = {
  shopId: string;
  reason: string;
};

export type SetModelAvailabilityEnabledInput = {
  id: string;
  expectedEditVersion: number;
  enabled: boolean;
  reason: string;
};

function text(formData: FormData, name: string): string | null {
  const entry = formData.get(name);
  if (entry === null) return null;
  if (typeof entry !== "string") throw new Error(`${name} is invalid.`);
  return entry;
}

function requiredText(
  formData: FormData,
  name: string,
  maximum: number,
): string {
  const result = text(formData, name)?.trim() ?? "";
  if (result.length < 1 || result.length > maximum) {
    throw new Error(`${name} must be between 1 and ${maximum} characters.`);
  }
  return result;
}

function positiveInteger(formData: FormData, name: string): number {
  const raw = requiredText(formData, name, 16);
  if (!/^\d+$/.test(raw))
    throw new Error(`${name} must be a positive integer.`);
  const result = Number(raw);
  if (!Number.isSafeInteger(result) || result < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return result;
}

function enabledValue(formData: FormData): boolean {
  const raw = text(formData, "enabled");
  if (raw !== "true" && raw !== "false") {
    throw new Error("enabled must be true or false.");
  }
  return raw === "true";
}

function reason(formData: FormData): string {
  return requiredText(formData, "reason", 1000);
}

export function parseCreateShopModelAvailabilityForm(
  formData: FormData,
): CreateShopModelAvailabilityInput {
  if (
    ["scope", "id", "editVersion", "enabled"].some((key) => formData.has(key))
  ) {
    throw new Error(
      "Create Shop Availability does not accept caller-supplied identity, scope, editVersion, or enabled state.",
    );
  }
  return {
    shopId: requiredText(formData, "shopId", 128),
    reason: reason(formData),
  };
}

export function parseSetModelAvailabilityEnabledForm(
  formData: FormData,
): SetModelAvailabilityEnabledInput {
  if (formData.has("scope") || formData.has("shopId")) {
    throw new Error("Model Availability scope and Shop are immutable.");
  }
  return {
    id: requiredText(formData, "id", 128),
    expectedEditVersion: positiveInteger(formData, "expectedEditVersion"),
    enabled: enabledValue(formData),
    reason: reason(formData),
  };
}
