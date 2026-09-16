import {
  EffectiveRecoveryPolicySchema,
  type EffectiveRecoveryPolicy,
} from "@modainteract/moda-interact-shared/recovery-policy";

export type RecoveryPolicySnapshot = Omit<EffectiveRecoveryPolicy, "source">;

export function parseRecoveryPolicySnapshot(
  value: RecoveryPolicySnapshot,
): RecoveryPolicySnapshot {
  return EffectiveRecoveryPolicySchema.parse({
    ...value,
    source: "ADMIN_OVERRIDE",
  });
}

export function effectiveRecoveryPolicy(
  merchant: RecoveryPolicySnapshot,
  override: RecoveryPolicySnapshot | null,
  overrideExpiresAt: Date | null,
  now = new Date(),
): EffectiveRecoveryPolicy {
  const active = override && (!overrideExpiresAt || overrideExpiresAt > now);
  return EffectiveRecoveryPolicySchema.parse({
    ...(active ? override : merchant),
    source: active ? "ADMIN_OVERRIDE" : "MERCHANT",
  });
}

export function policySnapshot(value: RecoveryPolicySnapshot): Record<string, unknown> {
  return {
    recoveryDelayMinutes: value.recoveryDelayMinutes,
    recoveryOfferMode: value.recoveryOfferMode,
    fixedShopifyDiscountId: value.fixedShopifyDiscountId,
    followUpEnabled: value.followUpEnabled,
    followUpDelayMinutes: value.followUpDelayMinutes,
  };
}