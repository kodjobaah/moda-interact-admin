"use server";

import {
  BillingAuditAction,
  BillingPlanFeatureIdentifier,
  BillingPlanKind,
  MerchantPricingPlanKind,
  Prisma,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ensureDevelopmentPlatformAdmin } from "@/lib/auth/development-platform-admin";
import { requirePlatformAdminMutation } from "@/lib/auth/platform-admin";
import { prisma } from "@/lib/prisma";
import { validateShopifySubscriptionContract } from "@/lib/admin/shopify-subscription-contract";

const FEATURE_VALUES = Object.values(BillingPlanFeatureIdentifier);

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
function requiredInteger(formData: FormData, name: string, label: string): number {
  const raw = requiredString(formData, name, label);
  if (!/^\d+$/.test(raw)) actionError(`${label} must be a whole number.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) actionError(`${label} must be a safe whole number.`);
  return value;
}
function selectedFeatures(formData: FormData): BillingPlanFeatureIdentifier[] {
  const features = formData.getAll("features").map((value) => {
    if (typeof value !== "string" || !FEATURE_VALUES.includes(value as BillingPlanFeatureIdentifier)) {
      actionError("One or more billing-plan features are invalid.");
    }
    return value as BillingPlanFeatureIdentifier;
  });
  return [...new Set(features)];
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
  shopifyRecoveryCreditPackEventHandle: string | null; defaultOutboundSoftLimit: number;
  defaultOutboundHardLimit: number; terminalMessageReservedSlots: number;
  features: Array<{ feature: BillingPlanFeatureIdentifier; enabled: boolean }>;
}) {
  return {
    id: plan.id, shopifyPlanHandle: plan.shopifyPlanHandle, name: plan.name, kind: plan.kind,
    active: plan.active, shopifyUsageEventHandle: plan.shopifyUsageEventHandle,
    includedRecoveryConversationAllowance: plan.includedRecoveryConversationAllowance,
    recoveryCreditPackEnabled: plan.recoveryCreditPackEnabled,
    recoveryCreditsPerPack: plan.recoveryCreditsPerPack,
    shopifyRecoveryCreditPackEventHandle: plan.shopifyRecoveryCreditPackEventHandle,
    defaultOutboundSoftLimit: plan.defaultOutboundSoftLimit,
    defaultOutboundHardLimit: plan.defaultOutboundHardLimit,
    terminalMessageReservedSlots: plan.terminalMessageReservedSlots,
    features: plan.features.filter((item) => item.enabled).map((item) => item.feature).sort(),
  };
}

const catalogueContractSelect = {
  id: true, shopifyPlanHandle: true, displayName: true, planKind: true, isActive: true,
  includedRecoveryCredits: true, recurringAmountMinor: true, currency: true, billingPeriod: true,
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
  const defaultOutboundSoftLimit = requiredInteger(formData, "defaultOutboundSoftLimit", "Default outbound soft limit");
  const defaultOutboundHardLimit = requiredInteger(formData, "defaultOutboundHardLimit", "Default outbound hard limit");
  const terminalMessageReservedSlots = requiredInteger(formData, "terminalMessageReservedSlots", "Terminal message reserved slots");
  const features = selectedFeatures(formData);
  const returnTo = safeReturnTo(formData.get("returnTo"));
  if (defaultOutboundSoftLimit <= 0 || defaultOutboundHardLimit <= 0) actionError("Outbound limits must be positive whole numbers.");
  if (defaultOutboundSoftLimit >= defaultOutboundHardLimit) actionError("The default outbound soft limit must be below the hard limit.");
  if (terminalMessageReservedSlots < 1) actionError("At least one terminal message slot must be reserved.");

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
  if (contract.status !== "VERIFIED") {
    actionError(
      contract.status === "UNAVAILABLE"
        ? `Shopify contract validation is unavailable: ${contract.mismatches.join(" ")}`
        : `Shopify subscription does not match the MerchantPricing plan: ${contract.mismatches.join(" ")}`,
    );
  }

  const rawUsageEventHandle = formData.get("shopifyUsageEventHandle");
  const requestedUsageEventHandle =
    typeof rawUsageEventHandle === "string" && rawUsageEventHandle.trim() ? rawUsageEventHandle.trim() : null;
  const verifiedUsageHandles = preflightCatalogue.usageEvents.map((event) => event.eventHandle);
  if (verifiedUsageHandles.length && !requestedUsageEventHandle) {
    actionError("Choose the primary operational Shopify usage-event handle.");
  }
  if (requestedUsageEventHandle && !verifiedUsageHandles.includes(requestedUsageEventHandle)) {
    actionError("The selected usage-event handle is not part of the verified MerchantPricing/Shopify contract.");
  }
  if (!verifiedUsageHandles.length && requestedUsageEventHandle) {
    actionError("This verified Shopify contract has no catalogue usage meter to map operationally.");
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

    const platformPolicy = await transaction.platformBillingPolicy.findUnique({ where: { id: "default" }, select: { absoluteOutboundHardLimit: true } });
    const effectiveHardLimit = Math.min(defaultOutboundHardLimit, platformPolicy?.absoluteOutboundHardLimit ?? defaultOutboundHardLimit);
    if (terminalMessageReservedSlots >= effectiveHardLimit) actionError("Terminal message reserved slots must be lower than the effective outbound hard limit.");

    const before = await transaction.billingPlan.findUnique({ where: { shopifyPlanHandle: observedHandle }, include: { features: true } });
    const kind = expectedKind(cataloguePlan.planKind);
    const after = await transaction.billingPlan.upsert({
      where: { shopifyPlanHandle: observedHandle },
      create: {
        shopifyPlanHandle: observedHandle, name: cataloguePlan.displayName, kind, active: true,
        shopifyUsageEventHandle: requestedUsageEventHandle,
        includedRecoveryConversationAllowance: expectedAllowance(cataloguePlan.planKind, cataloguePlan.includedRecoveryCredits),
        recoveryCreditPackEnabled: false, recoveryCreditsPerPack: null, shopifyRecoveryCreditPackEventHandle: null,
        defaultOutboundSoftLimit, defaultOutboundHardLimit, terminalMessageReservedSlots,
        features: { create: features.map((feature) => ({ feature, enabled: true })) },
      },
      update: {
        name: cataloguePlan.displayName, kind, active: true, shopifyUsageEventHandle: requestedUsageEventHandle,
        includedRecoveryConversationAllowance: expectedAllowance(cataloguePlan.planKind, cataloguePlan.includedRecoveryCredits),
        defaultOutboundSoftLimit, defaultOutboundHardLimit, terminalMessageReservedSlots,
        features: { deleteMany: {}, create: features.map((feature) => ({ feature, enabled: true })) },
      },
      include: { features: true },
    });

    await transaction.subscription.update({ where: { id: subscription.id }, data: { nextReconcileAt: new Date() } });
    await transaction.billingAuditEvent.create({
      data: {
        action: BillingAuditAction.BILLING_CORRECTION_CREATED, shopId: subscription.shopId,
        platformAdminId: durableAdmin.id, reason, relatedEntityType: "SubscriptionBillingPlanMapping", relatedEntityId: subscription.id,
        beforeValue: before ? (billingPlanSnapshot(before) as Prisma.InputJsonValue) : Prisma.JsonNull,
        afterValue: {
          subscriptionId: subscription.id, providerSubscriptionId: subscription.providerSubscriptionId,
          observedShopifyPlanHandle: observedHandle, previousSyncErrorCode: subscription.lastSyncErrorCode,
          merchantPricingPlanId: cataloguePlan.id, billingPlan: billingPlanSnapshot(after),
          shopifyContractValidation: contract, reconciliationRequired: true,
        } as Prisma.InputJsonValue,
      },
    });
  }, { maxWait: 10_000, timeout: 20_000 });

  revalidatePath("/billing");
  revalidatePath("/");
  const separator = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${separator}mappingResolved=1`);
}
