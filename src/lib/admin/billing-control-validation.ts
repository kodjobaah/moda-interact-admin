const MAX_REASON_LENGTH = 1000;

export type PlatformBillingPolicyInput = {
  globalPauseNewRecoveries: boolean;
  globalPauseAutomatedWhatsapp: boolean;
  absoluteOutboundHardLimit: number;
  defaultWarningPercent: number;
  reason: string;
};

export type ShopBillingOverrideInput = {
  shopId: string;
  outboundSoftLimit: number | null;
  outboundHardLimit: number | null;
  pauseNewRecoveries: boolean | null;
  pauseAutomatedWhatsapp: boolean | null;
  recoverySafetyCeiling: number | null;
  expiresAt: Date | null;
  reason: string;
};

export type ExistingShopBillingOverride = Pick<
  ShopBillingOverrideInput,
  "outboundHardLimit" | "recoverySafetyCeiling"
>;

export type AllowanceAdjustmentInput = {
  shopId: string;
  quantity: number;
  reason: string;
};

export function shopBillingOverrideRequiresSuperAdmin(
  values: Pick<
    ShopBillingOverrideInput,
    "outboundHardLimit" | "recoverySafetyCeiling"
  >,
  existing: ExistingShopBillingOverride | null,
): boolean {
  const existingHasHardControl =
    existing !== null &&
    (existing.outboundHardLimit !== null ||
      existing.recoverySafetyCeiling !== null);
  return (
    values.outboundHardLimit !== null ||
    values.recoverySafetyCeiling !== null ||
    existingHasHardControl
  );
}

export function parsePlatformBillingPolicyForm(
  formData: FormData,
): PlatformBillingPolicyInput {
  const absoluteOutboundHardLimit = requiredPositiveInt(
    formData.get("absoluteOutboundHardLimit"),
    "Absolute outbound hard limit",
  );
  const defaultWarningPercent = requiredInt(
    formData.get("defaultWarningPercent"),
    "Warning threshold",
  );
  if (defaultWarningPercent < 0 || defaultWarningPercent > 100) {
    throw new Error("Warning threshold must be between 0 and 100 percent.");
  }
  return {
    globalPauseNewRecoveries: checkbox(formData, "globalPauseNewRecoveries"),
    globalPauseAutomatedWhatsapp: checkbox(
      formData,
      "globalPauseAutomatedWhatsapp",
    ),
    absoluteOutboundHardLimit,
    defaultWarningPercent,
    reason: requiredReason(formData.get("reason")),
  };
}

export function parseShopBillingOverrideForm(
  formData: FormData,
): ShopBillingOverrideInput {
  const shopId = requiredText(formData.get("shopId"), "Shop id");
  const outboundSoftLimit = optionalPositiveInt(
    formData.get("outboundSoftLimit"),
    "Outbound soft limit",
  );
  const outboundHardLimit = optionalPositiveInt(
    formData.get("outboundHardLimit"),
    "Outbound hard limit",
  );
  const recoverySafetyCeiling = optionalPositiveInt(
    formData.get("recoverySafetyCeiling"),
    "Recovery safety ceiling",
  );
  const expiresAt = optionalDate(formData.get("expiresAt"));
  return {
    shopId,
    outboundSoftLimit,
    outboundHardLimit,
    pauseNewRecoveries: optionalTriState(formData, "pauseNewRecoveries"),
    pauseAutomatedWhatsapp: optionalTriState(
      formData,
      "pauseAutomatedWhatsapp",
    ),
    recoverySafetyCeiling,
    expiresAt,
    reason: requiredReason(formData.get("reason")),
  };
}

export function parseAllowanceAdjustmentForm(
  formData: FormData,
): AllowanceAdjustmentInput {
  return {
    shopId: requiredText(formData.get("shopId"), "Shop id"),
    quantity: requiredInt(formData.get("quantity"), "Adjustment quantity"),
    reason: requiredReason(formData.get("reason")),
  };
}

function requiredText(value: FormDataEntryValue | null, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

function requiredReason(value: FormDataEntryValue | null): string {
  const reason = requiredText(value, "A reason");
  if (reason.length > MAX_REASON_LENGTH) {
    throw new Error("Reason must be 1000 characters or fewer.");
  }
  return reason;
}

function requiredInt(value: FormDataEntryValue | null, label: string): number {
  if (typeof value !== "string" || !/^-?\d+$/.test(value.trim())) {
    throw new Error(`${label} must be a whole number.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${label} is invalid.`);
  return parsed;
}

function requiredPositiveInt(
  value: FormDataEntryValue | null,
  label: string,
): number {
  const parsed = requiredInt(value, label);
  if (parsed <= 0) throw new Error(`${label} must be positive.`);
  return parsed;
}

function optionalPositiveInt(
  value: FormDataEntryValue | null,
  label: string,
): number | null {
  if (value === null || value === "") return null;
  return requiredPositiveInt(value, label);
}

function optionalDate(value: FormDataEntryValue | null): Date | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Expiry must be a valid date.");
  }
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(0);
  date.setUTCHours(23, 59, 59, 999);
  date.setUTCFullYear(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("Expiry must be valid.");
  }
  return date;
}

function checkbox(formData: FormData, name: string): boolean {
  return formData.get(name) === "on";
}

function optionalTriState(formData: FormData, name: string): boolean | null {
  const value = formData.get(name);
  if (value === null || value === "" || value === "inherit") return null;
  if (value === "on") return true;
  if (value === "off") return false;
  throw new Error(`${name} has an invalid value.`);
}
