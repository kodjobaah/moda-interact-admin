export type BillingPlanAuditSource = {
  shopifyPlanHandle: string;
  name: string;
  kind: string;
  active: boolean;
  shopifyUsageEventHandle: string | null;
  includedRecoveryConversationAllowance: number | null;
  recoveryCreditPackEnabled: boolean;
  recoveryCreditsPerPack: number | null;
  shopifyRecoveryCreditPackEventHandle: string | null;
  freeLifetimeConversationAllowance?: number | null;
  defaultOutboundSoftLimit: number;
  defaultOutboundHardLimit: number;
  terminalMessageReservedSlots: number;
  features: readonly (string | { feature: string; enabled: boolean })[];
};

export function billingPlanAuditSnapshot(
  source: BillingPlanAuditSource,
): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {
    shopifyPlanHandle: source.shopifyPlanHandle,
    name: source.name,
    kind: source.kind,
    active: source.active,
    shopifyUsageEventHandle: source.shopifyUsageEventHandle,
    includedRecoveryConversationAllowance:
      source.includedRecoveryConversationAllowance,
    recoveryCreditPackEnabled: source.recoveryCreditPackEnabled,
    recoveryCreditsPerPack: source.recoveryCreditsPerPack,
    shopifyRecoveryCreditPackEventHandle:
      source.shopifyRecoveryCreditPackEventHandle,
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
  if ("freeLifetimeConversationAllowance" in source) {
    snapshot.freeLifetimeConversationAllowance =
      source.freeLifetimeConversationAllowance;
  }
  return snapshot;
}
