import {
  MerchantPricingBuilderEvent,
  parseMoneyToMinorUnits,
  type MerchantPricingBuilderHighlight,
} from "@/lib/admin/merchant/pricing-builder-payload";
import {
  projectMerchantPricingCatalogueOrder,
  resolveMerchantPricingPreviewPosition,
} from "@/lib/admin/merchant/pricing-builder-payload";

import {
  evaluateMerchantPricingPortfolio,
  type MerchantPricingPairResult,
  type MerchantPricingEconomicsPlan,
} from "@/lib/admin/merchant/pricing-economics";

import type { MerchantPricingPlanWithChildren } from "@/lib/admin/merchant/pricing-plan";

export type BuilderEvent = {
  readonly clientKey: string;

  adminLabel: string;
  eventHandle: string;
  creditsGrantedPerUnit: number;
  maximumUnitsPerBillingPeriod: number | null;
  pricingMode: "FIXED" | "GRADUATED" | "VOLUME";
  fixedUnitAmount?: string;
  tiers?: Array<{
    upTo: number | null;
    amountPerUnit: string;
    flatAmount: string;
  }>;
};

export type BuilderEconomicsState = {
  results: MerchantPricingPairResult[];
  invalid: boolean;
  plansById: Record<string, MerchantPricingEconomicsPlan>;
};

export type EvaluateBuilderEconomicsInput = {
  plan?: MerchantPricingPlanWithChildren;
  cataloguePlans: MerchantPricingPlanWithChildren[];

  handle: string;
  name: string;
  credits: number;
  recurring: string;
  currency: string;
  events: BuilderEvent[];

  placement: string;
  minimumUpgradePremiumBps: number;
};

export function evaluateBuilderEconomics({
  plan,
  cataloguePlans,
  handle,
  name,
  credits,
  recurring,
  currency,
  events,
  placement,
  minimumUpgradePremiumBps,
}: EvaluateBuilderEconomicsInput): BuilderEconomicsState {
  let recurringAmountMinor: number;

  try {
    recurringAmountMinor = parseMoneyToMinorUnits(recurring);
  } catch {
    return {
      results: [] as MerchantPricingPairResult[],
      invalid: true,
      plansById: {},
    };
  }

  let usageEvents: Array<{
    event: BuilderEvent;
    pricing: MerchantPricingEconomicsPlan["usageEvents"][number]["pricing"];
  }>;

  try {
    usageEvents = events.map((event) => {
      if (event.pricingMode === "FIXED") {
        return {
          event,
          pricing: {
            mode: "FIXED" as const,
            currency: currency.trim().toUpperCase(),
            unitAmountMinor: parseMoneyToMinorUnits(
              event.fixedUnitAmount ?? "",
            ),
          },
        };
      }

      return {
        event,
        pricing: {
          mode: event.pricingMode,
          currency: currency.trim().toUpperCase(),
          tiers: (event.tiers ?? []).map((tier) => ({
            upTo: tier.upTo,
            amountPerUnitMinor: parseMoneyToMinorUnits(tier.amountPerUnit),
            flatAmountMinor: parseMoneyToMinorUnits(tier.flatAmount),
          })),
        },
      };
    });
  } catch {
    return {
      results: [],
      invalid: true,
      plansById: {},
    };
  }

  const previewPosition = plan
    ? plan.cataloguePosition
    : resolveMerchantPricingPreviewPosition(
        placement,
        cataloguePlans.map((cataloguePlan) => cataloguePlan.id),
      );

  if (previewPosition === null) {
    return {
      results: [],
      invalid: true,
      plansById: {},
    };
  }

  const candidate: MerchantPricingEconomicsPlan = {
    id: plan?.id ?? `candidate:${handle.trim()}`,
    shopifyPlanHandle: handle.trim(),
    name: name.trim(),
    includedRecoveryCredits: Number(credits),
    recurringAmountMinor,
    currency: currency.trim().toUpperCase(),

    usageEvents: usageEvents.map(({ event, pricing }) => ({
      eventHandle: event.eventHandle.trim(),
      creditsGrantedPerUnit: event.creditsGrantedPerUnit,
      maximumUnitsPerBillingPeriod: event.maximumUnitsPerBillingPeriod,
      pricing,
    })),
  };

  const projectedIds = projectMerchantPricingCatalogueOrder(
    cataloguePlans.map((cataloguePlan) => cataloguePlan.id),
    candidate.id,
    previewPosition,
    plan?.id,
  );

  const plansByCatalogueId = new Map<string, MerchantPricingEconomicsPlan>(
    cataloguePlans.map((cataloguePlan) => [
      cataloguePlan.id,
      toEconomicsPlan(cataloguePlan),
    ]),
  );

  plansByCatalogueId.set(candidate.id, candidate);

  const ordered = projectedIds
    .map((id) => ({
      plan: plansByCatalogueId.get(id)!,
      source: cataloguePlans.find((cataloguePlan) => cataloguePlan.id === id),
      id,
    }))
    .filter(({ source, id }) => id === candidate.id || source?.isActive);

  const plansById = Object.fromEntries(
    ordered.map(({ plan: orderedPlan }) => [orderedPlan.id, orderedPlan]),
  );

  return {
    results: evaluateMerchantPricingPortfolio({
      orderedPlanIds: ordered.map(({ plan: orderedPlan }) => orderedPlan.id),
      plansById,
      minimumUpgradePremiumBps,
    }),
    invalid: false,
    plansById,
  };
}

export const ZERO_COST_USAGE_EVENT_MESSAGE =
  "This usage event gives recovery credits for free but has no usage limit. Enter a price greater than 0 or set a maximum number of uses per billing period.";

export function minorUnitsToMoney(value: number): string {
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
}

export function formatMinorUnits(
  value: number | undefined,
  currency: string,
): string {
  return value === undefined
    ? "N/A"
    : new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
      }).format(value / 100);
}

export function formatBuilderEventPrice(
  event: BuilderEvent,
  currency: string,
): string {
  try {
    return formatMinorUnits(
      parseMoneyToMinorUnits(event.fixedUnitAmount ?? "0"),
      currency,
    );
  } catch {
    return "Invalid price";
  }
}

export function hasUnboundedZeroCostFixedEvent(event: BuilderEvent): boolean {
  if (
    event.pricingMode !== "FIXED" ||
    event.creditsGrantedPerUnit <= 0 ||
    event.maximumUnitsPerBillingPeriod !== null
  ) {
    return false;
  }

  try {
    return parseMoneyToMinorUnits(event.fixedUnitAmount ?? "") === 0;
  } catch {
    return false;
  }
}

export function serializeBuilderEvent(
  event: BuilderEvent,
): MerchantPricingBuilderEvent {
  if (event.pricingMode === "FIXED") {
    return {
      adminLabel: event.adminLabel,
      eventHandle: event.eventHandle,
      creditsGrantedPerUnit: event.creditsGrantedPerUnit,
      maximumUnitsPerBillingPeriod: event.maximumUnitsPerBillingPeriod,
      pricingMode: "FIXED",
      fixedUnitAmount: event.fixedUnitAmount ?? "0",
    };
  }

  return {
    adminLabel: event.adminLabel,
    eventHandle: event.eventHandle,
    creditsGrantedPerUnit: event.creditsGrantedPerUnit,
    maximumUnitsPerBillingPeriod: event.maximumUnitsPerBillingPeriod,
    pricingMode: event.pricingMode,
    tiers: event.tiers ?? [],
  };
}

export function initialEvents(
  plan?: MerchantPricingPlanWithChildren,
): BuilderEvent[] {
  return (
    plan?.usageEvents.map((event) => ({
      clientKey: event.id,
      adminLabel: event.adminLabel,
      eventHandle: event.eventHandle,
      creditsGrantedPerUnit: event.creditsGrantedPerUnit,
      maximumUnitsPerBillingPeriod: event.maximumUnitsPerBillingPeriod,
      pricingMode: event.pricingMode,
      fixedUnitAmount: minorUnitsToMoney(event.fixedUnitAmountMinor ?? 0),
      tiers: event.tiers.map((tier) => ({
        upTo: tier.upTo,
        amountPerUnit: minorUnitsToMoney(tier.amountPerUnitMinor),
        flatAmount: minorUnitsToMoney(tier.flatAmountMinor),
      })),
    })) ?? []
  );
}
export function initialHighlights(
  plan?: MerchantPricingPlanWithChildren,
): MerchantPricingBuilderHighlight[] {
  return (plan?.highlights ?? []).map((highlight) => ({
    contentKey: highlight.contentKey,
    title:
      highlight.translations.find((translation) => translation.locale === "en")
        ?.merchantTitle ?? "",
    description:
      highlight.translations.find((translation) => translation.locale === "en")
        ?.merchantDescription ?? "",
  }));
}
export function toEconomicsPlan(
  plan: MerchantPricingPlanWithChildren,
): MerchantPricingEconomicsPlan {
  return {
    id: plan.id,
    shopifyPlanHandle: plan.shopifyPlanHandle,
    name: plan.displayName,
    includedRecoveryCredits: plan.includedRecoveryCredits,
    recurringAmountMinor: plan.recurringAmountMinor,
    currency: plan.currency,
    usageEvents: plan.usageEvents.map((event) => ({
      eventHandle: event.eventHandle,
      creditsGrantedPerUnit: event.creditsGrantedPerUnit,
      maximumUnitsPerBillingPeriod: event.maximumUnitsPerBillingPeriod,
      pricing:
        event.pricingMode === "FIXED"
          ? {
              mode: "FIXED" as const,
              currency: event.currency,
              unitAmountMinor: event.fixedUnitAmountMinor ?? 0,
            }
          : {
              mode: event.pricingMode,
              currency: event.currency,
              tiers: event.tiers.map((tier) => ({
                upTo: tier.upTo,
                amountPerUnitMinor: tier.amountPerUnitMinor,
                flatAmountMinor: tier.flatAmountMinor,
              })),
            },
    })),
  };
}

export function merchantPricingBuilderRequiredFieldsValid({
  handle,
  name,
  currency,
  credits,
  description,
  events,
}: {
  handle: string;
  name: string;
  currency: string;
  credits: number;
  description: string;
  events: BuilderEvent[];
}): boolean {
  return (
    Boolean(handle.trim()) &&
    Boolean(name.trim()) &&
    /^[A-Z]{3}$/.test(currency.trim().toUpperCase()) &&
    Number.isSafeInteger(Number(credits)) &&
    Number(credits) >= 0 &&
    Boolean(description.trim()) &&
    description.trim().length <= 2000 &&
    events.every(
      (event) =>
        Boolean(event.adminLabel.trim()) &&
        Boolean(event.eventHandle.trim()) &&
        Number.isSafeInteger(event.creditsGrantedPerUnit) &&
        event.creditsGrantedPerUnit >= 1,
    )
  );
}

export function merchantPricingBuilderTranslationsRetained(
  plan: MerchantPricingPlanWithChildren | undefined,
  description: string,
  highlights: MerchantPricingBuilderHighlight[],
): boolean {
  if (!plan) {
    return false;
  }

  const previousEnglishDescription =
    plan.translations.find((translation) => translation.locale === "en")
      ?.merchantDescription ?? "";

  if (previousEnglishDescription.trim() !== description.trim()) {
    return false;
  }

  if (plan.highlights.length !== highlights.length) {
    return false;
  }

  return highlights.every((highlight) => {
    const previous = plan.highlights.find(
      (candidate) => candidate.contentKey === highlight.contentKey,
    );

    const previousEnglish = previous?.translations.find(
      (translation) => translation.locale === "en",
    );

    return (
      previousEnglish?.merchantTitle.trim() === highlight.title.trim() &&
      previousEnglish?.merchantDescription.trim() ===
        highlight.description.trim()
    );
  });
}

export function moveBuilderEvent(
  events: BuilderEvent[],
  index: number,
  direction: -1 | 1,
): BuilderEvent[] {
  const nextIndex = index + direction;

  if (nextIndex < 0 || nextIndex >= events.length) {
    return events;
  }

  const next = [...events];

  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];

  return next;
}

export function updateBuilderEvent(
  events: BuilderEvent[],
  index: number,
  update: Partial<Omit<BuilderEvent, "clientKey">>,
): BuilderEvent[] {
  return events.map((event, eventIndex) =>
    eventIndex === index ? { ...event, ...update } : event,
  );
}

export function updateBuilderTier(
  events: BuilderEvent[],
  eventIndex: number,
  tierIndex: number,
  update: Partial<NonNullable<BuilderEvent["tiers"]>[number]>,
): BuilderEvent[] {
  return events.map((event, currentEventIndex) => {
    if (currentEventIndex !== eventIndex) {
      return event;
    }

    return {
      ...event,
      tiers: (event.tiers ?? []).map((tier, currentTierIndex) =>
        currentTierIndex === tierIndex ? { ...tier, ...update } : tier,
      ),
    };
  });
}

export function addBuilderTier(
  events: BuilderEvent[],
  eventIndex: number,
): BuilderEvent[] {
  const event = events[eventIndex];

  if (
    !event ||
    event.pricingMode === "FIXED" ||
    (event.tiers?.length ?? 0) >= 6
  ) {
    return events;
  }

  return events.map((candidate, index) =>
    index === eventIndex
      ? {
          ...candidate,
          tiers: [
            ...(candidate.tiers ?? []),
            {
              upTo: null,
              amountPerUnit: "0",
              flatAmount: "0",
            },
          ],
        }
      : candidate,
  );
}

export function moveBuilderHighlight(
  highlights: MerchantPricingBuilderHighlight[],
  index: number,
  direction: -1 | 1,
): MerchantPricingBuilderHighlight[] {
  const nextIndex = index + direction;

  if (nextIndex < 0 || nextIndex >= highlights.length) {
    return highlights;
  }

  const next = [...highlights];

  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];

  return next;
}

export function updateBuilderHighlight(
  highlights: MerchantPricingBuilderHighlight[],
  index: number,
  update: Partial<MerchantPricingBuilderHighlight>,
): MerchantPricingBuilderHighlight[] {
  return highlights.map((highlight, highlightIndex) =>
    highlightIndex === index ? { ...highlight, ...update } : highlight,
  );
}

export function createEmptyBuilderEvent(clientKey: string): BuilderEvent {
  return {
    clientKey,
    adminLabel: "",
    eventHandle: "",
    creditsGrantedPerUnit: 1,
    maximumUnitsPerBillingPeriod: null,
    pricingMode: "FIXED",
    fixedUnitAmount: "0",
  };
}

export function merchantPricingBuilderMerchantContentValid({
  description,
  highlights,
}: {
  description: string;
  highlights: MerchantPricingBuilderHighlight[];
}): boolean {
  const trimmedDescription = description.trim();

  if (!trimmedDescription || trimmedDescription.length > 2000) {
    return false;
  }

  return highlights.every((highlight) => {
    const title = highlight.title.trim();
    const highlightDescription = highlight.description.trim();

    return (
      Boolean(title) &&
      title.length <= 120 &&
      Boolean(highlightDescription) &&
      highlightDescription.length <= 500
    );
  });
}
