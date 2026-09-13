"use server";

import { PromotionCampaignEventType, PromotionCampaignStatus, PromotionTargetScope } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requirePlatformAdminMutation } from "@/lib/auth/platform-admin";
import { prisma } from "@/lib/prisma";
import {
  parsePromotionCampaignForm,
  validatePromotionTarget,
  type PromotionCampaignFormValues,
} from "@/lib/admin/promotion-validation";

async function auditAdminId(
  principal: Awaited<ReturnType<typeof requirePlatformAdminMutation>>,
): Promise<string> {
  if (!principal.developmentBypass) return principal.id;
  const admin = await prisma.platformAdmin.findFirst({
    where: { active: true, role: "SUPER_ADMIN" },
    select: { id: true },
  });
  if (!admin) throw new Error("A provisioned SUPER_ADMIN is required for campaign mutations.");
  return admin.id;
}

function requireSuperAdmin(
  principal: Awaited<ReturnType<typeof requirePlatformAdminMutation>>,
): void {
  if (principal.role !== "SUPER_ADMIN") throw new Error("SUPER_ADMIN access is required.");
}

async function resolveTarget(
  transaction: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  values: PromotionCampaignFormValues,
): Promise<void> {
  validatePromotionTarget(values.scope, values.targetPlanId, values.targetShopId);
  if (values.scope === "PLAN") {
    const plan = await transaction.billingPlan.findUnique({
      where: { id: values.targetPlanId! },
      select: { id: true },
    });
    if (!plan) throw new Error("Billing plan target was not found.");
  }
  if (values.scope === "SHOP") {
    const shop = await transaction.shop.findUnique({
      where: { id: values.targetShopId! },
      select: { id: true },
    });
    if (!shop) throw new Error("Shop target was not found.");
  }
}

function campaignData(values: PromotionCampaignFormValues) {
  return {
    name: values.name,
    merchantDescription: values.merchantDescription,
    scope: values.scope as PromotionTargetScope,
    quantity: values.quantity,
    targetPlanId: values.targetPlanId,
    targetShopId: values.targetShopId,
    startsAt: values.startsAt,
    expiresAt: values.expiresAt,
  };
}

export async function mutatePromotionCampaignAction(formData: FormData): Promise<void> {
  const principal = await requirePlatformAdminMutation();
  requireSuperAdmin(principal);
  const values = parsePromotionCampaignForm(formData);
  const adminId = await auditAdminId(principal);

  await prisma.$transaction(async (transaction) => {
    if (values.intent === "activate") {
      if (!values.id) throw new Error("A campaign id is required.");
      const existing = await transaction.promotionCampaign.findUnique({ where: { id: values.id } });
      if (!existing) throw new Error("Promotion campaign not found.");
      if (existing.status !== PromotionCampaignStatus.DRAFT) {
        throw new Error("Only draft campaigns can be activated.");
      }
      const currentValues: PromotionCampaignFormValues = {
        id: existing.id,
        intent: "activate",
        name: existing.name,
        merchantDescription: existing.merchantDescription,
        scope: existing.scope,
        quantity: existing.quantity,
        targetPlanId: existing.targetPlanId,
        targetShopId: existing.targetShopId,
        startsAt: existing.startsAt,
        expiresAt: existing.expiresAt,
      };
      await resolveTarget(transaction, currentValues);
      const activated = await transaction.promotionCampaign.update({
        where: { id: existing.id },
        data: { status: PromotionCampaignStatus.ACTIVE, version: { increment: 1 } },
      });
      await transaction.promotionCampaignEvent.create({
        data: {
          campaignId: activated.id,
          kind: PromotionCampaignEventType.ACTIVATED,
          platformAdminId: adminId,
        },
      });
      return;
    }

    await resolveTarget(transaction, values);
    if (values.intent === "create") {
      const campaign = await transaction.promotionCampaign.create({
        data: {
          ...campaignData(values),
          status: PromotionCampaignStatus.DRAFT,
          createdByPlatformAdminId: adminId,
        },
      });
      await transaction.promotionCampaignEvent.create({
        data: {
          campaignId: campaign.id,
          kind: PromotionCampaignEventType.CREATED,
          platformAdminId: adminId,
        },
      });
      return;
    }

    if (!values.id) throw new Error("A campaign id is required.");
    const existing = await transaction.promotionCampaign.findUnique({ where: { id: values.id } });
    if (!existing) throw new Error("Promotion campaign not found.");
    if (existing.status !== PromotionCampaignStatus.DRAFT) {
      throw new Error("Activated campaign terms are immutable; create a new campaign.");
    }
    await transaction.promotionCampaign.update({
      where: { id: existing.id },
      data: { ...campaignData(values), version: { increment: 1 } },
    });
  });
  revalidatePath("/promotions");
}