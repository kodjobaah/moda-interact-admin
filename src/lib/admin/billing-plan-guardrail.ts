import {
  validateSinglePackShopifyEconomics,
  type PlanEconomics,
  type UpgradeEconomicsResult,
  type UsagePricingSnapshot,
} from "./upgrade-economics-guardrail.ts";

export type BillingPlanEconomicsCandidate = {
  id: string;
  name: string;
  kind: string;
  active: boolean;
  includedRecoveryConversationAllowance: number | null;
  recoveryCreditPackEnabled: boolean;
  recoveryCreditsPerPack: number | null;
  shopifyRecoveryCreditPackEventHandle: string | null;
};

export type BillingEconomicsSnapshotEvidence = {
  id: string;
  monthlyRecurringAmountMinor: number;
  currency: string;
  recoveryCreditPackEnabledSnapshot: boolean;
  recoveryCreditsPerPackSnapshot: number | null;
  shopifyRecoveryCreditPackEventHandleSnapshot: string | null;
  usagePricingSnapshot: unknown;
};

export type BillingUpgradeEdgeInput = {
  id: string;
  lowerPlanId: string;
  higherPlanId: string;
};

export type EvaluatedBillingUpgradeEdge = {
  edge: BillingUpgradeEdgeInput;
  lowerPlan: BillingPlanEconomicsCandidate;
  higherPlan: BillingPlanEconomicsCandidate;
  lowerSnapshot: BillingEconomicsSnapshotEvidence | null;
  higherSnapshot: BillingEconomicsSnapshotEvidence | null;
  minimumUpgradePremiumBps: number;
  result: UpgradeEconomicsResult;
};

function planEconomics(
  plan: BillingPlanEconomicsCandidate,
  snapshot: BillingEconomicsSnapshotEvidence | null,
): PlanEconomics {
  return {
    id: plan.id,
    name: plan.name,
    monthlyPriceMinor: snapshot?.monthlyRecurringAmountMinor ?? null,
    monthlyIncludedConversations:
      plan.kind === "FREE"
        ? 0
        : (plan.includedRecoveryConversationAllowance ?? 0),
    currency: snapshot?.currency ?? null,
  };
}

function usagePricing(
  snapshot: BillingEconomicsSnapshotEvidence | null,
): UsagePricingSnapshot | null {
  return (
    (snapshot?.usagePricingSnapshot as UsagePricingSnapshot | null) ?? null
  );
}

export function evaluateBillingUpgradeEdge({
  edge,
  lowerPlan,
  higherPlan,
  lowerSnapshot,
  higherSnapshot,
  minimumUpgradePremiumBps,
}: {
  edge: BillingUpgradeEdgeInput;
  lowerPlan: BillingPlanEconomicsCandidate;
  higherPlan: BillingPlanEconomicsCandidate;
  lowerSnapshot: BillingEconomicsSnapshotEvidence | null;
  higherSnapshot: BillingEconomicsSnapshotEvidence | null;
  minimumUpgradePremiumBps: number;
}): EvaluatedBillingUpgradeEdge {
  const lowerPackEvidenceMismatch =
    lowerSnapshot !== null &&
    (lowerPlan.recoveryCreditPackEnabled !==
      lowerSnapshot.recoveryCreditPackEnabledSnapshot ||
      (lowerPlan.recoveryCreditPackEnabled &&
        (lowerPlan.recoveryCreditsPerPack !==
          lowerSnapshot.recoveryCreditsPerPackSnapshot ||
          lowerPlan.shopifyRecoveryCreditPackEventHandle !==
            lowerSnapshot.shopifyRecoveryCreditPackEventHandleSnapshot)));
  const lowerTopUpsEnabled =
    lowerPlan.recoveryCreditPackEnabled ||
    lowerSnapshot?.recoveryCreditPackEnabledSnapshot === true ||
    lowerPackEvidenceMismatch;
  const lowerPackSize = lowerPlan.recoveryCreditPackEnabled
    ? lowerPlan.recoveryCreditsPerPack
    : null;
  const result = validateSinglePackShopifyEconomics({
    currentPlan: planEconomics(lowerPlan, lowerSnapshot),
    nextPlan: planEconomics(higherPlan, higherSnapshot),
    topUpsEnabled: lowerTopUpsEnabled,
    recoveryCreditsPerPack: lowerPackSize,
    usagePricing: usagePricing(lowerSnapshot),
    minimumUpgradePremiumBps,
  });

  return {
    edge,
    lowerPlan,
    higherPlan,
    lowerSnapshot,
    higherSnapshot,
    minimumUpgradePremiumBps,
    result,
  };
}

export function assertBillingUpgradeEconomicsPass(
  evaluations: EvaluatedBillingUpgradeEdge[],
): void {
  const blocked = evaluations.find(({ result }) => result.status !== "PASS");
  if (blocked) {
    throw new Error(
      `Upgrade economics guardrail blocked this change for ${blocked.lowerPlan.name} -> ${blocked.higherPlan.name}: ${blocked.result.message}`,
    );
  }
}

export function billingUpgradeEconomicsAuditEvidence(
  evaluation: EvaluatedBillingUpgradeEdge,
  minimumUpgradePremiumBps: number,
) {
  const { details } = evaluation.result;
  return {
    lowerPlanId: evaluation.lowerPlan.id,
    higherPlanId: evaluation.higherPlan.id,
    lowerSnapshotId: evaluation.lowerSnapshot?.id ?? null,
    higherSnapshotId: evaluation.higherSnapshot?.id ?? null,
    minimumUpgradePremiumBps,
    lowerMonthlyIncluded:
      evaluation.lowerPlan.kind === "FREE"
        ? 0
        : (evaluation.lowerPlan.includedRecoveryConversationAllowance ?? 0),
    higherMonthlyIncluded:
      evaluation.higherPlan.kind === "FREE"
        ? 0
        : (evaluation.higherPlan.includedRecoveryConversationAllowance ?? 0),
    recoveryCreditsPerPack: evaluation.lowerPlan.recoveryCreditsPerPack,
    packUnitsNeeded: details.packUnitsNeeded ?? null,
    topUpPath: details.packSummary ?? [],
    topUpCostMinor: details.topUpCostMinor ?? null,
    stayAndTopUpCostMinor: details.stayAndTopUpCostMinor ?? null,
    upgradeCostMinor: details.upgradeCostMinor ?? null,
    requiredMinimumMinor: details.requiredMinimumMinor ?? null,
    premiumBps: details.premiumBps ?? null,
    status: evaluation.result.status,
    code: evaluation.result.code,
  };
}
