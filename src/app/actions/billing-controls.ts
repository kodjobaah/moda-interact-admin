"use server";

import { BillingAuditAction, EntitlementCounter, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requirePlatformAdminMutation } from "@/lib/auth/platform-admin";
import { prisma } from "@/lib/prisma";
import {
  parseAllowanceAdjustmentForm,
  parsePlatformBillingPolicyForm,
  parseShopBillingOverrideForm,
  shopBillingOverrideRequiresSuperAdmin,
} from "@/lib/admin/billing-control-validation";

async function auditAdminId(
  principal: Awaited<ReturnType<typeof requirePlatformAdminMutation>>,
): Promise<string> {
  if (!principal.developmentBypass) return principal.id;
  const developmentAdmin = await prisma.platformAdmin.findFirst({
    where: { active: true, role: "SUPER_ADMIN" },
    select: { id: true },
  });
  if (!developmentAdmin) {
    throw new Error(
      "A provisioned SUPER_ADMIN is required for billing controls.",
    );
  }
  return developmentAdmin.id;
}

function requireSuperAdmin(
  principal: Awaited<ReturnType<typeof requirePlatformAdminMutation>>,
): void {
  if (principal.role !== "SUPER_ADMIN") {
    throw new Error("SUPER_ADMIN access is required for this control.");
  }
}

export async function mutatePlatformBillingPolicyAction(
  formData: FormData,
): Promise<void> {
  const principal = await requirePlatformAdminMutation();
  requireSuperAdmin(principal);
  const values = parsePlatformBillingPolicyForm(formData);
  const adminId = await auditAdminId(principal);

  await prisma.$transaction(async (transaction) => {
    const before = await transaction.platformBillingPolicy.findUnique({
      where: { id: "default" },
    });
    const after = await transaction.platformBillingPolicy.upsert({
      where: { id: "default" },
      create: { id: "default", ...values },
      update: {
        globalPauseNewRecoveries: values.globalPauseNewRecoveries,
        globalPauseAutomatedWhatsapp: values.globalPauseAutomatedWhatsapp,
        absoluteOutboundHardLimit: values.absoluteOutboundHardLimit,
        defaultWarningPercent: values.defaultWarningPercent,
        version: { increment: 1 },
      },
    });
    await transaction.billingAuditEvent.create({
      data: {
        action: BillingAuditAction.PLATFORM_POLICY_CHANGED,
        platformAdminId: adminId,
        reason: values.reason,
        relatedEntityType: "PlatformBillingPolicy",
        relatedEntityId: after.id,
        beforeValue: before as unknown as Prisma.InputJsonValue,
        afterValue: after as unknown as Prisma.InputJsonValue,
      },
    });
  });
  revalidatePath("/billing");
  revalidatePath("/billing/controls");
}

export async function mutateShopBillingOverrideAction(
  formData: FormData,
): Promise<void> {
  const principal = await requirePlatformAdminMutation();
  const values = parseShopBillingOverrideForm(formData);
  const adminId = await auditAdminId(principal);

  await prisma.$transaction(async (transaction) => {
    const [shop, platform, existing] = await Promise.all([
      transaction.shop.findUnique({
        where: { id: values.shopId },
        select: {
          subscription: {
            select: {
              plan: {
                select: {
                  defaultOutboundSoftLimit: true,
                  defaultOutboundHardLimit: true,
                },
              },
            },
          },
        },
      }),
      transaction.platformBillingPolicy.findUnique({
        where: { id: "default" },
      }),
      transaction.shopBillingPolicyOverride.findUnique({
        where: { shopId: values.shopId },
      }),
    ]);
    if (!shop) throw new Error("Shop not found.");
    if (!platform)
      throw new Error("Platform billing policy is not configured.");
    if (!shop.subscription?.plan) {
      throw new Error(
        "A mapped billing plan is required before setting overrides.",
      );
    }

    if (shopBillingOverrideRequiresSuperAdmin(values, existing)) {
      requireSuperAdmin(principal);
    }

    if (
      values.outboundHardLimit !== null &&
      values.outboundHardLimit > platform.absoluteOutboundHardLimit
    ) {
      throw new Error(
        "Shop hard limit cannot exceed the platform hard ceiling.",
      );
    }
    const effectiveHard =
      values.outboundHardLimit ??
      shop.subscription.plan.defaultOutboundHardLimit;
    const effectiveSoft =
      values.outboundSoftLimit ??
      shop.subscription.plan.defaultOutboundSoftLimit;
    if (effectiveSoft >= effectiveHard) {
      throw new Error(
        "The effective soft limit must be below the effective hard limit.",
      );
    }
    if (
      values.recoverySafetyCeiling !== null &&
      values.recoverySafetyCeiling > platform.absoluteOutboundHardLimit
    ) {
      throw new Error(
        "Recovery safety ceiling cannot exceed the platform hard ceiling.",
      );
    }

    const after = await transaction.shopBillingPolicyOverride.upsert({
      where: { shopId: values.shopId },
      create: {
        shopId: values.shopId,
        outboundSoftLimit: values.outboundSoftLimit,
        outboundHardLimit: values.outboundHardLimit,
        pauseNewRecoveries: values.pauseNewRecoveries,
        pauseAutomatedWhatsapp: values.pauseAutomatedWhatsapp,
        recoverySafetyCeiling: values.recoverySafetyCeiling,
        expiresAt: values.expiresAt,
        reason: values.reason,
        updatedByPlatformAdminId: adminId,
      },
      update: {
        outboundSoftLimit: values.outboundSoftLimit,
        outboundHardLimit: values.outboundHardLimit,
        pauseNewRecoveries: values.pauseNewRecoveries,
        pauseAutomatedWhatsapp: values.pauseAutomatedWhatsapp,
        recoverySafetyCeiling: values.recoverySafetyCeiling,
        expiresAt: values.expiresAt,
        reason: values.reason,
        updatedByPlatformAdminId: adminId,
      },
    });
    await transaction.billingAuditEvent.create({
      data: {
        action: BillingAuditAction.SHOP_OVERRIDE_CHANGED,
        shopId: values.shopId,
        platformAdminId: adminId,
        reason: values.reason,
        relatedEntityType: "ShopBillingPolicyOverride",
        relatedEntityId: after.id,
        beforeValue: existing as unknown as Prisma.InputJsonValue,
        afterValue: after as unknown as Prisma.InputJsonValue,
      },
    });
  });
  revalidatePath("/");
}

export async function addFreeAllowanceAdjustmentAction(
  formData: FormData,
): Promise<void> {
  const principal = await requirePlatformAdminMutation();
  requireSuperAdmin(principal);
  const values = parseAllowanceAdjustmentForm(formData);
  if (values.quantity === 0)
    throw new Error("Adjustment quantity cannot be zero.");
  const adminId = await auditAdminId(principal);

  await prisma.$transaction(async (transaction) => {
    const shop = await transaction.shop.findUnique({
      where: { id: values.shopId },
      select: { id: true },
    });
    if (!shop) throw new Error("Shop not found.");
    const adjustment = await transaction.billingAllowanceAdjustment.create({
      data: {
        shopId: values.shopId,
        counter: EntitlementCounter.FREE_RECOVERY_LIFETIME,
        quantity: values.quantity,
        reason: values.reason,
        platformAdminId: adminId,
      },
    });
    await transaction.billingAuditEvent.create({
      data: {
        action: BillingAuditAction.FREE_ALLOWANCE_ADJUSTED,
        shopId: values.shopId,
        platformAdminId: adminId,
        reason: values.reason,
        relatedEntityType: "BillingAllowanceAdjustment",
        relatedEntityId: adjustment.id,
        afterValue: {
          quantity: values.quantity,
          counter: EntitlementCounter.FREE_RECOVERY_LIFETIME,
        },
      },
    });
  });
  revalidatePath("/");
}
