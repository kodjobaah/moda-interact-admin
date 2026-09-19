"use server";

import {
  BillingAuditAction,
  BillingPlanKind,
  MerchantPricingPlanKind,
  Prisma,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ensureDevelopmentPlatformAdmin } from "@/lib/auth/development-platform-admin";
import {
  requirePlatformAdminMutation,
  requirePlatformAdminRead,
} from "@/lib/auth/platform-admin";
import { prisma } from "@/lib/prisma";
import { resolveDeploymentEnvironmentName } from "@/lib/auth/environment";
import { createLogger } from "@modainteract/moda-interact-shared/logging";
import { validateShopifySubscriptionContract } from "@/lib/admin/shopify-subscription-contract";


const reconciliationLogger = createLogger({
  serviceNamespace: "moda-interact",
  serviceName: "moda-interact-admin",
  environment: resolveDeploymentEnvironmentName(),
});

function logReconciliationDebug(
  event: string,
  data: Record<string, unknown>,
): void {
  reconciliationLogger.info(event, data);
}

export type BillingReconciliationDebugStatus = {
  found: boolean;
  subscriptionId: string;
  status: string | null;
  observedShopifyPlanHandle: string | null;
  planId: string | null;
  mappedPlanHandle: string | null;
  nextReconcileAt: string | null;
  lastSyncedAt: string | null;
  lastSyncErrorCode: string | null;
  lastSyncErrorAt: string | null;
  updatedAt: string | null;
};

export async function getBillingReconciliationDebugStatusAction(
  subscriptionId: string,
): Promise<BillingReconciliationDebugStatus> {
  await requirePlatformAdminRead();

  const row = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    select: {
      id: true,
      status: true,
      observedShopifyPlanHandle: true,
      planId: true,
      nextReconcileAt: true,
      lastSyncedAt: true,
      lastSyncErrorCode: true,
      lastSyncErrorAt: true,
      updatedAt: true,
      plan: { select: { shopifyPlanHandle: true } },
    },
  });

  const status: BillingReconciliationDebugStatus = row
    ? {
        found: true,
        subscriptionId: row.id,
        status: row.status,
        observedShopifyPlanHandle: row.observedShopifyPlanHandle,
        planId: row.planId,
        mappedPlanHandle: row.plan?.shopifyPlanHandle ?? null,
        nextReconcileAt: row.nextReconcileAt?.toISOString() ?? null,
        lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
        lastSyncErrorCode: row.lastSyncErrorCode,
        lastSyncErrorAt: row.lastSyncErrorAt?.toISOString() ?? null,
        updatedAt: row.updatedAt.toISOString(),
      }
    : {
        found: false,
        subscriptionId,
        status: null,
        observedShopifyPlanHandle: null,
        planId: null,
        mappedPlanHandle: null,
        nextReconcileAt: null,
        lastSyncedAt: null,
        lastSyncErrorCode: null,
        lastSyncErrorAt: null,
        updatedAt: null,
      };

  logReconciliationDebug("admin.billing.reconciliation_status_polled", status);
  return status;
}

function actionError(message: string): never { throw new Error(message); }
function safeReturnTo(value: FormDataEntryValue | null): string {
  return typeof value === "string" && value.startsWith("/billing") && !value.startsWith("//")
    ? value
    : "/billing?view=unmapped";
}
function requiredString(formData: FormData, name: string, label: string): string {
  const value = formData.get(name);
  if (typeof value !== "string" || !value.trim()) actionError(`${label} is required.`);
  return value.trim();
}
function expectedKind(planKind: MerchantPricingPlanKind): BillingPlanKind {
  return planKind === MerchantPricingPlanKind.FREE ? BillingPlanKind.FREE : BillingPlanKind.PAID_METERED;
}
function expectedAllowance(planKind: MerchantPricingPlanKind, includedRecoveryCredits: number): number | null {
  return planKind === MerchantPricingPlanKind.PAID_METERED ? includedRecoveryCredits : null;
}
function billingPlanSnapshot(plan: {
  id: string; shopifyPlanHandle: string; name: string; kind: BillingPlanKind; active: boolean;
  shopifyUsageEventHandle: string | null; includedRecoveryConversationAllowance: number | null;
  recoveryCreditPackEnabled: boolean; recoveryCreditsPerPack: number | null;
  shopifyRecoveryCreditPackEventHandle: string | null;
  features: Array<{ featureId: string; enabled: boolean }>;
}) {
  return {
    id: plan.id, shopifyPlanHandle: plan.shopifyPlanHandle, name: plan.name, kind: plan.kind,
    active: plan.active, shopifyUsageEventHandle: plan.shopifyUsageEventHandle,
    includedRecoveryConversationAllowance: plan.includedRecoveryConversationAllowance,
    recoveryCreditPackEnabled: plan.recoveryCreditPackEnabled,
    recoveryCreditsPerPack: plan.recoveryCreditsPerPack,
    shopifyRecoveryCreditPackEventHandle: plan.shopifyRecoveryCreditPackEventHandle,
    features: plan.features.filter((item) => item.enabled).map((item) => item.featureId).sort(),
  };
}

const catalogueContractSelect = {
  id: true, shopifyPlanHandle: true, displayName: true, planKind: true, isActive: true,
  includedRecoveryCredits: true, recurringAmountMinor: true, currency: true, billingPeriod: true,
  shopifyRecoveryUsageEventHandle: true, materializedAt: true,
  features: { select: { featureId: true } },
  usageEvents: {
    orderBy: { position: "asc" as const },
    select: {
      eventHandle: true, pricingMode: true, currency: true, fixedUnitAmountMinor: true,
      tiers: { orderBy: { position: "asc" as const }, select: { upTo: true, amountPerUnitMinor: true, flatAmountMinor: true } },
    },
  },
} satisfies Prisma.MerchantPricingPlanSelect;

export async function resolveUnmappedSubscriptionAction(formData: FormData): Promise<void> {
  const principal = await requirePlatformAdminMutation();
  if (principal.role !== "SUPER_ADMIN") actionError("SUPER_ADMIN access is required to repair billing mappings.");

  const subscriptionId = requiredString(formData, "subscriptionId", "Subscription id");
  const reason = requiredString(formData, "reason", "Resolution reason");
  if (reason.length > 1000) actionError("Resolution reason must be at most 1000 characters.");
  const returnTo = safeReturnTo(formData.get("returnTo"));
  const monetaryMismatchOverrideRequested =
    formData.get("monetaryMismatchOverride") === "1";

  logReconciliationDebug("admin.billing.unmapped_resolution_started", {
    subscriptionId,
    adminId: principal.id,
    adminRole: principal.role,
    monetaryMismatchOverrideRequested,
  });

  // Provider validation is deliberately outside the DB transaction. Shopify is authoritative,
  // but a remote HTTP request must not hold an interactive PostgreSQL transaction open.
  const preflight = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    select: {
      id: true, status: true, observedShopifyPlanHandle: true,
      shop: { select: { shopifyShopId: true } },
    },
  });
  if (!preflight || preflight.status !== "UNMAPPED") actionError("This subscription is no longer UNMAPPED.");
  logReconciliationDebug("admin.billing.unmapped_preflight_loaded", {
    subscriptionId,
    status: preflight.status,
    observedShopifyPlanHandle: preflight.observedShopifyPlanHandle,
    hasShopifyShopId: Boolean(preflight.shop.shopifyShopId),
  });
  const observedHandle = preflight.observedShopifyPlanHandle?.trim();
  if (!observedHandle) actionError("Shopify has not supplied an observed plan handle.");

  const preflightCatalogue = await prisma.merchantPricingPlan.findUnique({
    where: { shopifyPlanHandle: observedHandle }, select: catalogueContractSelect,
  });
  if (!preflightCatalogue) actionError(`No MerchantPricing catalogue plan exists for Shopify handle "${observedHandle}".`);
  if (!preflightCatalogue.isActive) actionError(`The matching MerchantPricing plan "${observedHandle}" is inactive.`);

  const contract = await validateShopifySubscriptionContract({
    shopifyShopId: preflight.shop.shopifyShopId,
    plan: preflightCatalogue,
  });
  logReconciliationDebug("admin.billing.shopify_contract_validated", {
    subscriptionId,
    observedShopifyPlanHandle: observedHandle,
    cataloguePlanId: preflightCatalogue.id,
    cataloguePlanKind: preflightCatalogue.planKind,
    validationStatus: contract.status,
    mismatchCount: contract.mismatches.length,
    mismatches: contract.mismatches,
  });
  if (contract.status === "UNAVAILABLE") {
    actionError(
      `Shopify contract validation is unavailable: ${contract.mismatches.join(" ")}`,
    );
  }
  if (contract.status === "MISMATCH") {
    actionError(
      `Shopify subscription does not match the MerchantPricing plan: ${contract.mismatches.join(" ")}`,
    );
  }
  if (contract.status === "MONETARY_MISMATCH") {
    if (preflightCatalogue.planKind !== MerchantPricingPlanKind.PAID_METERED) {
      actionError("Only paid-tier monetary mismatches can be overridden.");
    }
    if (!monetaryMismatchOverrideRequested) {
      actionError(
        "The paid Shopify tier has a monetary mismatch. Confirm the monetary override before repairing this mapping.",
      );
    }
  } else if (monetaryMismatchOverrideRequested) {
    actionError(
      "A monetary override was supplied, but the current Shopify validation does not require one.",
    );
  }

  await prisma.$transaction(async (transaction) => {
    await ensureDevelopmentPlatformAdmin(transaction, principal);
    const durableAdmin = await transaction.platformAdmin.findUnique({ where: { id: principal.id }, select: { id: true, active: true, role: true } });
    if (!durableAdmin || !durableAdmin.active || durableAdmin.role !== "SUPER_ADMIN") actionError("A current SUPER_ADMIN approval is required.");

    const subscription = await transaction.subscription.findUnique({
      where: { id: subscriptionId },
      select: { id: true, shopId: true, status: true, observedShopifyPlanHandle: true, providerSubscriptionId: true, lastSyncErrorCode: true },
    });
    if (!subscription || subscription.status !== "UNMAPPED") actionError("This subscription changed while it was being reviewed. Reload the queue.");
    if (subscription.observedShopifyPlanHandle?.trim() !== observedHandle) actionError("The observed Shopify plan changed during validation. Reload and validate again.");

    const cataloguePlan = await transaction.merchantPricingPlan.findUnique({ where: { shopifyPlanHandle: observedHandle }, select: catalogueContractSelect });
    if (!cataloguePlan || !cataloguePlan.isActive) actionError("The matching MerchantPricing plan changed during validation. Reload and validate again.");
    if (JSON.stringify(cataloguePlan) !== JSON.stringify(preflightCatalogue)) actionError("The MerchantPricing contract changed during Shopify validation. Reload and validate again.");

    const before = await transaction.billingPlan.findUnique({ where: { shopifyPlanHandle: observedHandle }, include: { features: true } });
    const kind = expectedKind(cataloguePlan.planKind);
    const after = await transaction.billingPlan.upsert({
      where: { shopifyPlanHandle: observedHandle },
      create: {
        shopifyPlanHandle: observedHandle, name: cataloguePlan.displayName, kind, active: true,
        shopifyUsageEventHandle: cataloguePlan.shopifyRecoveryUsageEventHandle,
        includedRecoveryConversationAllowance: expectedAllowance(cataloguePlan.planKind, cataloguePlan.includedRecoveryCredits),
        recoveryCreditPackEnabled: false, recoveryCreditsPerPack: null, shopifyRecoveryCreditPackEventHandle: null,
        features: { create: cataloguePlan.features.map(({ featureId }) => ({ featureId, enabled: true })) },
      },
      update: {
        name: cataloguePlan.displayName, kind, shopifyUsageEventHandle: cataloguePlan.shopifyRecoveryUsageEventHandle,
        includedRecoveryConversationAllowance: expectedAllowance(cataloguePlan.planKind, cataloguePlan.includedRecoveryCredits),
        features: {
          deleteMany: {},
          create: cataloguePlan.features.map(({ featureId }) => ({ featureId, enabled: true })),
        },
      },
      include: { features: true },
    });

    logReconciliationDebug("admin.billing.operational_mapping_upserted", {
      subscriptionId: subscription.id,
      shopId: subscription.shopId,
      observedShopifyPlanHandle: observedHandle,
      billingPlanId: after.id,
      billingPlanKind: after.kind,
      billingPlanActive: after.active,
      shopifyUsageEventHandle: after.shopifyUsageEventHandle,
    });

    if (!cataloguePlan.materializedAt) {
      await transaction.merchantPricingPlan.update({
        where: { id: cataloguePlan.id },
        data: { materializedAt: new Date() },
      });
    }

    const reconciliationRequestedAt = new Date();
    await transaction.subscription.update({
      where: { id: subscription.id },
      data: { nextReconcileAt: reconciliationRequestedAt },
    });
    logReconciliationDebug("admin.billing.reconciliation_requested", {
      subscriptionId: subscription.id,
      shopId: subscription.shopId,
      observedShopifyPlanHandle: observedHandle,
      nextReconcileAt: reconciliationRequestedAt.toISOString(),
      previousSyncErrorCode: subscription.lastSyncErrorCode,
    });
    await transaction.billingAuditEvent.create({
      data: {
        action: BillingAuditAction.BILLING_CORRECTION_CREATED, shopId: subscription.shopId,
        platformAdminId: durableAdmin.id, reason, relatedEntityType: "SubscriptionBillingPlanMapping", relatedEntityId: subscription.id,
        beforeValue: before ? (billingPlanSnapshot(before) as Prisma.InputJsonValue) : Prisma.JsonNull,
        afterValue: {
          subscriptionId: subscription.id, providerSubscriptionId: subscription.providerSubscriptionId,
          observedShopifyPlanHandle: observedHandle, previousSyncErrorCode: subscription.lastSyncErrorCode,
          merchantPricingPlanId: cataloguePlan.id, billingPlan: billingPlanSnapshot(after),
          shopifyContractValidation: contract,
          monetaryMismatchOverrideApplied:
            contract.status === "MONETARY_MISMATCH",
          reconciliationRequired: true,
        } as Prisma.InputJsonValue,
      },
    });
  }, { maxWait: 10_000, timeout: 20_000 });

  logReconciliationDebug("admin.billing.unmapped_resolution_committed", {
    subscriptionId,
    observedShopifyPlanHandle: observedHandle,
    contractStatus: contract.status,
    monetaryMismatchOverrideApplied:
      contract.status === "MONETARY_MISMATCH",
  });

  revalidatePath("/billing");
  revalidatePath("/");
  const separator = returnTo.includes("?") ? "&" : "?";
  redirect(
    `${returnTo}${separator}mappingResolved=1&reconciliationDebugSubscriptionId=${encodeURIComponent(subscriptionId)}`,
  );
}
