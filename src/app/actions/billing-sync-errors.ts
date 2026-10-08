"use server";

import { BillingAuditAction, Prisma, SubscriptionProjectionStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ensureDevelopmentPlatformAdmin } from "@/lib/auth/development-platform-admin";
import { requirePlatformAdminMutation } from "@/lib/auth/platform-admin";
import { resolveDeploymentEnvironmentName } from "@/lib/auth/environment";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@modainteract/moda-interact-shared/logging";
import { canRequestBillingSyncReconciliation } from "@/lib/admin/billing-sync-errors";

const logger = createLogger({
  serviceNamespace: "moda-interact",
  serviceName: "moda-interact-admin",
  environment: resolveDeploymentEnvironmentName(),
});

function requiredString(formData: FormData, key: string, label: string): string {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

function safeReturnTo(value: FormDataEntryValue | null): string {
  if (typeof value !== "string" || !value.startsWith("/billing")) {
    return "/billing?view=sync-errors";
  }
  return value;
}

export async function requestBillingSyncReconciliationAction(
  formData: FormData,
): Promise<void> {
  const principal = await requirePlatformAdminMutation();
  if (principal.role !== "SUPER_ADMIN") {
    throw new Error("SUPER_ADMIN access is required to request billing reconciliation.");
  }

  const subscriptionId = requiredString(formData, "subscriptionId", "Subscription id");
  const expectedErrorCode = requiredString(formData, "expectedErrorCode", "Expected sync error code");
  const reason = requiredString(formData, "reason", "Reconciliation reason");
  if (reason.length > 1000) {
    throw new Error("Reconciliation reason must be at most 1000 characters.");
  }
  const returnTo = safeReturnTo(formData.get("returnTo"));
  const requestedAt = new Date();

  await prisma.$transaction(async (transaction) => {
    await ensureDevelopmentPlatformAdmin(transaction, principal);
    const durableAdmin = await transaction.platformAdmin.findUnique({
      where: { id: principal.id },
      select: { id: true, active: true, role: true },
    });
    if (!durableAdmin || !durableAdmin.active || durableAdmin.role !== "SUPER_ADMIN") {
      throw new Error("A current SUPER_ADMIN approval is required.");
    }

    const subscription = await transaction.subscription.findUnique({
      where: { id: subscriptionId },
      select: {
        id: true,
        shopId: true,
        status: true,
        lastSyncErrorCode: true,
        lastSyncErrorAt: true,
        lastSyncedAt: true,
        nextReconcileAt: true,
        observedShopifyPlanHandle: true,
        planId: true,
        pendingPlanId: true,
        pendingShopifyPlanHandle: true,
        pendingEffectiveAt: true,
      },
    });
    if (!subscription || subscription.status !== SubscriptionProjectionStatus.SYNC_ERROR) {
      throw new Error("This subscription is no longer in SYNC_ERROR. Reload Billing.");
    }
    if ((subscription.lastSyncErrorCode ?? "UNKNOWN") !== expectedErrorCode) {
      throw new Error("The subscription sync error changed. Reload Billing before retrying.");
    }
    const retryableError = canRequestBillingSyncReconciliation({
      errorCode: expectedErrorCode,
      planId: subscription.planId,
      pendingPlanId: subscription.pendingPlanId,
      pendingShopifyPlanHandle: subscription.pendingShopifyPlanHandle,
      pendingEffectiveAt: subscription.pendingEffectiveAt,
    });
    if (!retryableError) {
      throw new Error(
        "This sync error cannot be safely retried through subscription reconciliation. Review and correct the underlying billing state first.",
      );
    }

    await transaction.subscription.update({
      where: { id: subscription.id },
      data: { nextReconcileAt: requestedAt },
    });

    await transaction.billingAuditEvent.create({
      data: {
        action: BillingAuditAction.BILLING_CORRECTION_CREATED,
        shopId: subscription.shopId,
        platformAdminId: durableAdmin.id,
        reason,
        relatedEntityType: "SubscriptionSyncReconciliationRequest",
        relatedEntityId: subscription.id,
        beforeValue: {
          status: subscription.status,
          lastSyncErrorCode: subscription.lastSyncErrorCode,
          lastSyncErrorAt: subscription.lastSyncErrorAt?.toISOString() ?? null,
          lastSyncedAt: subscription.lastSyncedAt?.toISOString() ?? null,
          nextReconcileAt: subscription.nextReconcileAt?.toISOString() ?? null,
          observedShopifyPlanHandle: subscription.observedShopifyPlanHandle,
          planId: subscription.planId,
          pendingPlanId: subscription.pendingPlanId,
        } as Prisma.InputJsonValue,
        afterValue: {
          status: subscription.status,
          lastSyncErrorCode: subscription.lastSyncErrorCode,
          nextReconcileAt: requestedAt.toISOString(),
          reconciliationRequested: true,
        } as Prisma.InputJsonValue,
      },
    });
  }, { maxWait: 10_000, timeout: 20_000 });

  logger.info("admin.billing.sync_error_reconciliation_requested", {
    subscriptionId,
    errorCode: expectedErrorCode,
    requestedAt: requestedAt.toISOString(),
  });

  revalidatePath("/billing");
  revalidatePath("/");
  const separator = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${separator}syncReconcileRequested=1`);
}
