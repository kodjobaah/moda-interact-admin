"use server";

import { BillingAuditAction, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requirePlatformAdminMutation } from "@/lib/auth/platform-admin";
import { prisma } from "@/lib/prisma";
import {
  parseEconomicsSnapshotForm,
  parseUpgradeEdgeForm,
} from "@/lib/admin/billing-economics-validation";

async function auditAdminId(
  principal: Awaited<ReturnType<typeof requirePlatformAdminMutation>>,
): Promise<string> {
  if (!principal.developmentBypass) return principal.id;
  const admin = await prisma.platformAdmin.findFirst({
    where: { active: true, role: "SUPER_ADMIN" },
    select: { id: true },
  });
  if (!admin) throw new Error("A provisioned SUPER_ADMIN is required for billing economics.");
  return admin.id;
}

function requireSuperAdmin(
  principal: Awaited<ReturnType<typeof requirePlatformAdminMutation>>,
): void {
  if (principal.role !== "SUPER_ADMIN") throw new Error("SUPER_ADMIN access is required.");
}

export async function mutateUpgradeEdgeAction(formData: FormData): Promise<void> {
  const principal = await requirePlatformAdminMutation();
  requireSuperAdmin(principal);
  const values = parseUpgradeEdgeForm(formData);
  const adminId = await auditAdminId(principal);

  await prisma.$transaction(async (transaction) => {
    if (values.intent === "deactivate") {
      if (!values.id) throw new Error("An upgrade edge id is required.");
      const existing = await transaction.billingUpgradeEconomicsEdge.findUnique({ where: { id: values.id } });
      if (!existing) throw new Error("Upgrade edge not found.");
      const edge = await transaction.billingUpgradeEconomicsEdge.update({ where: { id: existing.id }, data: { active: false } });
      await transaction.billingAuditEvent.create({
        data: {
          action: BillingAuditAction.UPGRADE_ECONOMICS_EVALUATED,
          platformAdminId: adminId,
          reason: values.reason,
          relatedEntityType: "BillingUpgradeEconomicsEdge",
          relatedEntityId: edge.id,
          beforeValue: existing as unknown as Prisma.InputJsonValue,
          afterValue: edge as unknown as Prisma.InputJsonValue,
        },
      });
      return;
    }

    if (values.lowerPlanId === values.higherPlanId) throw new Error("An upgrade edge cannot point to the same plan.");
    const [lower, higher, lowerEdge, higherEdge] = await Promise.all([
      transaction.billingPlan.findUnique({ where: { id: values.lowerPlanId } }),
      transaction.billingPlan.findUnique({ where: { id: values.higherPlanId } }),
      transaction.billingUpgradeEconomicsEdge.findUnique({ where: { lowerPlanId: values.lowerPlanId } }),
      transaction.billingUpgradeEconomicsEdge.findUnique({ where: { higherPlanId: values.higherPlanId } }),
    ]);
    if (!lower || !higher || !lower.active || !higher.active) throw new Error("Upgrade edges require active durable plans.");
    if (lowerEdge?.active || higherEdge?.active) throw new Error("Each plan may have only one active lower and higher upgrade edge.");
    const lowerAllowance = lower.includedRecoveryConversationAllowance ?? 0;
    const higherAllowance = higher.includedRecoveryConversationAllowance ?? 0;
    if (higherAllowance <= lowerAllowance) throw new Error("The higher plan must provide a larger monthly recovery allowance.");

    const edge = await transaction.billingUpgradeEconomicsEdge.create({
      data: { lowerPlanId: lower.id, higherPlanId: higher.id },
    });
    await transaction.billingAuditEvent.create({
      data: {
        action: BillingAuditAction.UPGRADE_ECONOMICS_EVALUATED,
        platformAdminId: adminId,
        reason: values.reason,
        relatedEntityType: "BillingUpgradeEconomicsEdge",
        relatedEntityId: edge.id,
        afterValue: { lowerPlanId: lower.id, higherPlanId: higher.id } as Prisma.InputJsonObject,
      },
    });
  });
  revalidatePath("/billing/controls");
  revalidatePath("/billing");
}

export async function recordEconomicsSnapshotAction(formData: FormData): Promise<void> {
  const principal = await requirePlatformAdminMutation();
  requireSuperAdmin(principal);
  const values = parseEconomicsSnapshotForm(formData);
  const adminId = await auditAdminId(principal);

  await prisma.$transaction(async (transaction) => {
    const plan = await transaction.billingPlan.findUnique({ where: { id: values.billingPlanId } });
    if (!plan) throw new Error("Billing plan not found.");
    if (plan.shopifyPlanHandle !== values.shopifyPlanHandleSnapshot) throw new Error("Shopify plan handle does not match the local mapping.");
    if (plan.recoveryCreditPackEnabled !== values.recoveryCreditPackEnabledSnapshot) throw new Error("Recovery-credit pack enablement does not match the local mapping.");
    if (plan.recoveryCreditsPerPack !== values.recoveryCreditsPerPackSnapshot) throw new Error("Recovery-credit pack size does not match the local mapping.");
    if (plan.shopifyRecoveryCreditPackEventHandle !== values.shopifyRecoveryCreditPackEventHandleSnapshot) throw new Error("Recovery-credit pack event handle does not match the local mapping.");

    const snapshot = await transaction.billingEconomicsSnapshot.create({
      data: {
        billingPlanId: plan.id,
        shopifyPlanHandleSnapshot: values.shopifyPlanHandleSnapshot,
        monthlyRecurringAmountMinor: values.monthlyRecurringAmountMinor,
        currency: values.currency,
        recoveryCreditPackEnabledSnapshot: values.recoveryCreditPackEnabledSnapshot,
        recoveryCreditsPerPackSnapshot: values.recoveryCreditsPerPackSnapshot,
        shopifyRecoveryCreditPackEventHandleSnapshot: values.shopifyRecoveryCreditPackEventHandleSnapshot,
        usagePricingSnapshot: values.usagePricingSnapshot as Prisma.InputJsonValue | undefined,
        providerEvidence: { source: "SHOPIFY_PARTNER_DASHBOARD_MANUAL_VERIFICATION" },
        verifiedByPlatformAdminId: adminId,
        verificationReason: values.verificationReason,
        verifiedAt: new Date(),
      },
    });
    await transaction.billingAuditEvent.create({
      data: {
        action: BillingAuditAction.UPGRADE_ECONOMICS_EVALUATED,
        platformAdminId: adminId,
        reason: values.verificationReason,
        relatedEntityType: "BillingEconomicsSnapshot",
        relatedEntityId: snapshot.id,
        afterValue: {
          billingPlanId: plan.id,
          snapshotId: snapshot.id,
          shopifyPlanHandleSnapshot: values.shopifyPlanHandleSnapshot,
          recoveryCreditPackEnabledSnapshot: values.recoveryCreditPackEnabledSnapshot,
        } as Prisma.InputJsonObject,
      },
    });
  });
  revalidatePath("/billing/controls");
  revalidatePath("/billing");
}
