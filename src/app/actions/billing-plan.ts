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
  parseBillingPlanForm,
  type BillingPlanFormValues,
} from "@/lib/admin/billing-plan-validation";

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
          freeLifetimeConversationAllowance:
            values.freeLifetimeConversationAllowance,
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

    const updated = await transaction.billingPlan.update({
      where: { id: existing.id },
      data: {
        name: values.name,
        kind: values.kind,
        shopifyUsageEventHandle: values.shopifyUsageEventHandle,
        includedRecoveryConversationAllowance:
          values.includedRecoveryConversationAllowance,
        recoveryCreditPackEnabled: values.recoveryCreditPackEnabled,
        recoveryCreditsPerPack: values.recoveryCreditsPerPack,
        shopifyRecoveryCreditPackEventHandle:
          values.shopifyRecoveryCreditPackEventHandle,
        freeLifetimeConversationAllowance:
          values.freeLifetimeConversationAllowance,
        defaultOutboundSoftLimit: values.defaultOutboundSoftLimit,
        defaultOutboundHardLimit: values.defaultOutboundHardLimit,
        terminalMessageReservedSlots: values.terminalMessageReservedSlots,
        features: {
          deleteMany: {},
          create: featureRows(values),
        },
      },
    });
    await transaction.billingAuditEvent.create({
      data: {
        action: BillingAuditAction.PLAN_CATALOG_CHANGED,
        platformAdminId: adminId,
        reason: values.reason,
        relatedEntityType: "BillingPlan",
        relatedEntityId: updated.id,
        beforeValue: billingPlanAuditSnapshot(
          existing,
        ) as Prisma.InputJsonObject,
        afterValue: billingPlanAuditSnapshot({
          ...values,
          active: existing.active,
        }) as Prisma.InputJsonObject,
      },
    });
  });
  revalidatePath("/billing");
}
