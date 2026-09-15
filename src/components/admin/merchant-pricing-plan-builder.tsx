"use client";

import { useMemo, useState } from "react";
import type { MerchantPricingBuilderHighlight } from "@/lib/admin/merchant-pricing-builder-payload";
import { mutateMerchantPricingPlanAction } from "@/app/actions/merchant-pricing-plan";
import type { MerchantPricingPlanWithChildren } from "@/lib/admin/merchant-pricing-plan";
import { parseMoneyToMinorUnits } from "@/lib/admin/merchant-pricing-builder-payload";
import { resolveMerchantPricingPreviewPosition } from "@/lib/admin/merchant-pricing-builder-payload";
import { projectMerchantPricingCatalogueOrder } from "@/lib/admin/merchant-pricing-builder-payload";
import {
  evaluateMerchantPricingPortfolio,
  type MerchantPricingEconomicsPlan,
  type MerchantPricingPairResult,
} from "@/lib/admin/merchant-pricing-economics";
import { findUnboundedZeroCostEventLabel } from "@/lib/admin/merchant-pricing-builder-presentation";
import {
  buildMerchantPricingTranslationTemplate,
  type MerchantPricingTranslationParseResult,
} from "@/lib/admin/merchant-pricing-translations";
import { MerchantPricingTranslationWorkbook } from "./merchant-pricing-translation-workbook";

const inputClass =
  "w-full rounded-md border border-gray-300 bg-white p-2 text-sm";
type BuilderEvent = {
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

function minorUnitsToMoney(value: number): string {
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
}

function formatMinorUnits(value: number | undefined, currency: string): string {
  return value === undefined
    ? "N/A"
    : new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
      }).format(value / 100);
}

function formatBuilderEventPrice(
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

const ZERO_COST_USAGE_EVENT_MESSAGE =
  "This usage event gives recovery credits for free but has no usage limit. Enter a price greater than 0 or set a maximum number of uses per billing period.";

function hasUnboundedZeroCostFixedEvent(event: BuilderEvent): boolean {
  if (
    event.pricingMode !== "FIXED" ||
    event.creditsGrantedPerUnit <= 0 ||
    event.maximumUnitsPerBillingPeriod !== null
  )
    return false;
  try {
    return parseMoneyToMinorUnits(event.fixedUnitAmount ?? "") === 0;
  } catch {
    return false;
  }
}

function serializeBuilderEvent(event: BuilderEvent): BuilderEvent {
  if (event.pricingMode === "FIXED") {
    const { tiers: _tiers, ...fixedEvent } = event;
    return fixedEvent;
  }
  const { fixedUnitAmount: _fixedUnitAmount, ...tieredEvent } = event;
  return tieredEvent;
}

function initialEvents(plan?: MerchantPricingPlanWithChildren): BuilderEvent[] {
  return (
    plan?.usageEvents.map((event) => ({
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

function initialHighlights(
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

function toEconomicsPlan(
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

export function MerchantPricingPlanBuilder({
  plan,
  cataloguePlans = [],
  minimumUpgradePremiumBps = 2000,
}: {
  plan?: MerchantPricingPlanWithChildren;
  cataloguePlans?: MerchantPricingPlanWithChildren[];
  minimumUpgradePremiumBps?: number;
}) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(plan?.displayName ?? "");
  const [handle, setHandle] = useState(plan?.shopifyPlanHandle ?? "");
  const [planKind, setPlanKind] = useState<"FREE" | "PAID_METERED">(
    plan?.planKind ?? "FREE",
  );
  const [isActive, setIsActive] = useState(plan?.isActive ?? true);
  const [featured, setFeatured] = useState(plan?.featured ?? false);
  const [credits, setCredits] = useState(plan?.includedRecoveryCredits ?? 0);
  const [currency, setCurrency] = useState(plan?.currency ?? "USD");
  const [recurring, setRecurring] = useState(
    plan ? minorUnitsToMoney(plan.recurringAmountMinor) : "0",
  );
  const [placement, setPlacement] = useState(
    plan
      ? "UNCHANGED"
      : cataloguePlans[0]
        ? `BEFORE:${cataloguePlans[0].id}`
        : "ONLY",
  );
  const [description, setDescription] = useState(
    plan
      ? (plan.translations.find((translation) => translation.locale === "en")
          ?.merchantDescription ?? "")
      : "",
  );
  const [reason, setReason] = useState("");
  const [events, setEvents] = useState<BuilderEvent[]>(initialEvents(plan));
  const [highlights, setHighlights] = useState<
    MerchantPricingBuilderHighlight[]
  >(initialHighlights(plan));
  const [translationJson, setTranslationJson] = useState("");
  const [translationResult, setTranslationResult] =
    useState<MerchantPricingTranslationParseResult | null>(null);

  const payload = useMemo(() => {
    return {
      id: plan?.id ?? null,
      shopifyPlanHandle: handle,
      name,
      planKind,
      isActive,
      featured,
      includedRecoveryCredits: Number(credits),
      allowancePeriod: planKind === "FREE" ? "LIFETIME" : "EVERY_30_DAYS",
      billingPeriod: "EVERY_30_DAYS",
      currency: currency.toUpperCase(),
      recurringAmount: recurring,
      placement,
      catalogueOrderSnapshot: plan
        ? null
        : cataloguePlans.map((cataloguePlan) => cataloguePlan.id),
      englishDescription: description,
      reason,
      usageEvents: events.map(serializeBuilderEvent),
      highlights,
    };
  }, [
    credits,
    cataloguePlans,
    currency,
    description,
    events,
    highlights,
    featured,
    handle,
    isActive,
    name,
    plan,
    planKind,
    placement,
    reason,
    recurring,
  ]);

  const economicsState = useMemo(() => {
    let recurringAmountMinor: number;
    try {
      recurringAmountMinor = parseMoneyToMinorUnits(recurring);
    } catch {
      return { results: [] as MerchantPricingPairResult[], invalid: true };
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
      return { results: [] as MerchantPricingPairResult[], invalid: true };
    }
    const previewPosition = plan
      ? plan.cataloguePosition
      : resolveMerchantPricingPreviewPosition(
          placement,
          cataloguePlans.map((cataloguePlan) => cataloguePlan.id),
        );
    if (previewPosition === null) {
      return { results: [] as MerchantPricingPairResult[], invalid: true };
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
    const plansByCatalogueId = new Map(
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
    };
  }, [
    cataloguePlans,
    credits,
    currency,
    events,
    handle,
    minimumUpgradePremiumBps,
    name,
    plan,
    placement,
    recurring,
  ]);

  const economicsPreview = economicsState.results;
  const unboundedZeroCostEventLabel = findUnboundedZeroCostEventLabel(
    events,
    parseMoneyToMinorUnits,
  );
  const economicsPassed =
    !economicsState.invalid &&
    economicsPreview.every((result) => result.status === "PASS");
  const requiredFieldsValid =
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
    );
  const retainedTemplate = plan
    ? buildMerchantPricingTranslationTemplate({
        planHandle: handle,
        planName: name,
        englishDescription: description,
        highlights,
        previous: {
          englishDescription:
            plan.translations.find((translation) => translation.locale === "en")
              ?.merchantDescription ?? "",
          highlights: initialHighlights(plan),
          translations: plan.translations.map((translation) => ({
            locale: translation.locale,
            merchantDescription: translation.merchantDescription,
            highlights: plan.highlights.map((highlight) => {
              const value = highlight.translations.find(
                (candidate) => candidate.locale === translation.locale,
              );
              return {
                contentKey: highlight.contentKey,
                title: value?.merchantTitle ?? "",
                description: value?.merchantDescription ?? "",
              };
            }),
          })),
        },
      })
    : null;
  const translationsRetained =
    Boolean(plan) &&
    (
      plan?.translations.find((translation) => translation.locale === "en")
        ?.merchantDescription ?? ""
    ).trim() === description.trim() &&
    plan?.highlights.length === highlights.length &&
    highlights.every((highlight) => {
      const previous = plan?.highlights.find(
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

  const canSubmit =
    requiredFieldsValid &&
    Boolean(reason.trim()) &&
    reason.trim().length <= 2000 &&
    economicsPassed &&
    (translationsRetained || Boolean(translationResult?.valid));

  const placementLabel = plan
    ? `Current position (${plan.cataloguePosition + 1})`
    : placement === "ONLY"
      ? "This will be the first plan."
      : placement.startsWith("BEFORE:")
        ? `Before ${cataloguePlans[0]?.displayName ?? "the first plan"}`
        : `After ${cataloguePlans.find((cataloguePlan) => placement === `AFTER:${cataloguePlan.id}`)?.displayName ?? "the selected plan"}`;

  function canNavigateTo(targetStep: number): boolean {
    if (targetStep <= step) return true;
    if (targetStep > step + 1) return false;
    if (step === 3 && events.some(hasUnboundedZeroCostFixedEvent)) return false;
    return step !== 5 || economicsPassed;
  }

  function addEvent() {
    if (events.length >= 5) return;
    setEvents([
      ...events,
      {
        adminLabel: "",
        eventHandle: "",
        creditsGrantedPerUnit: 1,
        maximumUnitsPerBillingPeriod: null,
        pricingMode: "FIXED",
        fixedUnitAmount: "0",
      },
    ]);
  }

  function moveEvent(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= events.length) return;
    const next = [...events];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    setEvents(next);
  }

  function updateTier(
    eventIndex: number,
    tierIndex: number,
    update: Partial<NonNullable<BuilderEvent["tiers"]>[number]>,
  ) {
    setEvents(
      events.map((event, currentEventIndex) =>
        currentEventIndex === eventIndex
          ? {
              ...event,
              tiers: (event.tiers ?? []).map((tier, currentTierIndex) =>
                currentTierIndex === tierIndex ? { ...tier, ...update } : tier,
              ),
            }
          : event,
      ),
    );
  }

  function addTier(eventIndex: number) {
    const event = events[eventIndex];
    if (
      !event ||
      event.pricingMode === "FIXED" ||
      (event.tiers?.length ?? 0) >= 6
    )
      return;
    setEvents(
      events.map((candidate, index) =>
        index === eventIndex
          ? {
              ...candidate,
              tiers: [
                ...(candidate.tiers ?? []),
                { upTo: null, amountPerUnit: "0", flatAmount: "0" },
              ],
            }
          : candidate,
      ),
    );
  }

  function updateEvent(index: number, update: Partial<BuilderEvent>) {
    setEvents(
      events.map((event, eventIndex) =>
        eventIndex === index ? { ...event, ...update } : event,
      ),
    );
  }

  function updateHighlight(
    index: number,
    update: Partial<MerchantPricingBuilderHighlight>,
  ) {
    setHighlights((current) =>
      current.map((highlight, highlightIndex) =>
        highlightIndex === index ? { ...highlight, ...update } : highlight,
      ),
    );
  }

  function moveHighlight(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= highlights.length) return;
    setHighlights((current) => {
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  function validTranslationJson(): string {
    if (translationResult?.valid) return translationJson;
    if (retainedTemplate) return JSON.stringify(retainedTemplate);
    return (
      translationJson ||
      JSON.stringify(
        buildMerchantPricingTranslationTemplate({
          planHandle: handle,
          planName: name,
          englishDescription: description,
          highlights,
        }),
      )
    );
  }

  return (
    <form action={mutateMerchantPricingPlanAction} className="space-y-6">
      <input type="hidden" name="intent" value={plan ? "update" : "create"} />
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />
      <input
        type="hidden"
        name="translationJson"
        value={validTranslationJson()}
      />
      <nav className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {[
          "Plan",
          "Catalogue placement",
          "Shopify pricing",
          "Usage events",
          "Merchant content",
          "Portfolio economics",
          "Translations & review",
        ].map((label, index) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              if (canNavigateTo(index)) setStep(index);
            }}
            className={`rounded-md border px-2 py-2 text-left text-xs font-semibold ${step === index ? "border-[var(--brand-700)] bg-[var(--brand-50)] text-[var(--brand-800)]" : "border-gray-200 text-gray-600"}`}
          >
            {index + 1} {label}
          </button>
        ))}
      </nav>
      {step === 0 ? (
        <section className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-gray-700">
            Shopify plan handle
            <input
              className={inputClass}
              value={handle}
              readOnly={Boolean(plan)}
              onChange={(event) => setHandle(event.target.value)}
            />
          </label>
          <label className="text-sm font-medium text-gray-700">
            Display name
            <input
              className={inputClass}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="text-sm font-medium text-gray-700">
            Plan kind
            <select
              className={inputClass}
              value={planKind}
              onChange={(event) =>
                setPlanKind(event.target.value as "FREE" | "PAID_METERED")
              }
            >
              <option value="FREE">FREE</option>
              <option value="PAID_METERED">PAID_METERED</option>
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700">
            Included recovery credits
            <input
              className={inputClass}
              type="number"
              min="0"
              value={credits}
              onChange={(event) => setCredits(Number(event.target.value))}
            />
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
            />{" "}
            Active
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              checked={featured}
              onChange={(event) => setFeatured(event.target.checked)}
            />{" "}
            Featured
          </label>
        </section>
      ) : null}
      {step === 1 ? (
        <section className="space-y-3">
          <label className="text-sm font-medium text-gray-700">
            Where should this plan appear?
            <p className="mt-1 font-normal text-gray-600">
              Choose where this plan should appear in the pricing list merchants
              see. This order is also used when Moda compares this plan with the
              other plans.
            </p>
          </label>
          <select
            className={inputClass}
            value={placement}
            disabled={Boolean(plan)}
            onChange={(event) => setPlacement(event.target.value)}
          >
            {!cataloguePlans.length ? (
              <option value="ONLY">This will be the first plan.</option>
            ) : null}
            {cataloguePlans.length ? (
              <option value={`BEFORE:${cataloguePlans[0].id}`}>
                Before {cataloguePlans[0].displayName}
              </option>
            ) : null}
            {cataloguePlans.map((cataloguePlan) => (
              <option
                key={cataloguePlan.id}
                value={`AFTER:${cataloguePlan.id}`}
              >
                After {cataloguePlan.displayName}
              </option>
            ))}
            {plan ? (
              <option value="UNCHANGED">Keep current position</option>
            ) : null}
          </select>
          {plan ? (
            <p className="text-sm text-gray-600">
              Current position: {plan.cataloguePosition}
            </p>
          ) : null}
        </section>
      ) : null}
      {step === 2 ? (
        <section className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-gray-700">
            Currency
            <input
              className={inputClass}
              value={currency}
              onChange={(event) =>
                setCurrency(event.target.value.toUpperCase())
              }
              maxLength={3}
            />
          </label>
          <label className="text-sm font-medium text-gray-700">
            Recurring amount
            <input
              className={inputClass}
              value={recurring}
              onChange={(event) => setRecurring(event.target.value)}
              inputMode="decimal"
            />
          </label>
          <p className="text-sm text-gray-600 sm:col-span-2">
            Billing period: EVERY_30_DAYS
          </p>
        </section>
      ) : null}
      {step === 3 ? (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">
              Usage events ({events.length}/5)
            </h3>
            <button
              type="button"
              disabled={events.length >= 5}
              onClick={addEvent}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold"
            >
              Add usage event
            </button>
          </div>
          {events.map((event, index) => (
            <div
              key={`${event.eventHandle}-${index}`}
              className="space-y-3 rounded-md border border-gray-200 p-3"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium text-gray-700">
                  Admin label
                  <input
                    className={inputClass}
                    value={event.adminLabel}
                    onChange={(input) =>
                      updateEvent(index, { adminLabel: input.target.value })
                    }
                  />
                </label>
                <label className="text-sm font-medium text-gray-700">
                  Shopify usage-event handle
                  <input
                    className={inputClass}
                    value={event.eventHandle}
                    onChange={(input) =>
                      updateEvent(index, { eventHandle: input.target.value })
                    }
                  />
                </label>
                <label className="text-sm font-medium text-gray-700">
                  Recovery credits granted per event
                  <input
                    className={inputClass}
                    type="number"
                    min="1"
                    value={event.creditsGrantedPerUnit}
                    onChange={(input) =>
                      updateEvent(index, {
                        creditsGrantedPerUnit: Number(input.target.value),
                      })
                    }
                  />
                </label>
                <label className="text-sm font-medium text-gray-700">
                  Maximum uses per billing period (optional)
                  <input
                    className={inputClass}
                    type="number"
                    min="1"
                    value={event.maximumUnitsPerBillingPeriod ?? ""}
                    onChange={(input) =>
                      updateEvent(index, {
                        maximumUnitsPerBillingPeriod: input.target.value
                          ? Number(input.target.value)
                          : null,
                      })
                    }
                  />
                </label>
                <label className="text-sm font-medium text-gray-700">
                  Pricing model
                  <select
                    className={inputClass}
                    value={event.pricingMode}
                    onChange={(input) =>
                      updateEvent(index, {
                        pricingMode: input.target
                          .value as BuilderEvent["pricingMode"],
                      })
                    }
                  >
                    <option value="FIXED">Fixed price</option>
                    <option value="GRADUATED">Graduated pricing</option>
                    <option value="VOLUME">Volume pricing</option>
                  </select>
                </label>
                {event.pricingMode === "FIXED" ? (
                  <label className="text-sm font-medium text-gray-700">
                    Price per usage event ({currency.toUpperCase()})
                    <input
                      className={inputClass}
                      type="text"
                      inputMode="decimal"
                      value={event.fixedUnitAmount ?? ""}
                      onChange={(input) =>
                        updateEvent(index, {
                          fixedUnitAmount: input.target.value,
                        })
                      }
                    />
                  </label>
                ) : null}
              </div>
              {hasUnboundedZeroCostFixedEvent(event) ? (
                <p className="text-sm font-medium text-red-700">
                  {ZERO_COST_USAGE_EVENT_MESSAGE}
                </p>
              ) : null}
              {event.pricingMode !== "FIXED" ? (
                <div className="space-y-2 rounded-md bg-gray-50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">
                      Tiers ({event.tiers?.length ?? 0}/6)
                    </span>
                    <button
                      type="button"
                      disabled={(event.tiers?.length ?? 0) >= 6}
                      onClick={() => addTier(index)}
                      className="rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold"
                    >
                      Add tier
                    </button>
                  </div>
                  {(event.tiers ?? []).map((tier, tierIndex) => (
                    <div
                      key={`${index}-${tierIndex}`}
                      className="grid gap-2 sm:grid-cols-4"
                    >
                      <label className="text-sm font-medium text-gray-700">
                        Up to quantity
                        {tierIndex === (event.tiers?.length ?? 1) - 1 ? (
                          <span className="ml-1 font-normal">(Unlimited)</span>
                        ) : null}
                        <input
                          className={inputClass}
                          type="number"
                          min="1"
                          value={tier.upTo ?? ""}
                          disabled={
                            tierIndex === (event.tiers?.length ?? 1) - 1
                          }
                          onChange={(input) =>
                            updateTier(index, tierIndex, {
                              upTo: input.target.value
                                ? Number(input.target.value)
                                : null,
                            })
                          }
                        />
                      </label>
                      <label className="text-sm font-medium text-gray-700">
                        Price per unit ({currency.toUpperCase()})
                        <input
                          className={inputClass}
                          type="text"
                          inputMode="decimal"
                          value={tier.amountPerUnit}
                          onChange={(input) =>
                            updateTier(index, tierIndex, {
                              amountPerUnit: input.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="text-sm font-medium text-gray-700">
                        Additional flat charge ({currency.toUpperCase()})
                        <input
                          className={inputClass}
                          type="text"
                          inputMode="decimal"
                          value={tier.flatAmount}
                          onChange={(input) =>
                            updateTier(index, tierIndex, {
                              flatAmount: input.target.value,
                            })
                          }
                        />
                      </label>
                      <button
                        type="button"
                        disabled={(event.tiers?.length ?? 0) <= 1}
                        onClick={() =>
                          updateEvent(index, {
                            tiers: event.tiers?.filter(
                              (_, currentTierIndex) =>
                                currentTierIndex !== tierIndex,
                            ),
                          })
                        }
                        className="text-xs font-semibold text-red-700"
                      >
                        Remove tier
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => moveEvent(index, -1)}
                  className="text-sm font-semibold text-gray-700"
                >
                  Move up
                </button>
                <button
                  type="button"
                  disabled={index === events.length - 1}
                  onClick={() => moveEvent(index, 1)}
                  className="text-sm font-semibold text-gray-700"
                >
                  Move down
                </button>
              </div>
              <button
                type="button"
                onClick={() =>
                  setEvents(
                    events.filter((_, eventIndex) => eventIndex !== index),
                  )
                }
                className="text-sm font-semibold text-red-700"
              >
                Remove usage event
              </button>
            </div>
          ))}
        </section>
      ) : null}
      {step === 4 ? (
        <section className="space-y-5">
          <label className="block text-sm font-medium text-gray-700">
            English merchant description
            <textarea
              className={`${inputClass} mt-1`}
              rows={6}
              maxLength={2000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          {highlights.map((highlight, index) => (
            <div
              key={highlight.contentKey}
              className="space-y-3 rounded-md border border-gray-200 p-3"
            >
              <label className="block text-sm font-medium text-gray-700">
                Highlight title
                <input
                  className={inputClass}
                  maxLength={120}
                  value={highlight.title}
                  onChange={(event) =>
                    updateHighlight(index, { title: event.target.value })
                  }
                />
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Highlight description
                <textarea
                  className={inputClass}
                  maxLength={500}
                  rows={3}
                  value={highlight.description}
                  onChange={(event) =>
                    updateHighlight(index, { description: event.target.value })
                  }
                />
              </label>
              <div className="flex flex-wrap gap-3 text-sm font-semibold">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => moveHighlight(index, -1)}
                >
                  Move up
                </button>
                <button
                  type="button"
                  disabled={index === highlights.length - 1}
                  onClick={() => moveHighlight(index, 1)}
                >
                  Move down
                </button>
                <button
                  type="button"
                  className="text-red-700"
                  onClick={() =>
                    setHighlights((current) =>
                      current.filter(
                        (_, highlightIndex) => highlightIndex !== index,
                      ),
                    )
                  }
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setHighlights((current) => [
                ...current,
                { contentKey: crypto.randomUUID(), title: "", description: "" },
              ])
            }
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold"
          >
            + Add highlight
          </button>
        </section>
      ) : null}
      {step === 5 ? (
        <section className="space-y-3 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div>
            <h3 className="font-semibold">Portfolio economics</h3>
            <p className="mt-2">
              Every ordered lower-to-higher comparison must pass before save.
            </p>
          </div>
          {economicsPreview.length ? (
            <ul className="space-y-2">
              {economicsPreview.map((result) => (
                <li
                  key={`${result.lowerPlanId}-${result.higherPlanId}`}
                  className="rounded border border-amber-200 bg-white p-2"
                >
                  <div className="font-semibold">
                    {result.lowerPlanId} to {result.higherPlanId}:{" "}
                    {result.status}
                  </div>
                  {result.code === "UNBOUNDED_ZERO_COST_USAGE_EVENT" ? (
                    <div>
                      <h4 className="font-semibold">
                        Usage-event pricing needs attention
                      </h4>
                      <p>
                        {unboundedZeroCostEventLabel
                          ? `${unboundedZeroCostEventLabel} gives recovery credits for free with no usage limit.`
                          : "One of the usage events gives recovery credits for free with no usage limit."}{" "}
                        Enter a price greater than 0 or set a maximum number of
                        uses per billing period.
                      </p>
                    </div>
                  ) : (
                    <div>{result.message}</div>
                  )}
                  <details className="text-xs">
                    <summary>Show technical details</summary>
                    <div>
                      {result.lowerPlanId} to {result.higherPlanId}; additional
                      credits: {result.additionalCreditsNeeded}; code:{" "}
                      {result.code}; status: {result.status}
                    </div>
                  </details>
                  <div className="text-xs">
                    Quantities:{" "}
                    {result.summary.length
                      ? result.summary
                          .map(
                            (row) =>
                              `${row.eventHandle} x${row.quantity} (${row.creditsGranted} credits, ${row.costMinor} minor)`,
                          )
                          .join(", ")
                      : "none"}
                  </div>
                  <div className="text-xs">
                    Stay + top-up:{" "}
                    {formatMinorUnits(result.stayAndTopUpCostMinor, currency)};
                    higher recurring:{" "}
                    {formatMinorUnits(result.upgradeCostMinor, currency)};
                    premium:{" "}
                    {Number.isFinite(result.premiumBps)
                      ? `${result.premiumBps} bps`
                      : "infinity/not applicable"}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p>No active plan pair requires comparison yet.</p>
          )}
        </section>
      ) : null}
      {step === 6 ? (
        <MerchantPricingTranslationWorkbook
          planHandle={handle}
          canonicalTemplate={
            retainedTemplate ??
            buildMerchantPricingTranslationTemplate({
              planHandle: handle,
              planName: name,
              englishDescription: description,
              highlights,
            })
          }
          highlights={highlights}
          translationsRetained={translationsRetained}
          onChange={(rawJson, result) => {
            setTranslationJson(rawJson);
            setTranslationResult(result);
          }}
        />
      ) : null}
      {step === 6 ? (
        <section className="space-y-2 rounded-md border border-gray-200 p-4 text-sm">
          <h3 className="font-semibold">Final review</h3>
          <p>
            {name} ({handle})
          </p>
          <p>Catalogue placement: {placementLabel}</p>
          <p>
            Recurring pricing: {recurring} {currency}
          </p>
          <p>Allowance: {credits} recovery credits</p>
          <p>Usage events: {events.length}</p>
          <ul className="list-disc pl-5">
            {events.map((event) => (
              <li key={event.eventHandle}>
                {event.adminLabel}: {event.creditsGrantedPerUnit} credits per
                event
                {event.pricingMode === "FIXED"
                  ? ` · ${formatBuilderEventPrice(event, currency)} per event · ${event.maximumUnitsPerBillingPeriod ?? "Unlimited"}`
                  : ` · ${event.pricingMode === "GRADUATED" ? "graduated pricing" : "volume pricing"} across ${event.tiers?.length ?? 0} tiers`}
              </li>
            ))}
          </ul>
          <p>English merchant description: {description}</p>
          <ul className="list-disc pl-5">
            {highlights.map((highlight) => (
              <li key={highlight.contentKey}>
                {highlight.title}: {highlight.description}
              </li>
            ))}
          </ul>
          <p>Portfolio economics: {economicsPassed ? "PASS" : "NOT PASS"}</p>
          <p>
            Translation state:{" "}
            {translationsRetained
              ? "20/20 retained"
              : translationResult?.valid
                ? "20/20 validated"
                : "Not validated"}
          </p>
        </section>
      ) : null}
      {step === 6 ? (
        <label className="block text-sm font-medium text-gray-700">
          Admin reason
          <textarea
            className={`${inputClass} mt-1`}
            rows={2}
            maxLength={2000}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
      ) : null}
      {step === 6 ? (
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-md bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {plan ? "Save MerchantPricing plan" : "Create MerchantPricing plan"}
        </button>
      ) : null}
      <div className="flex justify-between gap-3">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => setStep((current) => Math.max(0, current - 1))}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold disabled:opacity-50"
        >
          Back
        </button>
        {step < 6 ? (
          <button
            type="button"
            disabled={!canNavigateTo(step + 1)}
            onClick={() => setStep((current) => current + 1)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold disabled:opacity-50"
          >
            Next
          </button>
        ) : null}
      </div>
    </form>
  );
}
