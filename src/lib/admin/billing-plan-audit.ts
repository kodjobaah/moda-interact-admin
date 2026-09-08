export type BillingPlanAuditSource = {
  shopifyPlanHandle: string;
  name: string;
  kind: string;
  active: boolean;
  shopifyUsageEventHandle: string | null;
  freeLifetimeConversationAllowance: number | null;
  defaultOutboundSoftLimit: number;
  defaultOutboundHardLimit: number;
  terminalMessageReservedSlots: number;
  features: readonly (string | { feature: string; enabled: boolean })[];
};

export function billingPlanAuditSnapshot(
  source: BillingPlanAuditSource,
): Record<string, unknown> {
  return {
    shopifyPlanHandle: source.shopifyPlanHandle,
    name: source.name,
    kind: source.kind,
    active: source.active,
    shopifyUsageEventHandle: source.shopifyUsageEventHandle,
    freeLifetimeConversationAllowance: source.freeLifetimeConversationAllowance,
    defaultOutboundSoftLimit: source.defaultOutboundSoftLimit,
    defaultOutboundHardLimit: source.defaultOutboundHardLimit,
    terminalMessageReservedSlots: source.terminalMessageReservedSlots,
    features: source.features
      .filter((feature) =>
        typeof feature === "string" ? true : feature.enabled,
      )
      .map((feature) =>
        typeof feature === "string" ? feature : feature.feature,
      ),
  };
}
