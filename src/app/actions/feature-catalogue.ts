"use server";

import { BillingAuditAction, FeatureActivationMode } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requirePlatformAdminMutation } from "@/lib/auth/platform-admin";
import { prisma } from "@/lib/prisma";
import { FEATURE_KEY_PATTERN } from "@/lib/admin/feature-catalogue";

function actionError(message: string): never {
  throw new Error(message);
}

function text(formData: FormData, name: string, maxLength: number): string {
  const value = formData.get(name);
  if (typeof value !== "string") actionError(`${name} is required.`);
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) {
    actionError(`${name} must be between 1 and ${maxLength} characters.`);
  }
  return trimmed;
}

export async function mutateFeatureCatalogueAction(formData: FormData): Promise<void> {
  const principal = await requirePlatformAdminMutation();
  if (principal.role !== "SUPER_ADMIN") actionError("SUPER_ADMIN access is required.");
  const intent = formData.get("intent");
  const id = formData.get("id");

  if (intent === "create") {
    const key = text(formData, "key", 128);
    if (!FEATURE_KEY_PATTERN.test(key)) actionError("Feature key has an invalid format.");
    const displayName = text(formData, "displayName", 255);
    const rawDescription = formData.get("description");
    const description = typeof rawDescription === "string" ? rawDescription.trim() : "";
    if (description.length > 2000) actionError("Feature description must be at most 2000 characters.");
    const activationMode = formData.get("activationMode");
    if (activationMode !== FeatureActivationMode.ALWAYS_ENABLED && activationMode !== FeatureActivationMode.MERCHANT_OPT_IN) {
      actionError("Feature activation mode is invalid.");
    }
    try {
      await prisma.$transaction(async (transaction) => {
        const feature = await transaction.feature.create({
          data: {
            key,
            displayName,
            description: description || null,
            activationMode,
            systemRequired: false,
            active: true,
          },
        });
        await transaction.billingAuditEvent.create({
          data: {
            action: BillingAuditAction.PLAN_CATALOG_CHANGED,
            platformAdminId: principal.id,
            reason: `Created Feature ${feature.key}`,
            relatedEntityType: "Feature",
            relatedEntityId: feature.id,
          },
        });
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("Unique constraint")) {
        actionError("A Feature with this key already exists.");
      }
      throw error;
    }
  } else if (intent === "update") {
    if (typeof id !== "string" || !id) actionError("A Feature id is required.");
    const displayName = text(formData, "displayName", 255);
    const rawDescription = formData.get("description");
    const description = typeof rawDescription === "string" ? rawDescription.trim() : "";
    if (description.length > 2000) actionError("Feature description must be at most 2000 characters.");
    await prisma.$transaction(async (transaction) => {
      const existing = await transaction.feature.findUnique({ where: { id } });
      if (!existing) actionError("Feature not found.");
      const feature = await transaction.feature.update({
        where: { id },
        data: { displayName, description: description || null },
      });
      await transaction.billingAuditEvent.create({
        data: {
          action: BillingAuditAction.PLAN_CATALOG_CHANGED,
          platformAdminId: principal.id,
          reason: `Updated Feature ${feature.key}`,
          relatedEntityType: "Feature",
          relatedEntityId: feature.id,
        },
      });
    });
  } else if (intent === "toggle") {
    if (typeof id !== "string" || !id) actionError("A Feature id is required.");
    await prisma.$transaction(async (transaction) => {
      const existing = await transaction.feature.findUnique({ where: { id } });
      if (!existing) actionError("Feature not found.");
      if (existing.systemRequired) actionError("System-required Features cannot be deactivated.");
      const feature = await transaction.feature.update({
        where: { id },
        data: { active: !existing.active },
      });
      await transaction.billingAuditEvent.create({
        data: {
          action: BillingAuditAction.PLAN_CATALOG_CHANGED,
          platformAdminId: principal.id,
          reason: `${feature.active ? "Activated" : "Deactivated"} Feature ${feature.key}`,
          relatedEntityType: "Feature",
          relatedEntityId: feature.id,
        },
      });
    });
  } else {
    actionError("Unsupported Feature catalogue action.");
  }

  revalidatePath("/billing");
}
