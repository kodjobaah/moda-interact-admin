import {
  BillingPlanKindSchema,
  type BillingPlanKind,
} from "@modainteract/moda-interact-shared/billing";

export const BILLING_FEATURES = [
  "CHECKOUT_RECOVERY",
  "AI_CONVERSATIONS",
  "PRODUCT_SEARCH",
  "ORDER_SUPPORT",
] as const;

export type BillingFeature = (typeof BILLING_FEATURES)[number];

export type BillingPlanFormValues = {
  id: string | null;
  intent: "create" | "update" | "toggle";
  shopifyPlanHandle: string;
  name: string;
  kind: BillingPlanKind;
  shopifyUsageEventHandle: string | null;
  freeLifetimeConversationAllowance: number | null;
  defaultOutboundSoftLimit: number;
  defaultOutboundHardLimit: number;
  terminalMessageReservedSlots: number;
  features: BillingFeature[];
  reason: string;
  confirmUsageHandleChange: boolean;
};

function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

export function parseBillingPlanForm(
  formData: FormData,
): BillingPlanFormValues {
  const intentValue = text(formData.get("intent"));
  if (
    intentValue !== "create" &&
    intentValue !== "update" &&
    intentValue !== "toggle"
  ) {
    throw new Error("Invalid billing plan action.");
  }

  const kindResult = BillingPlanKindSchema.safeParse(
    text(formData.get("kind")),
  );
  if (!kindResult.success)
    throw new Error("Billing plan kind must be FREE or PAID_METERED.");

  const shopifyPlanHandle = text(formData.get("shopifyPlanHandle"));
  const name = text(formData.get("name"));
  if (!shopifyPlanHandle || shopifyPlanHandle.length > 255) {
    throw new Error(
      "Shopify plan handle is required and must be at most 255 characters.",
    );
  }
  if (!name || name.length > 255) {
    throw new Error(
      "Display name is required and must be at most 255 characters.",
    );
  }

  const defaultOutboundSoftLimit = positiveInteger(
    text(formData.get("defaultOutboundSoftLimit")),
    "Outbound soft limit",
  );
  const defaultOutboundHardLimit = positiveInteger(
    text(formData.get("defaultOutboundHardLimit")),
    "Outbound hard limit",
  );
  const terminalMessageReservedSlots = positiveInteger(
    text(formData.get("terminalMessageReservedSlots")),
    "Reserved terminal response slots",
  );
  if (defaultOutboundSoftLimit > defaultOutboundHardLimit) {
    throw new Error("Outbound soft limit cannot exceed the hard limit.");
  }
  if (terminalMessageReservedSlots >= defaultOutboundHardLimit) {
    throw new Error(
      "Reserved terminal response slots must be lower than the hard limit.",
    );
  }

  const usageHandle = text(formData.get("shopifyUsageEventHandle")) || null;
  const allowanceText = text(formData.get("freeLifetimeConversationAllowance"));
  const freeLifetimeConversationAllowance = allowanceText
    ? positiveInteger(allowanceText, "Free lifetime conversation allowance")
    : null;
  if (kindResult.data === "FREE") {
    if (!freeLifetimeConversationAllowance) {
      throw new Error(
        "Free plans require a positive lifetime conversation allowance.",
      );
    }
    if (usageHandle) {
      throw new Error("Free plans cannot report a Shopify usage event handle.");
    }
  } else {
    if (!usageHandle) {
      throw new Error(
        "Paid plans require an exact Shopify usage event handle.",
      );
    }
    if (freeLifetimeConversationAllowance !== null) {
      throw new Error("Paid plans cannot use a Free lifetime allowance.");
    }
  }

  const features = BILLING_FEATURES.filter(
    (feature) => formData.get(`feature_${feature}`) === "on",
  );
  const reason = text(formData.get("reason"));
  if (!reason || reason.length > 1000) {
    throw new Error("A bounded mutation reason is required.");
  }

  return {
    id: text(formData.get("id")) || null,
    intent: intentValue,
    shopifyPlanHandle,
    name,
    kind: kindResult.data,
    shopifyUsageEventHandle: usageHandle,
    freeLifetimeConversationAllowance,
    defaultOutboundSoftLimit,
    defaultOutboundHardLimit,
    terminalMessageReservedSlots,
    features,
    reason,
    confirmUsageHandleChange: formData.get("confirmUsageHandleChange") === "on",
  };
}
