import type { UsagePricingSnapshot } from "@/lib/admin/upgrade-economics-guardrail";

const MAX_REASON_LENGTH = 1000;
const MAX_PRISMA_INT = 2_147_483_647;

type UpgradeEdgeInput = {
  intent: "create" | "deactivate";
  id: string | null;
  lowerPlanId: string;
  higherPlanId: string;
  reason: string;
};

export type DeclaredUpgradeEdge = {
  id: string;
  lowerPlanId: string;
  higherPlanId: string;
  active: boolean;
};

export type UpgradeEdgeDecisionInput = {
  lowerPlanId: string;
  higherPlanId: string;
  lowerAllowance: number;
  higherAllowance: number;
  lowerEdge: DeclaredUpgradeEdge | null;
  higherEdge: DeclaredUpgradeEdge | null;
};

export type UpgradeEdgeDecision =
  { action: "create" } | { action: "reactivate"; edge: DeclaredUpgradeEdge };

export function decideUpgradeEdgeMutation(
  input: UpgradeEdgeDecisionInput,
): UpgradeEdgeDecision {
  if (input.lowerPlanId === input.higherPlanId) {
    throw new Error("An upgrade edge cannot point to the same plan.");
  }
  if (input.higherAllowance <= input.lowerAllowance) {
    throw new Error(
      "The higher plan must provide a larger monthly recovery allowance.",
    );
  }
  if (input.lowerEdge?.active || input.higherEdge?.active) {
    throw new Error(
      "Each plan may have only one active lower and higher upgrade edge.",
    );
  }

  const declaredEdges = [input.lowerEdge, input.higherEdge].filter(
    (edge): edge is DeclaredUpgradeEdge => edge !== null,
  );
  const exactEdge = declaredEdges.find(
    (edge) =>
      edge.lowerPlanId === input.lowerPlanId &&
      edge.higherPlanId === input.higherPlanId,
  );
  if (exactEdge) return { action: "reactivate", edge: exactEdge };
  if (declaredEdges.length > 0) {
    throw new Error(
      "An inactive upgrade edge already declares one of the requested plans.",
    );
  }
  return { action: "create" };
}

export type EconomicsSnapshotInput = {
  billingPlanId: string;
  shopifyPlanHandleSnapshot: string;
  monthlyRecurringAmountMinor: number;
  currency: string;
  recoveryCreditPackEnabledSnapshot: boolean;
  recoveryCreditsPerPackSnapshot: number | null;
  shopifyRecoveryCreditPackEventHandleSnapshot: string | null;
  usagePricingSnapshot: UsagePricingSnapshot | null;
  verificationReason: string;
};

export type EconomicsSnapshotPlanMapping = {
  shopifyPlanHandle: string;
  recoveryCreditPackEnabled: boolean;
  recoveryCreditsPerPack: number | null;
  shopifyRecoveryCreditPackEventHandle: string | null;
};

export function validateEconomicsSnapshotAgainstPlan(
  plan: EconomicsSnapshotPlanMapping,
  snapshot: EconomicsSnapshotInput,
): void {
  if (plan.shopifyPlanHandle !== snapshot.shopifyPlanHandleSnapshot) {
    throw new Error("Shopify plan handle does not match the local mapping.");
  }
  if (
    plan.recoveryCreditPackEnabled !==
    snapshot.recoveryCreditPackEnabledSnapshot
  ) {
    throw new Error(
      "Recovery-credit pack enablement does not match the local mapping.",
    );
  }
  if (plan.recoveryCreditsPerPack !== snapshot.recoveryCreditsPerPackSnapshot) {
    throw new Error(
      "Recovery-credit pack size does not match the local mapping.",
    );
  }
  if (
    plan.shopifyRecoveryCreditPackEventHandle !==
    snapshot.shopifyRecoveryCreditPackEventHandleSnapshot
  ) {
    throw new Error(
      "Recovery-credit pack event handle does not match the local mapping.",
    );
  }
}

export function parseUpgradeEdgeForm(formData: FormData): UpgradeEdgeInput {
  const intent = text(formData.get("intent"));
  if (intent !== "create" && intent !== "deactivate") {
    throw new Error("Invalid upgrade edge action.");
  }
  return {
    intent,
    id: optionalText(formData.get("id")),
    lowerPlanId: requiredText(formData.get("lowerPlanId"), "Lower plan"),
    higherPlanId: requiredText(formData.get("higherPlanId"), "Higher plan"),
    reason: requiredReason(formData.get("reason")),
  };
}

export function parseEconomicsSnapshotForm(
  formData: FormData,
): EconomicsSnapshotInput {
  const billingPlanId = requiredText(
    formData.get("billingPlanId"),
    "Billing plan",
  );
  const shopifyPlanHandleSnapshot = boundedText(
    formData.get("shopifyPlanHandleSnapshot"),
    "Shopify plan handle",
    255,
  );
  const monthlyRecurringAmountMinor = nonNegativeInt(
    formData.get("monthlyRecurringAmountMinor"),
    "Monthly recurring amount",
  );
  const currency = boundedText(
    formData.get("currency"),
    "Currency",
    3,
  ).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency))
    throw new Error("Currency must be a 3-letter code.");

  const recoveryCreditPackEnabledSnapshot =
    formData.get("recoveryCreditPackEnabledSnapshot") === "on";
  const recoveryCreditsPerPackSnapshot = optionalPositiveInt(
    formData.get("recoveryCreditsPerPackSnapshot"),
    "Recovery credits per pack",
  );
  const shopifyRecoveryCreditPackEventHandleSnapshot = optionalText(
    formData.get("shopifyRecoveryCreditPackEventHandleSnapshot"),
  );
  const usagePricingSnapshot = parseUsagePricing(formData);

  if (!recoveryCreditPackEnabledSnapshot) {
    if (
      recoveryCreditsPerPackSnapshot !== null ||
      shopifyRecoveryCreditPackEventHandleSnapshot !== null ||
      usagePricingSnapshot !== null
    ) {
      throw new Error(
        "Disabled recovery-credit packs cannot include pricing evidence.",
      );
    }
  } else if (
    recoveryCreditsPerPackSnapshot === null ||
    !shopifyRecoveryCreditPackEventHandleSnapshot ||
    usagePricingSnapshot === null
  ) {
    throw new Error(
      "Enabled recovery-credit packs require complete pricing evidence.",
    );
  }

  return {
    billingPlanId,
    shopifyPlanHandleSnapshot,
    monthlyRecurringAmountMinor,
    currency,
    recoveryCreditPackEnabledSnapshot,
    recoveryCreditsPerPackSnapshot,
    shopifyRecoveryCreditPackEventHandleSnapshot,
    usagePricingSnapshot,
    verificationReason: requiredReason(formData.get("verificationReason")),
  };
}

function parseUsagePricing(formData: FormData): UsagePricingSnapshot | null {
  const mode = optionalText(formData.get("usagePricingMode"));
  if (!mode) return null;
  const currency = boundedText(
    formData.get("usagePricingCurrency"),
    "Usage pricing currency",
    3,
  ).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency))
    throw new Error("Usage pricing currency must be a 3-letter code.");
  if (mode === "FIXED") {
    return {
      mode,
      currency,
      unitAmountMinor: nonNegativeInt(
        formData.get("usageUnitAmountMinor"),
        "Usage unit amount",
      ),
    };
  }
  if (mode !== "GRADUATED" && mode !== "VOLUME")
    throw new Error("Usage pricing mode is invalid.");
  const rawTiers = requiredText(
    formData.get("usageTiersJson"),
    "Usage pricing tiers",
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawTiers);
  } catch {
    throw new Error("Usage pricing tiers must be valid JSON.");
  }
  if (!Array.isArray(parsed) || parsed.length === 0)
    throw new Error("Usage pricing tiers are required.");
  const tiers = parsed.map((tier) => {
    if (!tier || typeof tier !== "object" || Array.isArray(tier))
      throw new Error("Usage pricing tier is invalid.");
    const value = tier as Record<string, unknown>;
    const keys = Object.keys(value).sort().join(",");
    if (keys !== "amountPerUnitMinor,flatAmountMinor,upTo")
      throw new Error("Usage pricing tier contains unsupported fields.");
    return {
      upTo:
        value.upTo === null
          ? null
          : safePositiveInt(value.upTo, "Tier upper bound"),
      amountPerUnitMinor: safeNonNegativeInt(
        value.amountPerUnitMinor,
        "Tier unit amount",
      ),
      flatAmountMinor: safeNonNegativeInt(
        value.flatAmountMinor,
        "Tier flat amount",
      ),
    };
  });
  let previous = 0;
  tiers.forEach((tier, index) => {
    if (tier.upTo !== null && tier.upTo <= previous)
      throw new Error("Usage pricing tier bounds must increase.");
    if (tier.upTo === null && index !== tiers.length - 1)
      throw new Error("Only the final usage pricing tier may be open-ended.");
    if (tier.upTo !== null) previous = tier.upTo;
  });
  if (tiers[tiers.length - 1].upTo !== null)
    throw new Error("The final usage pricing tier must be open-ended.");
  return { mode, currency, tiers };
}

function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: FormDataEntryValue | null): string | null {
  const result = text(value);
  return result || null;
}

function requiredText(value: FormDataEntryValue | null, label: string): string {
  const result = text(value);
  if (!result) throw new Error(`${label} is required.`);
  return result;
}

function boundedText(
  value: FormDataEntryValue | null,
  label: string,
  maxLength: number,
): string {
  const result = requiredText(value, label);
  if (result.length > maxLength) throw new Error(`${label} is too long.`);
  return result;
}

function requiredReason(value: FormDataEntryValue | null): string {
  return boundedText(value, "A reason", MAX_REASON_LENGTH);
}

function safeNonNegativeInt(value: unknown, label: string): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_PRISMA_INT
  )
    throw new Error(
      `${label} must be a non-negative integer within Prisma Int range.`,
    );
  return value;
}

function safePositiveInt(value: unknown, label: string): number {
  const result = safeNonNegativeInt(value, label);
  if (result <= 0) throw new Error(`${label} must be positive.`);
  return result;
}

function nonNegativeInt(
  value: FormDataEntryValue | null,
  label: string,
): number {
  const result = requiredText(value, label);
  if (!/^\d+$/.test(result))
    throw new Error(`${label} must be a non-negative integer.`);
  return safeNonNegativeInt(Number(result), label);
}

function optionalPositiveInt(
  value: FormDataEntryValue | null,
  label: string,
): number | null {
  if (value === null || value === "") return null;
  return (
    nonNegativeInt(value, label) ||
    (() => {
      throw new Error(`${label} must be positive.`);
    })()
  );
}
