"use server";

import {
  MerchantPricingAllowancePeriod,
  MerchantPricingBillingPeriod,
  MerchantPricingPlanKind,
  MerchantPricingUsagePricingMode,
  Prisma,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePlatformAdminMutation } from "@/lib/auth/platform-admin";
import {
  DEVELOPMENT_PLATFORM_ADMIN,
  ensureDevelopmentPlatformAdmin,
} from "@/lib/auth/development-platform-admin";
import { prisma } from "@/lib/prisma";
import {
  MerchantPricingPayloadError,
  parseMerchantPricingBuilderPayload,
  type MerchantPricingBuilderEvent,
  type MerchantPricingBuilderPayload,
  projectMerchantPricingCatalogueOrder,
} from "@/lib/admin/merchant/pricing-builder-payload";
import {
  evaluateMerchantPricingPortfolio,
  type MerchantPricingEconomicsPlan,
  type MerchantPricingPairResult,
} from "@/lib/admin/merchant/pricing-economics";
import { assessMerchantPricingEconomicsOverride } from "@/lib/admin/merchant/pricing-economics-override";
import { createMerchantPricingEconomicsOverrideFingerprint } from "@/lib/admin/merchant/pricing-economics-override.server";
import {
  merchantPricingDescription,
  toMerchantPricingEconomicsPlan,
  type MerchantPricingPlanWithChildren,
} from "@/lib/admin/merchant/pricing-plan";
import { parseCompletedMerchantPricingTranslationPackage } from "@/lib/admin/merchant/pricing-translations";

const merchantPricingInclude = {
  features: {
    include: { feature: true },
    orderBy: { featureId: "asc" as const },
  },
  translations: true,
  highlights: {
    orderBy: { position: "asc" as const },
    include: { translations: { orderBy: { locale: "asc" as const } } },
  },
  usageEvents: {
    orderBy: { position: "asc" as const },
    include: { tiers: { orderBy: { position: "asc" as const } } },
  },
};

const MERCHANT_PRICING_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 20_000,
} as const;

function actionError(message: string): never {
  throw new Error(message);
}

async function auditAdminId(
  principal: Awaited<ReturnType<typeof requirePlatformAdminMutation>>,
): Promise<string> {
  if (!principal.developmentBypass) return principal.id;
  return prisma.$transaction(async (transaction) => {
    await ensureDevelopmentPlatformAdmin(transaction, principal);
    const developmentAdmin = await transaction.platformAdmin.findUnique({
      where: { id: DEVELOPMENT_PLATFORM_ADMIN.id },
      select: { id: true },
    });
    return (
      developmentAdmin?.id ??
      actionError(
        "A provisioned SUPER_ADMIN is required before billing mutations can be audited.",
      )
    );
  });
}

type ProjectedMerchantPricingPortfolio = {
  orderedPlanIds: string[];
  plansById: Record<string, MerchantPricingEconomicsPlan>;
  results: MerchantPricingPairResult[];
};

type EconomicsOverrideState = {
  economicsOverrideEnabled: boolean;
  economicsOverrideReason: string | null;
  economicsOverrideApprovedAt: Date | null;
  economicsOverrideApprovedByAdminId: string | null;
  economicsOverrideFailureCodes: string[];
  economicsOverrideFingerprint: string | null;
};

type EconomicsOverrideRequest = {
  requested: boolean;
  reason: string;
};

function clearedEconomicsOverride(): EconomicsOverrideState {
  return {
    economicsOverrideEnabled: false,
    economicsOverrideReason: null,
    economicsOverrideApprovedAt: null,
    economicsOverrideApprovedByAdminId: null,
    economicsOverrideFailureCodes: [],
    economicsOverrideFingerprint: null,
  };
}

function economicsOverrideSnapshot(state: EconomicsOverrideState) {
  return {
    enabled: state.economicsOverrideEnabled,
    reason: state.economicsOverrideReason,
    approvedAt: state.economicsOverrideApprovedAt?.toISOString() ?? null,
    approvedByAdminId: state.economicsOverrideApprovedByAdminId,
    failureCodes: [...state.economicsOverrideFailureCodes].sort(),
    fingerprint: state.economicsOverrideFingerprint,
  };
}

function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((value, index) => value === b[index]);
}

function firstEconomicsFailureMessage(
  results: MerchantPricingPairResult[],
): string {
  return (
    results.find((result) => result.status !== "PASS")?.message ??
    "Portfolio economics validation failed."
  );
}

function parseEconomicsOverrideRequest(
  formData: FormData,
): EconomicsOverrideRequest {
  const requestedValue = formData.get("economicsOverrideRequested");
  if (
    requestedValue !== null &&
    requestedValue !== "true" &&
    requestedValue !== "false"
  ) {
    actionError("The economics override request is invalid.");
  }

  const reasonValue = formData.get("economicsOverrideReason");
  if (reasonValue !== null && typeof reasonValue !== "string") {
    actionError("The economics override reason is invalid.");
  }

  const reason = typeof reasonValue === "string" ? reasonValue.trim() : "";
  if (reason.length > 2000) {
    actionError(
      "The economics override reason must be at most 2000 characters.",
    );
  }

  return {
    requested: requestedValue === "true",
    reason,
  };
}

async function assertDurableSuperAdmin(
  transaction: Prisma.TransactionClient,
  principal: Awaited<ReturnType<typeof requirePlatformAdminMutation>>,
  adminId: string,
): Promise<void> {
  if (principal.developmentBypass) {
    await ensureDevelopmentPlatformAdmin(transaction, principal);
  }

  const durableAdmin = await transaction.platformAdmin.findUnique({
    where: { id: adminId },
    select: { active: true, role: true },
  });

  if (
    !durableAdmin ||
    !durableAdmin.active ||
    durableAdmin.role !== "SUPER_ADMIN"
  ) {
    actionError(
      "A current SUPER_ADMIN approval is required for an economics override.",
    );
  }
}

async function resolveEconomicsOverrideForSave({
  transaction,
  principal,
  adminId,
  request,
  projection,
  minimumUpgradePremiumBps,
}: {
  transaction: Prisma.TransactionClient;
  principal: Awaited<ReturnType<typeof requirePlatformAdminMutation>>;
  adminId: string;
  request: EconomicsOverrideRequest;
  projection: ProjectedMerchantPricingPortfolio;
  minimumUpgradePremiumBps: number;
}): Promise<EconomicsOverrideState> {
  const assessment = assessMerchantPricingEconomicsOverride(
    projection.results,
    false,
  );

  if (assessment.kind === "PASS") {
    if (request.requested) {
      actionError(
        "An economics override cannot be approved because the portfolio passes the current economics policy.",
      );
    }
    return clearedEconomicsOverride();
  }

  if (assessment.kind === "HARD_FAIL") {
    actionError(firstEconomicsFailureMessage(projection.results));
  }

  if (!request.requested) {
    actionError(
      "Portfolio economics requires an approved policy override before this plan can be saved.",
    );
  }

  if (!request.reason) {
    actionError("An economics override reason is required.");
  }

  await assertDurableSuperAdmin(transaction, principal, adminId);

  const approvedAt = new Date();
  return {
    economicsOverrideEnabled: true,
    economicsOverrideReason: request.reason,
    economicsOverrideApprovedAt: approvedAt,
    economicsOverrideApprovedByAdminId: adminId,
    economicsOverrideFailureCodes: assessment.failureCodes,
    economicsOverrideFingerprint:
      createMerchantPricingEconomicsOverrideFingerprint({
        orderedPlanIds: projection.orderedPlanIds,
        plansById: projection.plansById,
        minimumUpgradePremiumBps,
        failureCodes: assessment.failureCodes,
      }),
  };
}

function persistedOverrideMatchesProjection(
  existing: EconomicsOverrideState,
  projection: ProjectedMerchantPricingPortfolio,
  minimumUpgradePremiumBps: number,
): boolean {
  const assessment = assessMerchantPricingEconomicsOverride(
    projection.results,
    false,
  );
  if (assessment.kind !== "OVERRIDEABLE") return false;
  if (
    !existing.economicsOverrideEnabled ||
    !existing.economicsOverrideReason?.trim() ||
    !existing.economicsOverrideApprovedAt ||
    !existing.economicsOverrideApprovedByAdminId ||
    !existing.economicsOverrideFingerprint ||
    !sameStringSet(
      existing.economicsOverrideFailureCodes,
      assessment.failureCodes,
    )
  ) {
    return false;
  }

  const fingerprint = createMerchantPricingEconomicsOverrideFingerprint({
    orderedPlanIds: projection.orderedPlanIds,
    plansById: projection.plansById,
    minimumUpgradePremiumBps,
    failureCodes: assessment.failureCodes,
  });

  return existing.economicsOverrideFingerprint === fingerprint;
}

async function auditEconomicsOverrideChange(
  transaction: Prisma.TransactionClient,
  adminId: string,
  planId: string,
  beforeValue: ReturnType<typeof economicsOverrideSnapshot> | null,
  afterValue: ReturnType<typeof economicsOverrideSnapshot>,
): Promise<void> {
  const reason = afterValue.enabled
    ? (afterValue.reason ?? "Economics override approved.").slice(0, 1000)
    : "Economics override cleared because the authoritative portfolio passes the current policy.";

  await transaction.billingAuditEvent.create({
    data: {
      action: "UPGRADE_ECONOMICS_EVALUATED",
      platformAdminId: adminId,
      reason,
      ...(beforeValue ? { beforeValue } : {}),
      afterValue,
      relatedEntityType: "MerchantPricingPlan",
      relatedEntityId: planId,
    },
  });
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
    highlights: payload.highlights,
  });
}

function existingHighlightSources(existing: MerchantPricingPlanWithChildren) {
  return existing.highlights.map((highlight) => ({
    contentKey: highlight.contentKey,
    title:
      highlight.translations.find((translation) => translation.locale === "en")
        ?.merchantTitle ?? "",
    description:
      highlight.translations.find((translation) => translation.locale === "en")
        ?.merchantDescription ?? "",
  }));
}

function translatableContentChanged(
  existing: MerchantPricingPlanWithChildren,
  payload: MerchantPricingBuilderPayload,
): boolean {
  const previous = existingHighlightSources(existing);
  if (
    merchantPricingDescription(existing).trim() !==
    payload.englishDescription.trim()
  )
    return true;
  if (previous.length !== payload.highlights.length) return true;
  return payload.highlights.some((highlight) => {
    const old = previous.find(
      (candidate) => candidate.contentKey === highlight.contentKey,
    );
    return (
      !old ||
      old.title.trim() !== highlight.title.trim() ||
      old.description.trim() !== highlight.description.trim()
    );
  });
}

function usageEventsChanged(
  existing: MerchantPricingPlanWithChildren,
  payload: MerchantPricingBuilderPayload,
): boolean {
  if (existing.usageEvents.length !== payload.usageEvents.length) return true;

  return payload.usageEvents.some((event, eventPosition) => {
    const previous = existing.usageEvents[eventPosition];
    if (!previous) return true;

    if (
      previous.eventHandle !== event.eventHandle ||
      previous.adminLabel !== event.adminLabel ||
      previous.creditsGrantedPerUnit !== event.creditsGrantedPerUnit ||
      previous.maximumUnitsPerBillingPeriod !==
        event.maximumUnitsPerBillingPeriod ||
      previous.pricingMode !== event.pricingMode ||
      previous.currency !== payload.currency
    ) {
      return true;
    }

    if (event.pricingMode === "FIXED") {
      return (
        (previous.fixedUnitAmountMinor ?? 0) !==
        (event.fixedUnitAmountMinor ?? 0)
      );
    }

    if (previous.tiers.length !== (event.tiers ?? []).length) return true;

    return (event.tiers ?? []).some((tier, tierPosition) => {
      const previousTier = previous.tiers[tierPosition];
      return (
        !previousTier ||
        previousTier.upTo !== tier.upTo ||
        previousTier.amountPerUnitMinor !== (tier.amountPerUnitMinor ?? 0) ||
        previousTier.flatAmountMinor !== (tier.flatAmountMinor ?? 0)
      );
    });
  });
}

type MerchantPricingCatalogueRevisionRow = {
  id: string;
  cataloguePosition: number;
  updatedAt: Date;
};

function catalogueRevisionMatches(
  expected: MerchantPricingPlanWithChildren[],
  current: MerchantPricingCatalogueRevisionRow[],
): boolean {
  if (expected.length !== current.length) return false;

  return expected.every((row, index) => {
    const candidate = current[index];
    return (
      candidate?.id === row.id &&
      candidate.cataloguePosition === row.cataloguePosition &&
      candidate.updatedAt.getTime() === row.updatedAt.getTime()
    );
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
): ProjectedMerchantPricingPortfolio {
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
  const orderedPlanIds = ordered.map(({ plan }) => plan.id);
  const plansById = Object.fromEntries(
    ordered.map(({ plan }) => [plan.id, plan]),
  );

  return {
    orderedPlanIds,
    plansById,
    results: evaluateMerchantPricingPortfolio({
      orderedPlanIds,
      plansById,
      minimumUpgradePremiumBps,
    }),
  };
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

  if (intent === "delete") {
    const id = formData.get("id");

    if (typeof id !== "string" || !id) {
      actionError("A MerchantPricing plan id is required.");
    }

    await prisma.$transaction(
      async (transaction) => {
      const existing = await transaction.merchantPricingPlan.findUnique({
        where: { id },
        select: {
          id: true,
          displayName: true,
          planKind: true,
          isActive: true,
          materializedAt: true,
          cataloguePosition: true,
        },
      });

      if (!existing) {
        actionError("MerchantPricing plan not found.");
      }

      if (existing.materializedAt) {
        actionError(
          "This pricing plan has been materialised for operational billing and cannot be deleted. Deactivate it instead.",
        );
      }

      if (existing.planKind === MerchantPricingPlanKind.FREE) {
        actionError(
          "The FREE plan cannot be deleted. Edit or deactivate it instead.",
        );
      }

      if (existing.isActive) {
        actionError("Deactivate this pricing plan before deleting it.");
      }

      await transaction.merchantPricingPlan.delete({
        where: { id: existing.id },
      });

      await transaction.merchantPricingPlan.updateMany({
        where: {
          cataloguePosition: {
            gt: existing.cataloguePosition,
          },
        },
        data: {
          cataloguePosition: {
            decrement: 1,
          },
        },
      });

      await transaction.billingAuditEvent.create({
        data: {
          action: "PLAN_CATALOG_CHANGED",
          platformAdminId: adminId,
          reason: `Deleted MerchantPricing plan "${existing.displayName}" from catalogue`,
          relatedEntityType: "MerchantPricingPlan",
          relatedEntityId: existing.id,
        },
      });
      },
      MERCHANT_PRICING_TRANSACTION_OPTIONS,
    );

    revalidatePath("/billing");
    redirect("/billing?view=plans");
  }

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
    const toggleResult = await prisma.$transaction(
      async (transaction) => {
      const existing = await transaction.merchantPricingPlan.findUnique({
        where: { id },
        include: merchantPricingInclude,
      });
      if (!existing) actionError("MerchantPricing plan not found.");

      let overrideUpdate: EconomicsOverrideState | null = null;

      if (!existing.isActive) {
        const rows = await transaction.merchantPricingPlan.findMany({
          include: merchantPricingInclude,
          orderBy: { cataloguePosition: "asc" },
        });
        const policy = await transaction.platformBillingPolicy.findUnique({
          where: { id: "default" },
          select: { minimumUpgradePremiumBps: true },
        });
        const minimumUpgradePremiumBps =
          policy?.minimumUpgradePremiumBps ?? 2000;
        const projection = projectedPortfolio(
          rows,
          toMerchantPricingEconomicsPlan(
            existing as MerchantPricingPlanWithChildren,
          ),
          existing.cataloguePosition,
          minimumUpgradePremiumBps,
          false,
        );
        const assessment = assessMerchantPricingEconomicsOverride(
          projection.results,
          false,
        );

        if (assessment.kind === "HARD_FAIL") {
          return {
            validationError: firstEconomicsFailureMessage(projection.results),
          };
        }

        if (assessment.kind === "OVERRIDEABLE") {
          if (
            !persistedOverrideMatchesProjection(
              existing,
              projection,
              minimumUpgradePremiumBps,
            )
          ) {
            return {
              validationError:
                "This pricing plan requires a current economics override approval before it can be activated. Open the plan, review the economics exception, approve it again, and save.",
            };
          }
        } else if (existing.economicsOverrideEnabled) {
          overrideUpdate = clearedEconomicsOverride();
        }
      }

      const updated = await transaction.merchantPricingPlan.update({
        where: { id },
        data: {
          isActive: !existing.isActive,
          ...(overrideUpdate ?? {}),
        },
      });

      if (overrideUpdate) {
        await auditEconomicsOverrideChange(
          transaction,
          adminId,
          updated.id,
          economicsOverrideSnapshot(existing),
          economicsOverrideSnapshot(overrideUpdate),
        );
      }

      await transaction.billingAuditEvent.create({
        data: {
          action: "PLAN_CATALOG_CHANGED",
          platformAdminId: adminId,
          reason: reason.trim(),
          relatedEntityType: "MerchantPricingPlan",
          relatedEntityId: updated.id,
        },
      });
      },
      MERCHANT_PRICING_TRANSACTION_OPTIONS,
    );

    if (toggleResult?.validationError) {
      redirect(
        `/billing?view=plans&pricingError=${encodeURIComponent(
          toggleResult.validationError,
        )}`,
      );
    }
    revalidatePath("/billing");
    redirect("/billing?view=plans");
  }

  const payload = parsePayload(formData);
  const rawTranslation = formData.get("translationJson");
  const economicsOverrideRequest = parseEconomicsOverrideRequest(formData);

  // Load the expensive catalogue snapshot and perform deterministic validation
  // before opening the interactive transaction. The transaction below only
  // rechecks a lightweight revision and then performs the atomic writes.
  const rows = await prisma.merchantPricingPlan.findMany({
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
  ) {
    actionError(
      "A MerchantPricing plan with this Shopify handle already exists. Handles cannot be reused, including when the existing plan is inactive.",
    );
  }
  if (existing && existing.shopifyPlanHandle !== payload.shopifyPlanHandle) {
    actionError("Shopify plan handles are immutable.");
  }

  if (
    existing?.materializedAt &&
    existing.planKind !== payload.planKind
  ) {
    actionError(
      "The plan kind cannot be changed after this pricing plan has been materialised.",
    );
  }

  const isCreate = !existing;
  const existingFreePlan = rows.find(
    (row) => row.planKind === MerchantPricingPlanKind.FREE,
  );

  if (
    payload.planKind === "FREE" &&
    existingFreePlan &&
    existingFreePlan.id !== existing?.id
  ) {
    actionError("Only one FREE plan is allowed in the pricing catalogue.");
  }

  if (
    existing?.planKind === MerchantPricingPlanKind.FREE &&
    payload.planKind !== "FREE"
  ) {
    actionError("The FREE plan cannot be changed to a paid plan.");
  }

  if (
    existing &&
    existing.planKind !== MerchantPricingPlanKind.FREE &&
    payload.planKind === "FREE"
  ) {
    actionError("A paid pricing tier cannot be converted into the FREE plan.");
  }

  if (
    isCreate &&
    (payload.catalogueOrderSnapshot === null ||
      payload.catalogueOrderSnapshot.length !== rows.length ||
      payload.catalogueOrderSnapshot.some((id, index) => id !== rows[index]?.id))
  ) {
    actionError(
      "The pricing list changed while you were editing. Review where this plan should appear and try again.",
    );
  }

  const position = isCreate
    ? payload.planKind === "FREE"
      ? 0
      : placementIndex(payload.placement, rows)
    : existing.cataloguePosition;

  if (payload.planKind === "FREE" && position !== 0) {
    actionError(
      "The FREE plan must be the first plan in the pricing catalogue.",
    );
  }

  if (
    payload.planKind !== "FREE" &&
    existingFreePlan &&
    position <= existingFreePlan.cataloguePosition
  ) {
    actionError(
      "Paid pricing tiers must appear after the FREE plan in the pricing catalogue.",
    );
  }

  const contentChanged =
    isCreate || translatableContentChanged(existing, payload);
  const translations = contentChanged
    ? assertTranslation(
        typeof rawTranslation === "string" ? rawTranslation : "",
        payload,
      )
    : null;
  const rewriteUsageEvents =
    isCreate || usageEventsChanged(existing, payload);

  const policy = await prisma.platformBillingPolicy.findUnique({
    where: { id: "default" },
    select: { minimumUpgradePremiumBps: true, version: true },
  });
  const minimumUpgradePremiumBps = policy?.minimumUpgradePremiumBps ?? 2000;
  const projection = projectedPortfolio(
    rows,
    candidateFromPayload(
      payload,
      existing?.id ?? `candidate:${payload.shopifyPlanHandle}`,
    ),
    position,
    minimumUpgradePremiumBps,
    isCreate,
  );

  // Reject deterministic economics failures before opening the transaction.
  // The authoritative assessment is repeated after the revision fence below.
  const preflightAssessment = assessMerchantPricingEconomicsOverride(
    projection.results,
    false,
  );
  if (preflightAssessment.kind === "PASS" && economicsOverrideRequest.requested) {
    actionError(
      "An economics override cannot be approved because the portfolio passes the current economics policy.",
    );
  }
  if (preflightAssessment.kind === "HARD_FAIL") {
    actionError(firstEconomicsFailureMessage(projection.results));
  }
  if (preflightAssessment.kind === "OVERRIDEABLE") {
    if (!economicsOverrideRequest.requested) {
      actionError(
        "Portfolio economics requires an approved policy override before this plan can be saved.",
      );
    }
    if (!economicsOverrideRequest.reason) {
      actionError("An economics override reason is required.");
    }
  }

  const beforeOverrideSnapshot = existing
    ? economicsOverrideSnapshot(existing)
    : null;

  await prisma.$transaction(
    async (transaction) => {
      // Optimistic concurrency fence: the expensive snapshot was loaded before
      // the transaction. Verify that no plan or catalogue position changed in
      // the meantime before using that snapshot for an atomic write.
      const currentRevision = await transaction.merchantPricingPlan.findMany({
        orderBy: { cataloguePosition: "asc" },
        select: {
          id: true,
          cataloguePosition: true,
          updatedAt: true,
        },
      });

      if (!catalogueRevisionMatches(rows, currentRevision)) {
        actionError(
          "The pricing catalogue changed while this update was being validated. Reload the plan and try again.",
        );
      }

      const currentPolicy = await transaction.platformBillingPolicy.findUnique({
        where: { id: "default" },
        select: { minimumUpgradePremiumBps: true, version: true },
      });
      if (
        (currentPolicy?.version ?? null) !== (policy?.version ?? null) ||
        (currentPolicy?.minimumUpgradePremiumBps ?? 2000) !==
          minimumUpgradePremiumBps
      ) {
        actionError(
          "The billing economics policy changed while this update was being validated. Reload the plan and try again.",
        );
      }

      const economicsOverride = await resolveEconomicsOverrideForSave({
        transaction,
        principal,
        adminId,
        request: economicsOverrideRequest,
        projection,
        minimumUpgradePremiumBps,
      });
      const afterOverrideSnapshot =
        economicsOverrideSnapshot(economicsOverride);
      const overrideAuditRequired = isCreate
        ? economicsOverride.economicsOverrideEnabled
        : JSON.stringify(beforeOverrideSnapshot) !==
          JSON.stringify(afterOverrideSnapshot);

      const activeFeatures = await transaction.feature.findMany({
        where: { active: true },
        select: { id: true, key: true, systemRequired: true },
      });
      const existingFeatureMappings = existing
        ? await transaction.merchantPricingPlanFeature.findMany({
            where: { merchantPricingPlanId: existing.id },
            include: { feature: { select: { id: true, key: true, active: true } } },
          })
        : [];
      const requestedFeatures = await transaction.feature.findMany({
        where: { key: { in: payload.supportedFeatureKeys } },
        select: { id: true, key: true, active: true },
      });
      if (requestedFeatures.length !== payload.supportedFeatureKeys.length)
        actionError("One or more selected features do not exist.");
      if (requestedFeatures.some((feature) => !feature.active))
        actionError("Inactive features must be reactivated before they can be newly selected.");
      const requestedKeys = new Set(payload.supportedFeatureKeys);
      if (requestedKeys.size !== payload.supportedFeatureKeys.length)
        actionError("Supported feature keys must be unique.");
      const desiredFeatureIds = [
        ...new Set([
          ...activeFeatures
            .filter((feature) => feature.systemRequired)
            .map((feature) => feature.id),
          ...existingFeatureMappings
            .filter(({ feature }) => !feature.active)
            .map(({ feature }) => feature.id),
          ...requestedFeatures.map((feature) => feature.id),
        ]),
      ];

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
            shopifyRecoveryUsageEventHandle:
              payload.shopifyRecoveryUsageEventHandle,
            materializedAt: null,
            featured: payload.featured,
            includedRecoveryCredits: payload.includedRecoveryCredits,
            allowancePeriod:
              payload.allowancePeriod as MerchantPricingAllowancePeriod,
            billingPeriod: MerchantPricingBillingPeriod.EVERY_30_DAYS,
            recurringAmountMinor: payload.recurringAmountMinor,
            currency: payload.currency,
            ...economicsOverride,
            translations: {
              create: Object.entries(translations!.translations).map(
                ([locale, value]) => ({
                  locale,
                  merchantDescription: value.description,
                }),
              ),
            },
            highlights: {
              create: payload.highlights.map((highlight, position) => ({
                contentKey: highlight.contentKey,
                position,
                translations: {
                  create: Object.entries(translations!.translations).map(
                    ([locale, value]) => ({
                      locale,
                      merchantTitle:
                        value.highlights[highlight.contentKey].title,
                      merchantDescription:
                        value.highlights[highlight.contentKey].description,
                    }),
                  ),
                },
              })),
            },
            usageEvents: {
              create: payload.usageEvents.map((event, eventPosition) =>
                eventData(event, eventPosition, payload.currency),
              ),
            },
            features: {
              create: desiredFeatureIds.map((featureId) => ({ featureId })),
            },
          },
        });

        if (overrideAuditRequired) {
          await auditEconomicsOverrideChange(
            transaction,
            adminId,
            created.id,
            beforeOverrideSnapshot,
            afterOverrideSnapshot,
          );
        }

        await transaction.billingAuditEvent.create({
          data: {
            action: "PLAN_CATALOG_CHANGED",
            platformAdminId: adminId,
            reason: payload.reason,
            relatedEntityType: "MerchantPricingPlan",
            relatedEntityId: created.id,
          },
        });
        return;
      }

      await transaction.merchantPricingPlan.update({
        where: { id: existing.id },
        data: {
          displayName: payload.name,
          planKind: payload.planKind as MerchantPricingPlanKind,
          shopifyRecoveryUsageEventHandle:
            payload.shopifyRecoveryUsageEventHandle,
          isActive: payload.isActive,
          featured: payload.featured,
          includedRecoveryCredits: payload.includedRecoveryCredits,
          allowancePeriod:
            payload.allowancePeriod as MerchantPricingAllowancePeriod,
          billingPeriod: MerchantPricingBillingPeriod.EVERY_30_DAYS,
          recurringAmountMinor: payload.recurringAmountMinor,
          currency: payload.currency,
          ...economicsOverride,
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
                highlights: {
                  deleteMany: {},
                  create: payload.highlights.map((highlight, position) => ({
                    contentKey: highlight.contentKey,
                    position,
                    translations: {
                      create: Object.entries(translations.translations).map(
                        ([locale, value]) => ({
                          locale,
                          merchantTitle:
                            value.highlights[highlight.contentKey].title,
                          merchantDescription:
                            value.highlights[highlight.contentKey].description,
                        }),
                      ),
                    },
                  })),
                },
              }
            : {}),
          ...(rewriteUsageEvents
            ? {
                usageEvents: {
                  deleteMany: {},
                  create: payload.usageEvents.map((event, eventPosition) =>
                    eventData(event, eventPosition, payload.currency),
                  ),
                },
              }
            : {}),
            features: {
              deleteMany: {},
              create: desiredFeatureIds.map((featureId) => ({ featureId })),
            },
        },
      });

        if (existing.materializedAt) {
          const billingPlan = await transaction.billingPlan.findUnique({
            where: { shopifyPlanHandle: existing.shopifyPlanHandle },
            include: { features: true },
          });
          if (!billingPlan)
            actionError(
              "The durable pricing plan has no matching operational BillingPlan; the edit was aborted.",
            );
          await transaction.billingPlan.update({
            where: { id: billingPlan.id },
            data: {
              name: payload.name,
              shopifyUsageEventHandle:
                payload.planKind === "FREE"
                  ? null
                  : payload.shopifyRecoveryUsageEventHandle!.trim(),
              includedRecoveryConversationAllowance:
                payload.planKind === "FREE"
                  ? null
                  : payload.includedRecoveryCredits,
              features: {
                deleteMany: { featureId: { notIn: desiredFeatureIds } },
                upsert: desiredFeatureIds.map((featureId) => ({
                  where: {
                    planId_featureId: { planId: billingPlan.id, featureId },
                  },
                  create: { featureId, enabled: true },
                  update: { enabled: true },
                })),
              },
            },
          });
        }

      if (overrideAuditRequired) {
        await auditEconomicsOverrideChange(
          transaction,
          adminId,
          existing.id,
          beforeOverrideSnapshot,
          afterOverrideSnapshot,
        );
      }

      await transaction.billingAuditEvent.create({
        data: {
          action: "PLAN_CATALOG_CHANGED",
          platformAdminId: adminId,
          reason: payload.reason,
          relatedEntityType: "MerchantPricingPlan",
          relatedEntityId: existing.id,
        },
      });
    },
    MERCHANT_PRICING_TRANSACTION_OPTIONS,
  );
  revalidatePath("/billing");
  redirect("/billing?view=plans");
}
