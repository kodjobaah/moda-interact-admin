import type { BillingPlanFeatureIdentifier } from "@prisma/client";
import { billingPlanAuditSnapshot } from "./billing-plan-audit.ts";
import {
  assertBillingUpgradeEconomicsPass,
  billingUpgradeEconomicsAuditEvidence,
  evaluateBillingUpgradeEdge,
  type BillingPlanEconomicsCandidate,
  type EvaluatedBillingUpgradeEdge,
} from "./billing-plan-guardrail.ts";

export type BillingPlanMutationPlan = BillingPlanEconomicsCandidate & {
  shopifyPlanHandle: string;
  shopifyUsageEventHandle: string | null;
  defaultOutboundSoftLimit: number;
  defaultOutboundHardLimit: number;
  terminalMessageReservedSlots: number;
  features: readonly { feature: string; enabled: boolean }[];
};

export type BillingPlanMutationProposal = Omit<
  BillingPlanMutationPlan,
  "features"
> & {
  features: readonly BillingPlanFeatureIdentifier[];
};

type SnapshotRecord = {
  id: string;
  billingPlanId: string;
  monthlyRecurringAmountMinor: number;
  currency: string;
  recoveryCreditPackEnabledSnapshot: boolean;
  recoveryCreditsPerPackSnapshot: number | null;
  shopifyRecoveryCreditPackEventHandleSnapshot: string | null;
  usagePricingSnapshot: unknown;
  verifiedAt: Date;
};

type EdgeRecord = {
  id: string;
  lowerPlanId: string;
  higherPlanId: string;
  active: boolean;
  lowerPlan: BillingPlanMutationPlan;
  higherPlan: BillingPlanMutationPlan;
};

export type BillingPlanMutationTransaction = {
  platformBillingPolicy: {
    findUnique(args: unknown): Promise<{ minimumUpgradePremiumBps: number } | null>;
  };
  billingUpgradeEconomicsEdge: {
    findMany(args: unknown): Promise<EdgeRecord[]>;
  };
  billingEconomicsSnapshot: {
    findMany(args: unknown): Promise<SnapshotRecord[]>;
  };
  billingAuditEvent: {
    create(args: unknown): Promise<unknown>;
  };
  billingPlan: {
    update(args: unknown): Promise<BillingPlanMutationPlan>;
  };
  billingPlanFeature: {
    deleteMany(args: unknown): Promise<unknown>;
    createMany(args: unknown): Promise<unknown>;
  };
};

async function evaluateAffectedEdges(
  transaction: BillingPlanMutationTransaction,
  planId: string,
  proposedPlan: BillingPlanEconomicsCandidate,
): Promise<EvaluatedBillingUpgradeEdge[]> {
  const policy = await transaction.platformBillingPolicy.findUnique({
    where: { id: "default" },
    select: { minimumUpgradePremiumBps: true },
  });
  const edges = await transaction.billingUpgradeEconomicsEdge.findMany({
    where: {
      active: true,
      OR: [{ lowerPlanId: planId }, { higherPlanId: planId }],
    },
    include: { lowerPlan: true, higherPlan: true },
  });
  const activeEdges = edges.filter(({ lowerPlan, higherPlan }) => {
    const lower = lowerPlan.id === planId ? proposedPlan : lowerPlan;
    const higher = higherPlan.id === planId ? proposedPlan : higherPlan;
    return lower.active && higher.active;
  });
  if (!activeEdges.length) return [];

  const planIds = [
    ...new Set(
      activeEdges.flatMap(({ lowerPlan, higherPlan }) => [
        lowerPlan.id,
        higherPlan.id,
      ]),
    ),
  ];
  const snapshots = await transaction.billingEconomicsSnapshot.findMany({
    where: { billingPlanId: { in: planIds } },
    orderBy: { verifiedAt: "desc" },
  });
  const latestSnapshots = new Map<string, SnapshotRecord>();
  for (const snapshot of snapshots) {
    if (!latestSnapshots.has(snapshot.billingPlanId)) {
      latestSnapshots.set(snapshot.billingPlanId, snapshot);
    }
  }

  return activeEdges.map(({ lowerPlan, higherPlan, ...edge }) => {
    const lower = lowerPlan.id === planId ? proposedPlan : lowerPlan;
    const higher = higherPlan.id === planId ? proposedPlan : higherPlan;
    return evaluateBillingUpgradeEdge({
      edge,
      lowerPlan: lower,
      higherPlan: higher,
      lowerSnapshot: latestSnapshots.get(lower.id) ?? null,
      higherSnapshot: latestSnapshots.get(higher.id) ?? null,
      minimumUpgradePremiumBps: policy?.minimumUpgradePremiumBps ?? 2000,
    });
  });
}

async function auditEconomicsEvaluations(
  transaction: BillingPlanMutationTransaction,
  evaluations: EvaluatedBillingUpgradeEdge[],
  adminId: string,
  reason: string,
): Promise<void> {
  for (const evaluation of evaluations) {
    await transaction.billingAuditEvent.create({
      data: {
        action: "UPGRADE_ECONOMICS_EVALUATED",
        platformAdminId: adminId,
        reason,
        relatedEntityType: "BillingUpgradeEconomicsEdge",
        relatedEntityId: evaluation.edge.id,
        afterValue: billingUpgradeEconomicsAuditEvidence(
          evaluation,
          evaluation.minimumUpgradePremiumBps,
        ),
      },
    });
  }
}

export async function applyBillingPlanUpdateInTransaction({
  transaction,
  existing,
  proposed,
  adminId,
  reason,
}: {
  transaction: BillingPlanMutationTransaction;
  existing: BillingPlanMutationPlan;
  proposed: BillingPlanMutationProposal;
  adminId: string;
  reason: string;
}): Promise<void> {
  const economicsChanged =
    existing.kind !== proposed.kind ||
    existing.includedRecoveryConversationAllowance !==
      proposed.includedRecoveryConversationAllowance ||
    existing.recoveryCreditPackEnabled !== proposed.recoveryCreditPackEnabled ||
    existing.recoveryCreditsPerPack !== proposed.recoveryCreditsPerPack ||
    existing.shopifyRecoveryCreditPackEventHandle !==
      proposed.shopifyRecoveryCreditPackEventHandle;

  let evaluations: EvaluatedBillingUpgradeEdge[] = [];
  if (economicsChanged) {
    evaluations = await evaluateAffectedEdges(transaction, existing.id, proposed);
    assertBillingUpgradeEconomicsPass(evaluations);
    await auditEconomicsEvaluations(transaction, evaluations, adminId, reason);
  }

  const updated = await transaction.billingPlan.update({
    where: { id: existing.id },
    data: {
      name: proposed.name,
      kind: proposed.kind,
      shopifyUsageEventHandle: proposed.shopifyUsageEventHandle,
      includedRecoveryConversationAllowance:
        proposed.includedRecoveryConversationAllowance,
      recoveryCreditPackEnabled: proposed.recoveryCreditPackEnabled,
      recoveryCreditsPerPack: proposed.recoveryCreditsPerPack,
      shopifyRecoveryCreditPackEventHandle:
        proposed.shopifyRecoveryCreditPackEventHandle,
      defaultOutboundSoftLimit: proposed.defaultOutboundSoftLimit,
      defaultOutboundHardLimit: proposed.defaultOutboundHardLimit,
      terminalMessageReservedSlots: proposed.terminalMessageReservedSlots,
      features: {
        deleteMany: {},
        create: proposed.features.map((feature) => ({ feature, enabled: true })),
      },
    },
  });
  await transaction.billingAuditEvent.create({
    data: {
      action: "PLAN_CATALOG_CHANGED",
      platformAdminId: adminId,
      reason,
      relatedEntityType: "BillingPlan",
      relatedEntityId: updated.id,
      beforeValue: billingPlanAuditSnapshot(existing),
      afterValue: billingPlanAuditSnapshot({
        ...proposed,
        active: existing.active,
      }),
    },
  });
}
