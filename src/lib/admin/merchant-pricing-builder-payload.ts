export type MerchantPricingBuilderEvent = {
  adminLabel: string;
  eventHandle: string;
  creditsGrantedPerUnit: number;
  maximumUnitsPerBillingPeriod: number | null;
  pricingMode: "FIXED" | "GRADUATED" | "VOLUME";
  fixedUnitAmount?: string;
  fixedUnitAmountMinor?: number;
  tiers?: Array<{
    upTo: number | null;
    amountPerUnit?: string;
    flatAmount?: string;
    amountPerUnitMinor?: number;
    flatAmountMinor?: number;
  }>;
};

export type MerchantPricingBuilderPayload = {
  id: string | null;
  shopifyPlanHandle: string;
  name: string;
  planKind: "FREE" | "PAID_METERED";
  isActive: boolean;
  featured: boolean;
  includedRecoveryCredits: number;
  allowancePeriod: "LIFETIME" | "EVERY_30_DAYS";
  billingPeriod: "EVERY_30_DAYS";
  currency: string;
  recurringAmountMinor: number;
  placement: "ONLY" | "UNCHANGED" | `BEFORE:${string}` | `AFTER:${string}`;
  englishDescription: string;
  reason: string;
  usageEvents: MerchantPricingBuilderEvent[];
};

export type MerchantPricingPayloadIssue = { path: string; message: string };

export class MerchantPricingPayloadError extends Error {
  readonly issues: MerchantPricingPayloadIssue[];

  constructor(issues: MerchantPricingPayloadIssue[]) {
    super(issues.map(({ path, message }) => `${path}: ${message}`).join("; "));
    this.issues = issues;
    this.name = "MerchantPricingPayloadError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(
  value: unknown,
  path: string,
  maxLength: number,
  issues: MerchantPricingPayloadIssue[],
): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > maxLength
  ) {
    issues.push({
      path,
      message: `must be a non-empty string of at most ${maxLength} characters`,
    });
    return "";
  }
  return value.trim();
}

function safeInteger(
  value: unknown,
  path: string,
  minimum: number,
  issues: MerchantPricingPayloadIssue[],
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum
  ) {
    issues.push({ path, message: `must be a safe integer >= ${minimum}` });
    return 0;
  }
  return value;
}

export function parseMoneyToMinorUnits(value: unknown): number {
  if (typeof value !== "string")
    throw new Error("Money must be a decimal string.");
  const text = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text))
    throw new Error(
      "Money must contain only digits and at most two decimal places.",
    );
  const [whole, fraction = ""] = text.split(".");
  const minor = Number(`${whole}${fraction.padEnd(2, "0")}`);
  if (!Number.isSafeInteger(minor))
    throw new Error("Money exceeds the safe integer limit.");
  return minor;
}

export function resolveMerchantPricingPreviewPosition(
  placement: string,
  catalogueIds: string[],
): number | null {
  if (placement === "ONLY") return catalogueIds.length === 0 ? 0 : null;
  if (placement.startsWith("BEFORE:")) {
    return catalogueIds[0] === placement.slice("BEFORE:".length) ? 0 : null;
  }
  if (placement.startsWith("AFTER:")) {
    const index = catalogueIds.indexOf(placement.slice("AFTER:".length));
    return index < 0 ? null : index + 1;
  }
  return null;
}

const TOP_LEVEL_KEYS = [
  "id",
  "shopifyPlanHandle",
  "name",
  "planKind",
  "isActive",
  "featured",
  "includedRecoveryCredits",
  "allowancePeriod",
  "billingPeriod",
  "currency",
  "recurringAmount",
  "placement",
  "englishDescription",
  "reason",
  "usageEvents",
];

export function parseMerchantPricingBuilderPayload(
  raw: string,
): MerchantPricingBuilderPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new MerchantPricingPayloadError([
      { path: "$", message: "must be valid JSON" },
    ]);
  }
  const issues: MerchantPricingPayloadIssue[] = [];
  if (!isRecord(parsed))
    throw new MerchantPricingPayloadError([
      { path: "$", message: "must be an object" },
    ]);
  for (const key of Object.keys(parsed))
    if (!TOP_LEVEL_KEYS.includes(key))
      issues.push({ path: `$.${key}`, message: "unexpected field" });
  const id =
    parsed.id === null ? null : requiredString(parsed.id, "$.id", 255, issues);
  const shopifyPlanHandle = requiredString(
    parsed.shopifyPlanHandle,
    "$.shopifyPlanHandle",
    255,
    issues,
  );
  const name = requiredString(parsed.name, "$.name", 255, issues);
  const englishDescription = requiredString(
    parsed.englishDescription,
    "$.englishDescription",
    2000,
    issues,
  );
  const reason = requiredString(parsed.reason, "$.reason", 2000, issues);
  const planKind = parsed.planKind;
  if (planKind !== "FREE" && planKind !== "PAID_METERED")
    issues.push({
      path: "$.planKind",
      message: "must be FREE or PAID_METERED",
    });
  const allowancePeriod = planKind === "FREE" ? "LIFETIME" : "EVERY_30_DAYS";
  if (parsed.allowancePeriod !== allowancePeriod)
    issues.push({ path: "$.allowancePeriod", message: "must match planKind" });
  if (parsed.billingPeriod !== "EVERY_30_DAYS")
    issues.push({ path: "$.billingPeriod", message: "must be EVERY_30_DAYS" });
  if (typeof parsed.isActive !== "boolean")
    issues.push({ path: "$.isActive", message: "must be a boolean" });
  if (typeof parsed.featured !== "boolean")
    issues.push({ path: "$.featured", message: "must be a boolean" });
  const includedRecoveryCredits = safeInteger(
    parsed.includedRecoveryCredits,
    "$.includedRecoveryCredits",
    0,
    issues,
  );
  let recurringAmountMinor = 0;
  try {
    recurringAmountMinor = parseMoneyToMinorUnits(parsed.recurringAmount);
  } catch {
    issues.push({
      path: "$.recurringAmount",
      message:
        "must be a non-negative decimal money value with at most two decimals",
    });
  }
  const currency =
    typeof parsed.currency === "string"
      ? parsed.currency.trim().toUpperCase()
      : "";
  if (!/^[A-Z]{3}$/.test(currency))
    issues.push({
      path: "$.currency",
      message: "must be an uppercase three-letter currency",
    });
  const placement = parsed.placement;
  if (
    typeof placement !== "string" ||
    !/^(?:ONLY|UNCHANGED|BEFORE:[^:]+|AFTER:[^:]+)$/.test(placement)
  )
    issues.push({
      path: "$.placement",
      message: "must be ONLY, UNCHANGED, BEFORE:<id>, or AFTER:<id>",
    });
  if (
    id !== null &&
    typeof parsed.placement === "string" &&
    parsed.placement !== "UNCHANGED"
  )
    issues.push({
      path: "$.placement",
      message: "edit placement must be UNCHANGED",
    });
  if (!Array.isArray(parsed.usageEvents) || parsed.usageEvents.length > 5)
    issues.push({
      path: "$.usageEvents",
      message: "must contain 0 to 5 events",
    });
  const usageEvents: MerchantPricingBuilderEvent[] = [];
  const handles = new Set<string>();
  if (Array.isArray(parsed.usageEvents)) {
    parsed.usageEvents.forEach((rawEvent, index) => {
      if (!isRecord(rawEvent)) {
        issues.push({
          path: `$.usageEvents[${index}]`,
          message: "must be an object",
        });
        return;
      }
      const adminLabel = requiredString(
        rawEvent.adminLabel,
        `$.usageEvents[${index}].adminLabel`,
        255,
        issues,
      );
      const eventHandle = requiredString(
        rawEvent.eventHandle,
        `$.usageEvents[${index}].eventHandle`,
        255,
        issues,
      );
      if (handles.has(eventHandle))
        issues.push({
          path: `$.usageEvents[${index}].eventHandle`,
          message: "must be unique",
        });
      handles.add(eventHandle);
      const creditsGrantedPerUnit = safeInteger(
        rawEvent.creditsGrantedPerUnit,
        `$.usageEvents[${index}].creditsGrantedPerUnit`,
        1,
        issues,
      );
      const maximumUnitsPerBillingPeriod =
        rawEvent.maximumUnitsPerBillingPeriod === null
          ? null
          : safeInteger(
              rawEvent.maximumUnitsPerBillingPeriod,
              `$.usageEvents[${index}].maximumUnitsPerBillingPeriod`,
              1,
              issues,
            );
      const pricingMode = rawEvent.pricingMode;
      if (
        pricingMode !== "FIXED" &&
        pricingMode !== "GRADUATED" &&
        pricingMode !== "VOLUME"
      )
        issues.push({
          path: `$.usageEvents[${index}].pricingMode`,
          message: "invalid pricing mode",
        });
      if (pricingMode === "FIXED") {
        let fixedUnitAmountMinor = 0;
        try {
          fixedUnitAmountMinor = parseMoneyToMinorUnits(
            rawEvent.fixedUnitAmount,
          );
        } catch {
          issues.push({
            path: `$.usageEvents[${index}].fixedUnitAmount`,
            message:
              "must be a non-negative decimal money value with at most two decimals",
          });
        }
        if (maximumUnitsPerBillingPeriod === null && fixedUnitAmountMinor === 0)
          issues.push({
            path: `$.usageEvents[${index}]`,
            message: "zero-cost fixed events require a finite maximum",
          });
        usageEvents.push({
          adminLabel,
          eventHandle,
          creditsGrantedPerUnit,
          maximumUnitsPerBillingPeriod,
          pricingMode,
          fixedUnitAmountMinor,
        });
      } else {
        if (
          !Array.isArray(rawEvent.tiers) ||
          rawEvent.tiers.length < 1 ||
          rawEvent.tiers.length > 6
        )
          issues.push({
            path: `$.usageEvents[${index}].tiers`,
            message: "must contain 1 to 6 tiers",
          });
        const tiers = Array.isArray(rawEvent.tiers)
          ? rawEvent.tiers.map((rawTier, tierIndex) => {
              if (!isRecord(rawTier)) {
                issues.push({
                  path: `$.usageEvents[${index}].tiers[${tierIndex}]`,
                  message: "must be an object",
                });
                return {
                  upTo: null,
                  amountPerUnitMinor: 0,
                  flatAmountMinor: 0,
                };
              }
              const upTo =
                rawTier.upTo === null
                  ? null
                  : safeInteger(
                      rawTier.upTo,
                      `$.usageEvents[${index}].tiers[${tierIndex}].upTo`,
                      1,
                      issues,
                    );
              let amountPerUnitMinor = 0;
              try {
                amountPerUnitMinor = parseMoneyToMinorUnits(
                  rawTier.amountPerUnit,
                );
              } catch {
                issues.push({
                  path: `$.usageEvents[${index}].tiers[${tierIndex}].amountPerUnit`,
                  message:
                    "must be a non-negative decimal money value with at most two decimals",
                });
              }
              let flatAmountMinor = 0;
              try {
                flatAmountMinor = parseMoneyToMinorUnits(rawTier.flatAmount);
              } catch {
                issues.push({
                  path: `$.usageEvents[${index}].tiers[${tierIndex}].flatAmount`,
                  message:
                    "must be a non-negative decimal money value with at most two decimals",
                });
              }
              return { upTo, amountPerUnitMinor, flatAmountMinor };
            })
          : [];
        const finiteTiers = tiers.filter((tier) => tier.upTo !== null);
        for (let tierIndex = 1; tierIndex < finiteTiers.length; tierIndex += 1)
          if (finiteTiers[tierIndex].upTo! <= finiteTiers[tierIndex - 1].upTo!)
            issues.push({
              path: `$.usageEvents[${index}].tiers`,
              message: "finite tier limits must increase",
            });
        if (tiers.length && tiers[tiers.length - 1].upTo !== null)
          issues.push({
            path: `$.usageEvents[${index}].tiers`,
            message: "final tier must be open-ended",
          });
        if (
          maximumUnitsPerBillingPeriod === null &&
          tiers.length &&
          tiers[tiers.length - 1].amountPerUnitMinor === 0 &&
          tiers[tiers.length - 1].flatAmountMinor === 0
        )
          issues.push({
            path: `$.usageEvents[${index}]`,
            message: "zero-cost tiered events require a finite maximum",
          });
        usageEvents.push({
          adminLabel,
          eventHandle,
          creditsGrantedPerUnit,
          maximumUnitsPerBillingPeriod,
          pricingMode: pricingMode as "GRADUATED" | "VOLUME",
          tiers,
        });
      }
    });
  }
  if (issues.length) throw new MerchantPricingPayloadError(issues);
  return {
    id,
    shopifyPlanHandle,
    name,
    planKind: planKind as "FREE" | "PAID_METERED",
    isActive: parsed.isActive as boolean,
    featured: parsed.featured as boolean,
    includedRecoveryCredits,
    allowancePeriod,
    billingPeriod: "EVERY_30_DAYS",
    currency,
    recurringAmountMinor,
    placement: placement as MerchantPricingBuilderPayload["placement"],
    englishDescription,
    reason,
    usageEvents,
  };
}
