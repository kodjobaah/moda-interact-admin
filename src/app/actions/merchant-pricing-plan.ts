"use server";

import {
  MerchantPricingAllowancePeriod,
  MerchantPricingBillingPeriod,
  MerchantPricingPlanKind,
  MerchantPricingUsagePricingMode,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requirePlatformAdminMutation } from "@/lib/auth/platform-admin";
import { prisma } from "@/lib/prisma";
import {
  MerchantPricingPayloadError,
  parseMerchantPricingBuilderPayload,
  type MerchantPricingBuilderEvent,
  type MerchantPricingBuilderPayload,
  projectMerchantPricingCatalogueOrder,
} from "@/lib/admin/merchant-pricing-builder-payload";
import {
  assertMerchantPricingPortfolioPass,
  evaluateMerchantPricingPortfolio,
  type MerchantPricingEconomicsPlan,
} from "@/lib/admin/merchant-pricing-economics";
import {
  merchantPricingDescription,
  toMerchantPricingEconomicsPlan,
  type MerchantPricingPlanWithChildren,
} from "@/lib/admin/merchant-pricing-plan";
import { parseCompletedMerchantPricingTranslationPackage } from "@/lib/admin/merchant-pricing-translations";

const merchantPricingInclude = {
  translations: true,
  usageEvents: { include: { tiers: true } },
};

function actionError(message: string): never {
  throw new Error(message);
}

async function auditAdminId(
  principal: Awaited<ReturnType<typeof requirePlatformAdminMutation>>,
): Promise<string> {
  if (!principal.developmentBypass) return principal.id;
  const developmentAdmin = await prisma.platformAdmin.findFirst({
    where: { active: true, role: "SUPER_ADMIN" },
    select: { id: true },
  });
  return (
    developmentAdmin?.id ??
    actionError(
      "A provisioned SUPER_ADMIN is required before billing mutations can be audited.",
    )
  );
}

function eventData(
  event: MerchantPricingBuilderEvent,
  position: number,
  currency: string,
) {
  return {
    eventHandle: event.eventHandle,
    adminLabel: event.adminLabel,
    creditsGrantedPerUnit: event.creditsGrantedPerUnit,
    position,
    pricingMode: event.pricingMode as MerchantPricingUsagePricingMode,
    currency,
    fixedUnitAmountMinor:
      event.pricingMode === "FIXED" ? event.fixedUnitAmountMinor : null,
    maximumUnitsPerBillingPeriod: event.maximumUnitsPerBillingPeriod,
    tiers:
      event.pricingMode === "FIXED"
        ? undefined
        : {
            create: (event.tiers ?? []).map((tier, tierPosition) => ({
              upTo: tier.upTo,
              amountPerUnitMinor: tier.amountPerUnitMinor ?? 0,
              flatAmountMinor: tier.flatAmountMinor ?? 0,
              position: tierPosition,
            })),
          },
  };
}

function candidateFromPayload(
  payload: MerchantPricingBuilderPayload,
  id: string,
): MerchantPricingEconomicsPlan {
  return {
    id,
    shopifyPlanHandle: payload.shopifyPlanHandle,
    name: payload.name,
    includedRecoveryCredits: payload.includedRecoveryCredits,
    recurringAmountMinor: payload.recurringAmountMinor,
    currency: payload.currency,
    usageEvents: payload.usageEvents.map((event) => ({
      eventHandle: event.eventHandle,
      creditsGrantedPerUnit: event.creditsGrantedPerUnit,
      maximumUnitsPerBillingPeriod: event.maximumUnitsPerBillingPeriod,
      pricing:
        event.pricingMode === "FIXED"
          ? {
              mode: "FIXED",
              currency: payload.currency,
              unitAmountMinor: event.fixedUnitAmountMinor ?? 0,
            }
          : {
              mode: event.pricingMode,
              currency: payload.currency,
              tiers: (event.tiers ?? []).map((tier) => ({
                upTo: tier.upTo,
                amountPerUnitMinor: tier.amountPerUnitMinor ?? 0,
                flatAmountMinor: tier.flatAmountMinor ?? 0,
              })),
            },
    })),
  };
}

function validateTranslation(
  rawTranslation: string,
  payload: MerchantPricingBuilderPayload,
): ReturnType<typeof parseCompletedMerchantPricingTranslationPackage> {
  return parseCompletedMerchantPricingTranslationPackage(rawTranslation, {
    planHandle: payload.shopifyPlanHandle,
    planName: payload.name,
    englishDescription: payload.englishDescription,
  });
}

function assertTranslation(
  rawTranslation: string,
  payload: MerchantPricingBuilderPayload,
) {
  const parsed = validateTranslation(rawTranslation, payload);
  if (!parsed.valid || !parsed.package) {
    throw new Error(
      parsed.issues
        .map((entry) => `${entry.path}: ${entry.message}`)
        .join("; "),
    );
  }
  return parsed.package;
}

function projectedPortfolio(
  rows: MerchantPricingPlanWithChildren[],
  proposed: MerchantPricingEconomicsPlan,
  proposedPosition: number,
  minimumUpgradePremiumBps: number,
  isCreate: boolean,
): void {
  const projectedIds = projectMerchantPricingCatalogueOrder(
    rows.map((row) => row.id),
    proposed.id,
    proposedPosition,
    isCreate ? undefined : proposed.id,
  );
  const plansByCatalogueId = new Map(
    rows.map((row) => [row.id, toMerchantPricingEconomicsPlan(row)]),
  );
  plansByCatalogueId.set(proposed.id, proposed);
  const ordered = projectedIds
    .map((id) => ({ row: rows.find((candidate) => candidate.id === id), id }))
    .filter(({ row, id }) => id === proposed.id || row?.isActive)
    .map(({ id }) => ({ plan: plansByCatalogueId.get(id)! }));
  const plansById = Object.fromEntries(
    ordered.map(({ plan }) => [plan.id, plan]),
  );
  const results = evaluateMerchantPricingPortfolio({
    orderedPlanIds: ordered.map(({ plan }) => plan.id),
    plansById,
    minimumUpgradePremiumBps,
  });
  assertMerchantPricingPortfolioPass(results);
}

function placementIndex(
  placement: MerchantPricingBuilderPayload["placement"],
  rows: MerchantPricingPlanWithChildren[],
): number {
  if (placement === "ONLY") {
    if (rows.length)
      actionError("ONLY placement is valid only for an empty catalogue.");
    return 0;
  }
  if (placement.startsWith("BEFORE:")) {
    const target = placement.slice("BEFORE:".length);
    if (rows[0]?.id !== target)
      actionError(
        "BEFORE placement target is stale or is not the current first plan.",
      );
    return 0;
  }
  if (placement.startsWith("AFTER:")) {
    const target = placement.slice("AFTER:".length);
    const index = rows.findIndex((row) => row.id === target);
    if (index < 0) actionError("AFTER placement target is stale or missing.");
    return index + 1;
  }
  actionError("A valid catalogue placement is required.");
}

function parsePayload(formData: FormData): MerchantPricingBuilderPayload {
  const raw = formData.get("payload");
  if (typeof raw !== "string")
    actionError("A MerchantPricing builder payload is required.");
  try {
    return parseMerchantPricingBuilderPayload(raw);
  } catch (error) {
    if (error instanceof MerchantPricingPayloadError)
      actionError(error.message);
    throw error;
  }
}

export async function mutateMerchantPricingPlanAction(
  formData: FormData,
): Promise<void> {
  const principal = await requirePlatformAdminMutation();
  if (principal.role !== "SUPER_ADMIN")
    actionError("SUPER_ADMIN access is required.");
  const intent = formData.get("intent");
  const adminId = await auditAdminId(principal);

  if (intent === "toggle") {
    const id = formData.get("id");
    const reason = formData.get("reason");
    if (typeof id !== "string" || !id)
      actionError("A MerchantPricing plan id is required.");
    if (
      typeof reason !== "string" ||
      !reason.trim() ||
      reason.trim().length > 2000
    )
      actionError("A reason is required and must be at most 2000 characters.");
    await prisma.$transaction(async (transaction) => {
      const existing = await transaction.merchantPricingPlan.findUnique({
        where: { id },
        include: merchantPricingInclude,
      });
      if (!existing) actionError("MerchantPricing plan not found.");
      if (!existing.isActive) {
        const rows = await transaction.merchantPricingPlan.findMany({
          include: merchantPricingInclude,
          orderBy: { cataloguePosition: "asc" },
        });
        const policy = await transaction.platformBillingPolicy.findUnique({
          where: { id: "default" },
          select: { minimumUpgradePremiumBps: true },
        });
        projectedPortfolio(
          rows,
          toMerchantPricingEconomicsPlan(
            existing as MerchantPricingPlanWithChildren,
          ),
          existing.cataloguePosition,
          policy?.minimumUpgradePremiumBps ?? 2000,
          false,
        );
      }
      const updated = await transaction.merchantPricingPlan.update({
        where: { id },
        data: { isActive: !existing.isActive },
      });
      await transaction.billingAuditEvent.create({
        data: {
          action: "PLAN_CATALOG_CHANGED",
          platformAdminId: adminId,
          reason: reason.trim(),
          relatedEntityType: "MerchantPricingPlan",
          relatedEntityId: updated.id,
        },
      });
    });
    revalidatePath("/billing");
    return;
  }

  const payload = parsePayload(formData);
  const rawTranslation = formData.get("translationJson");
  if (typeof rawTranslation !== "string")
    actionError("A completed translation package is required.");
  await prisma.$transaction(async (transaction) => {
    const rows = await transaction.merchantPricingPlan.findMany({
      include: merchantPricingInclude,
      orderBy: { cataloguePosition: "asc" },
    });
    const existing = payload.id
      ? rows.find((row) => row.id === payload.id)
      : null;
    if (payload.id && !existing) actionError("MerchantPricing plan not found.");
    if (
      !existing &&
      rows.some((row) => row.shopifyPlanHandle === payload.shopifyPlanHandle)
    )
      actionError("A plan with this Shopify handle already exists.");
    if (existing && existing.shopifyPlanHandle !== payload.shopifyPlanHandle)
      actionError("Shopify plan handles are immutable.");
    const isCreate = !existing;
    const position = isCreate
      ? placementIndex(payload.placement, rows)
      : existing.cataloguePosition;
    const descriptionChanged =
      isCreate ||
      merchantPricingDescription(existing) !== payload.englishDescription;
    const translations = descriptionChanged
      ? assertTranslation(rawTranslation, payload)
      : null;
    const policy = await transaction.platformBillingPolicy.findUnique({
      where: { id: "default" },
      select: { minimumUpgradePremiumBps: true },
    });
    projectedPortfolio(
      rows,
      candidateFromPayload(
        payload,
        existing?.id ?? `candidate:${payload.shopifyPlanHandle}`,
      ),
      position,
      policy?.minimumUpgradePremiumBps ?? 2000,
      isCreate,
    );

    if (isCreate) {
      for (const row of [...rows]
        .reverse()
        .filter((row) => row.cataloguePosition >= position)) {
        await transaction.merchantPricingPlan.update({
          where: { id: row.id },
          data: { cataloguePosition: row.cataloguePosition + 1 },
        });
      }
      const created = await transaction.merchantPricingPlan.create({
        data: {
          shopifyPlanHandle: payload.shopifyPlanHandle,
          displayName: payload.name,
          planKind: payload.planKind as MerchantPricingPlanKind,
          isActive: payload.isActive,
          cataloguePosition: position,
          featured: payload.featured,
          includedRecoveryCredits: payload.includedRecoveryCredits,
          allowancePeriod:
            payload.allowancePeriod as MerchantPricingAllowancePeriod,
          billingPeriod: MerchantPricingBillingPeriod.EVERY_30_DAYS,
          recurringAmountMinor: payload.recurringAmountMinor,
          currency: payload.currency,
          translations: {
            create: Object.entries(translations!.translations).map(
              ([locale, value]) => ({
                locale,
                merchantDescription: value.description,
              }),
            ),
          },
          usageEvents: {
            create: payload.usageEvents.map((event, eventPosition) =>
              eventData(event, eventPosition, payload.currency),
            ),
          },
        },
      });
      await transaction.billingAuditEvent.create({
        data: {
          action: "PLAN_CATALOG_CHANGED",
          platformAdminId: adminId,
          reason: payload.reason,
          relatedEntityType: "MerchantPricingPlan",
          relatedEntityId: created.id,
        },
      });
    } else {
      await transaction.merchantPricingPlan.update({
        where: { id: existing.id },
        data: {
          displayName: payload.name,
          planKind: payload.planKind as MerchantPricingPlanKind,
          isActive: payload.isActive,
          featured: payload.featured,
          includedRecoveryCredits: payload.includedRecoveryCredits,
          allowancePeriod:
            payload.allowancePeriod as MerchantPricingAllowancePeriod,
          billingPeriod: MerchantPricingBillingPeriod.EVERY_30_DAYS,
          recurringAmountMinor: payload.recurringAmountMinor,
          currency: payload.currency,
          ...(translations
            ? {
                translations: {
                  deleteMany: {},
                  create: Object.entries(translations.translations).map(
                    ([locale, value]) => ({
                      locale,
                      merchantDescription: value.description,
                    }),
                  ),
                },
              }
            : {}),
          usageEvents: {
            deleteMany: {},
            create: payload.usageEvents.map((event, eventPosition) =>
              eventData(event, eventPosition, payload.currency),
            ),
          },
        },
      });
      await transaction.billingAuditEvent.create({
        data: {
          action: "PLAN_CATALOG_CHANGED",
          platformAdminId: adminId,
          reason: payload.reason,
          relatedEntityType: "MerchantPricingPlan",
          relatedEntityId: existing.id,
        },
      });
    }
  });
  revalidatePath("/billing");
}
