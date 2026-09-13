"use server";

import {
  BillingAuditAction,
  BillingPlanFeatureIdentifier,
  Prisma,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requirePlatformAdminMutation } from "@/lib/auth/platform-admin";
import { prisma } from "@/lib/prisma";
import { billingPlanAuditSnapshot } from "@/lib/admin/billing-plan-audit";
import {
  applyBillingPlanUpdateInTransaction,
  type BillingPlanMutationTransaction,
} from "@/lib/admin/billing-plan-mutation";
import {
  parseBillingPlanForm,
  type BillingPlanFormValues,
} from "@/lib/admin/billing-plan-validation";
import {
  assertBillingUpgradeEconomicsPass,
  billingUpgradeEconomicsAuditEvidence,
  evaluateBillingUpgradeEdge,
  type BillingPlanEconomicsCandidate,
  type EvaluatedBillingUpgradeEdge,
} from "@/lib/admin/billing-plan-guardrail";

async function auditAdminId(
  principal: Awaited<ReturnType<typeof requirePlatformAdminMutation>>,
) {
  if (!principal.developmentBypass) return principal.id;
  const developmentAdmin = await prisma.platformAdmin.findFirst({
    where: { active: true, role: "SUPER_ADMIN" },
    select: { id: true },
  });
  if (!developmentAdmin) {
    throw new Error(
      "A provisioned SUPER_ADMIN is required before billing mutations can be audited.",
    );
  }
  return developmentAdmin.id;
}

function featureRows(values: BillingPlanFormValues) {
  return values.features.map((feature) => ({
    feature: feature as BillingPlanFeatureIdentifier,
    enabled: true,
  }));
}

async function evaluateAffectedEdges(
  transaction: Prisma.TransactionClient,
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
  const latestSnapshots = new Map<string, (typeof snapshots)[number]>();
  for (const snapshot of snapshots) {
    if (!latestSnapshots.has(snapshot.billingPlanId)) {
      latestSnapshots.set(snapshot.billingPlanId, snapshot);
    }
  }

  return activeEdges.map(({ lowerPlan, higherPlan, ...edge }) => {
    const lower = (
      lowerPlan.id === planId ? proposedPlan : lowerPlan
    ) as BillingPlanEconomicsCandidate;
    const higher = (
      higherPlan.id === planId ? proposedPlan : higherPlan
    ) as BillingPlanEconomicsCandidate;
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
  transaction: Prisma.TransactionClient,
  evaluations: EvaluatedBillingUpgradeEdge[],
  adminId: string,
  reason: string,
): Promise<void> {
  for (const evaluation of evaluations) {
    await transaction.billingAuditEvent.create({
      data: {
        action: BillingAuditAction.UPGRADE_ECONOMICS_EVALUATED,
        platformAdminId: adminId,
        reason,
        relatedEntityType: "BillingUpgradeEconomicsEdge",
        relatedEntityId: evaluation.edge.id,
        afterValue: billingUpgradeEconomicsAuditEvidence(
          evaluation,
          evaluation.minimumUpgradePremiumBps,
        ) as unknown as Prisma.InputJsonObject,
      },
    });
  }
}

export async function mutateBillingPlanAction(
  formData: FormData,
): Promise<void> {
  const principal = await requirePlatformAdminMutation();
  if (principal.role !== "SUPER_ADMIN")
    throw new Error("SUPER_ADMIN access is required.");

  const values = parseBillingPlanForm(formData);
  const adminId = await auditAdminId(principal);

  if (values.intent === "toggle") {
    if (!values.id) throw new Error("A billing plan id is required.");
    await prisma.$transaction(async (transaction) => {
      const existing = await transaction.billingPlan.findUnique({
        where: { id: values.id! },
        include: { features: true },
      });
      if (!existing) throw new Error("Billing plan not found.");
      if (!existing.active) {
        const evaluations = await evaluateAffectedEdges(
          transaction,
          existing.id,
          {
            ...existing,
            active: true,
          },
        );
        assertBillingUpgradeEconomicsPass(evaluations);
        await auditEconomicsEvaluations(
          transaction,
          evaluations,
          adminId,
          values.reason,
        );
      }
      const updated = await transaction.billingPlan.update({
        where: { id: existing.id },
        data: { active: !existing.active },
      });
      await transaction.billingAuditEvent.create({
        data: {
          action: BillingAuditAction.PLAN_CATALOG_CHANGED,
          platformAdminId: adminId,
          reason: values.reason,
          relatedEntityType: "BillingPlan",
          relatedEntityId: existing.id,
          beforeValue: billingPlanAuditSnapshot(
            existing,
          ) as Prisma.InputJsonObject,
          afterValue: billingPlanAuditSnapshot({
            ...updated,
            features: existing.features,
          }) as Prisma.InputJsonObject,
        },
      });
    });
    revalidatePath("/billing");
    return;
  }

  if (values.intent === "create") {
    await prisma.$transaction(async (transaction) => {
      const created = await transaction.billingPlan.create({
        data: {
          shopifyPlanHandle: values.shopifyPlanHandle,
          name: values.name,
          kind: values.kind,
          shopifyUsageEventHandle: values.shopifyUsageEventHandle,
          includedRecoveryConversationAllowance:
            values.includedRecoveryConversationAllowance,
          recoveryCreditPackEnabled: values.recoveryCreditPackEnabled,
          recoveryCreditsPerPack: values.recoveryCreditsPerPack,
          shopifyRecoveryCreditPackEventHandle:
            values.shopifyRecoveryCreditPackEventHandle,
          defaultOutboundSoftLimit: values.defaultOutboundSoftLimit,
          defaultOutboundHardLimit: values.defaultOutboundHardLimit,
          terminalMessageReservedSlots: values.terminalMessageReservedSlots,
          features: { create: featureRows(values) },
        },
      });
      await transaction.billingAuditEvent.create({
        data: {
          action: BillingAuditAction.PLAN_CATALOG_CHANGED,
          platformAdminId: adminId,
          reason: values.reason,
          relatedEntityType: "BillingPlan",
          relatedEntityId: created.id,
          afterValue: billingPlanAuditSnapshot({
            ...values,
            active: true,
          }) as Prisma.InputJsonObject,
        },
      });
    });
    revalidatePath("/billing");
    return;
  }

  if (!values.id) throw new Error("A billing plan id is required.");
  await prisma.$transaction(async (transaction) => {
    const existing = await transaction.billingPlan.findUnique({
      where: { id: values.id! },
      include: { features: true },
    });
    if (!existing) throw new Error("Billing plan not found.");
    if (existing.shopifyPlanHandle !== values.shopifyPlanHandle) {
      throw new Error(
        "Shopify plan handles are immutable. Deactivate the mapping and create a new plan.",
      );
    }
    if (
      existing.shopifyUsageEventHandle !== values.shopifyUsageEventHandle &&
      !values.confirmUsageHandleChange
    ) {
      throw new Error(
        "Changing a Shopify usage handle requires explicit confirmation.",
      );
    }

    await applyBillingPlanUpdateInTransaction({
      transaction: transaction as unknown as BillingPlanMutationTransaction,
      existing,
      proposed: {
        ...existing,
        name: values.name,
        kind: values.kind,
        shopifyUsageEventHandle: values.shopifyUsageEventHandle,
        includedRecoveryConversationAllowance:
          values.includedRecoveryConversationAllowance,
        recoveryCreditPackEnabled: values.recoveryCreditPackEnabled,
        recoveryCreditsPerPack: values.recoveryCreditsPerPack,
        shopifyRecoveryCreditPackEventHandle:
          values.shopifyRecoveryCreditPackEventHandle,
        defaultOutboundSoftLimit: values.defaultOutboundSoftLimit,
        defaultOutboundHardLimit: values.defaultOutboundHardLimit,
        terminalMessageReservedSlots: values.terminalMessageReservedSlots,
        features: values.features,
      },
      adminId,
      reason: values.reason,
    });
  });
  revalidatePath("/billing");
}
