"use client";

import { useMemo, useState } from "react";
import { mutateMerchantPricingPlanAction } from "@/app/actions/merchant-pricing-plan";
import type { MerchantPricingPlanWithChildren } from "@/lib/admin/merchant-pricing-plan";
import { parseMoneyToMinorUnits } from "@/lib/admin/merchant-pricing-builder-payload";
import { resolveMerchantPricingPreviewPosition } from "@/lib/admin/merchant-pricing-builder-payload";
import {
  evaluateMerchantPricingPortfolio,
  type MerchantPricingEconomicsPlan,
  type MerchantPricingPairResult,
} from "@/lib/admin/merchant-pricing-economics";
import {
  buildMerchantPricingTranslationTemplate,
  type MerchantPricingTranslationParseResult,
} from "@/lib/admin/merchant-pricing-translations";
import { MerchantPricingTranslationImport } from "./merchant-pricing-translation-import";

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
  const [translationJson, setTranslationJson] = useState(
    plan ? JSON.stringify({}) : "",
  );
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
      englishDescription: description,
      reason,
      usageEvents: events,
    };
  }, [
    credits,
    currency,
    description,
    events,
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
    const ordered = cataloguePlans
      .filter(
        (cataloguePlan) =>
          cataloguePlan.id !== plan?.id && cataloguePlan.isActive,
      )
      .map((cataloguePlan) => ({
        position: cataloguePlan.cataloguePosition,
        plan: toEconomicsPlan(cataloguePlan),
      }));
    ordered.push({
      position: previewPosition,
      plan: candidate,
    });
    ordered.sort((left, right) => left.position - right.position);
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

  function validTranslationJson(): string {
    if (translationResult?.valid) return translationJson;
    return (
      translationJson ||
      JSON.stringify(
        buildMerchantPricingTranslationTemplate({
          planHandle: handle,
          planName: name,
          englishDescription: description,
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
          "English description",
          "Portfolio economics",
          "Translations & review",
        ].map((label, index) => (
          <button
            key={label}
            type="button"
            onClick={() => setStep(index)}
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
          <p className="text-sm text-gray-600">
            Create placement is explicit and resolved against a fresh ordered
            catalogue read.
          </p>
          <select
            className={inputClass}
            value={placement}
            disabled={Boolean(plan)}
            onChange={(event) => setPlacement(event.target.value)}
          >
            {!cataloguePlans.length ? (
              <option value="ONLY">ONLY: empty catalogue</option>
            ) : null}
            {cataloguePlans.length ? (
              <option value={`BEFORE:${cataloguePlans[0].id}`}>
                BEFORE: {cataloguePlans[0].displayName}
              </option>
            ) : null}
            {cataloguePlans.map((cataloguePlan) => (
              <option
                key={cataloguePlan.id}
                value={`AFTER:${cataloguePlan.id}`}
              >
                AFTER: {cataloguePlan.displayName}
              </option>
            ))}
            {plan ? (
              <option value="UNCHANGED">UNCHANGED: preserve position</option>
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
                <input
                  className={inputClass}
                  placeholder="Admin label"
                  value={event.adminLabel}
                  onChange={(input) =>
                    updateEvent(index, { adminLabel: input.target.value })
                  }
                />
                <input
                  className={inputClass}
                  placeholder="Event handle"
                  value={event.eventHandle}
                  onChange={(input) =>
                    updateEvent(index, { eventHandle: input.target.value })
                  }
                />
                <input
                  className={inputClass}
                  type="number"
                  min="1"
                  placeholder="Credits per unit"
                  value={event.creditsGrantedPerUnit}
                  onChange={(input) =>
                    updateEvent(index, {
                      creditsGrantedPerUnit: Number(input.target.value),
                    })
                  }
                />
                <input
                  className={inputClass}
                  type="number"
                  min="1"
                  placeholder="Maximum units (optional)"
                  value={event.maximumUnitsPerBillingPeriod ?? ""}
                  onChange={(input) =>
                    updateEvent(index, {
                      maximumUnitsPerBillingPeriod: input.target.value
                        ? Number(input.target.value)
                        : null,
                    })
                  }
                />
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
                  <option value="FIXED">FIXED</option>
                  <option value="GRADUATED">GRADUATED</option>
                  <option value="VOLUME">VOLUME</option>
                </select>
                <input
                  className={inputClass}
                  type="text"
                  inputMode="decimal"
                  placeholder="Fixed amount"
                  value={event.fixedUnitAmount ?? ""}
                  disabled={event.pricingMode !== "FIXED"}
                  onChange={(input) =>
                    updateEvent(index, {
                      fixedUnitAmount: input.target.value,
                    })
                  }
                />
              </div>
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
                      <input
                        className={inputClass}
                        type="number"
                        min="1"
                        placeholder="Up to"
                        value={tier.upTo ?? ""}
                        disabled={tierIndex === (event.tiers?.length ?? 1) - 1}
                        onChange={(input) =>
                          updateTier(index, tierIndex, {
                            upTo: input.target.value
                              ? Number(input.target.value)
                              : null,
                          })
                        }
                      />
                      <input
                        className={inputClass}
                        type="text"
                        inputMode="decimal"
                        placeholder="Amount per unit"
                        value={tier.amountPerUnit}
                        onChange={(input) =>
                          updateTier(index, tierIndex, {
                            amountPerUnit: input.target.value,
                          })
                        }
                      />
                      <input
                        className={inputClass}
                        type="text"
                        inputMode="decimal"
                        placeholder="Flat amount"
                        value={tier.flatAmount}
                        onChange={(input) =>
                          updateTier(index, tierIndex, {
                            flatAmount: input.target.value,
                          })
                        }
                      />
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
                  <div>{result.message}</div>
                  <div className="text-xs">
                    {result.lowerPlanId} to {result.higherPlanId}; additional
                    credits: {result.additionalCreditsNeeded}; code:{" "}
                    {result.code}; status: {result.status}
                  </div>
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
        <MerchantPricingTranslationImport
          planHandle={handle}
          planName={name}
          englishDescription={description}
          initialRawJson={translationJson === "" ? undefined : translationJson}
          onChange={(rawJson, result) => {
            setTranslationJson(rawJson);
            setTranslationResult(result);
          }}
        />
      ) : null}
      <label className="block text-sm font-medium text-gray-700">
        Admin reason
        <textarea
          className={`${inputClass} mt-1`}
          rows={2}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          required
        />
      </label>
      <button
        type="submit"
        disabled={
          economicsState.invalid ||
          !economicsPreview.every((result) => result.status === "PASS") ||
          (step === 6 && !translationResult?.valid)
        }
        className="rounded-md bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {plan ? "Save MerchantPricing plan" : "Create MerchantPricing plan"}
      </button>
    </form>
  );
}
