"use server";

import {
  BackgroundRuntimeConfigSection,
  Prisma,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requirePlatformAdminMutation, requirePlatformAdminRead } from "@/lib/auth/platform-admin";
import { prisma } from "@/lib/prisma";
import {
  ALL_RUNTIME_FIELDS,
  RUNTIME_CONFLICT_MESSAGE,
  RUNTIME_MISSING_MESSAGE,
  parseExpectedVersion,
  parseReason,
  parseRuntimeControlsForm,
  parseRuntimeSection,
  type RuntimeSection,
} from "@/lib/admin/background-runtime-control-validation";

export type BackgroundRuntimeConfigView = Record<string, number | boolean> & {
  version: number;
  canMutate: boolean;
};

async function auditAdminId(
  principal: Awaited<ReturnType<typeof requirePlatformAdminMutation>>,
): Promise<string> {
  if (!principal.developmentBypass) return principal.id;
  const admin = await prisma.platformAdmin.findFirst({
    where: { active: true, role: "SUPER_ADMIN" },
    select: { id: true },
  });
  if (!admin) throw new Error("A provisioned SUPER_ADMIN is required for runtime controls.");
  return admin.id;
}

function runtimeSnapshot(config: Record<string, unknown>): Record<string, number> {
  return Object.fromEntries([
    ["version", config.version],
    ...ALL_RUNTIME_FIELDS.map(({ key }) => [key, config[key]]),
  ]) as Record<string, number>;
}

export async function getBackgroundRuntimeConfig(): Promise<BackgroundRuntimeConfigView> {
  const principal = await requirePlatformAdminRead();
  const config = await prisma.backgroundRuntimeConfig.findUnique({ where: { id: "default" } });
  if (!config) throw new Error(RUNTIME_MISSING_MESSAGE);
  return {
    ...runtimeSnapshot(config as unknown as Record<string, unknown>),
    version: config.version,
    canMutate: principal.role === "SUPER_ADMIN",
  };
}

export async function mutateBackgroundRuntimeControlsAction(
  formData: FormData,
): Promise<void> {
  const principal = await requirePlatformAdminMutation();
  if (principal.role !== "SUPER_ADMIN") throw new Error("SUPER_ADMIN access is required.");

  const section = parseRuntimeSection(formData.get("section"));
  const expectedVersion = parseExpectedVersion(formData.get("expectedVersion"));
  const reason = parseReason(formData.get("reason"));
  const adminId = await auditAdminId(principal);

  await prisma.$transaction(async (transaction) => {
    const before = await transaction.backgroundRuntimeConfig.findUnique({
      where: { id: "default" },
    });
    if (!before) throw new Error(RUNTIME_MISSING_MESSAGE);
    if (before.version !== expectedVersion) throw new Error(RUNTIME_CONFLICT_MESSAGE);

    const prospective = parseRuntimeControlsForm(
      formData,
      section,
      before as unknown as Record<string, number>,
    );
    const updateData = Object.fromEntries(
      Object.entries(prospective).filter(([key]) =>
        ALL_RUNTIME_FIELDS.some((field) => field.key === key && fieldBelongsToSection(field.key, section)),
      ),
    ) as Prisma.BackgroundRuntimeConfigUpdateManyMutationInput;
    updateData.version = { increment: 1 };

    const updated = await transaction.backgroundRuntimeConfig.updateMany({
      where: { id: "default", version: expectedVersion },
      data: updateData,
    });
    if (updated.count !== 1) throw new Error(RUNTIME_CONFLICT_MESSAGE);

    const after = await transaction.backgroundRuntimeConfig.findUnique({
      where: { id: "default" },
    });
    if (!after) throw new Error(RUNTIME_MISSING_MESSAGE);

    await transaction.backgroundRuntimeConfigAuditEvent.create({
      data: {
        configId: "default",
        section: section as BackgroundRuntimeConfigSection,
        expectedVersion,
        resultingVersion: after.version,
        platformAdminId: adminId,
        reason,
        beforeValue: runtimeSnapshot(before) as unknown as Prisma.InputJsonValue,
        afterValue: runtimeSnapshot(after) as unknown as Prisma.InputJsonValue,
      },
    });
  });

  revalidatePath("/billing/controls");
}

function fieldBelongsToSection(key: string, section: RuntimeSection): boolean {
  const fieldSections: Record<RuntimeSection, string[]> = {
    OPERATIONAL: [
      "billingReconciliationIntervalSeconds",
      "billingReconciliationShopBatchSize",
      "shopifyUsagePublishBatchSize",
      "recoveryRepairIntervalSeconds",
      "recoveryRepairShopBatchSize",
      "recoveryResumeBatchSize",
      "checkoutRecoveryLifetimeDays",
      "translationReconciliationIntervalSeconds",
      "translationBatchMaxRequests",
      "conversationQuietWindowMs",
      "conversationMaxSettleWindowMs",
    ],
    ADVANCED: [
      "billingFrozenRecheckSeconds",
      "billingProviderRetrySeconds",
      "shopifyUsageRetryBaseSeconds",
      "shopifyUsageRetryMaxSeconds",
      "translationReconciliationPageSize",
      "translationClaimTimeoutSeconds",
      "translationSubmitRetrySeconds",
      "translationInitialPollSeconds",
      "translationPollIntervalSeconds",
      "translationResultRetrySeconds",
      "translationSubmitMaxAttempts",
      "translationMaxAutoRetries",
      "checkoutQueueGlobalConcurrency",
      "orderQueueGlobalConcurrency",
      "pendingRecoveryQueueGlobalConcurrency",
      "recoveryResumeQueueGlobalConcurrency",
      "whatsappQueueGlobalConcurrency",
      "merchantCommunicationsQueueGlobalConcurrency",
      "billingSubscriptionQueueGlobalConcurrency",
    ],
    ABUSE_PROTECTION: [
      "rawSenderLimitPerMinute",
      "rawGlobalLimitPerMinute",
      "turnSenderLimitPerMinute",
      "turnSenderLimitPerTenMinutes",
      "turnConversationLimitPerMinute",
      "turnConversationLimitPerTenMinutes",
      "turnShopLimitPerMinute",
      "turnGlobalLimitPerMinute",
      "discoverySenderLimitPerMinute",
      "discoverySenderLimitPerTenMinutes",
      "discoveryConversationLimitPerMinute",
      "discoveryConversationLimitPerTenMinutes",
    ],
  };
  return fieldSections[section].includes(key);
}
