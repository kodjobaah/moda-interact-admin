"use client";

import { mutateMerchantPricingPlanAction } from "@/app/actions/merchant-pricing-plan";
import type { MerchantPricingBuilderHighlight } from "@/lib/admin/merchant/pricing-builder-payload";
import {
  parseMoneyToMinorUnits,
  resolveMerchantPricingCreatePlacement,
} from "@/lib/admin/merchant/pricing-builder-payload";
import { findUnboundedZeroCostEventLabel } from "@/lib/admin/merchant/pricing-builder-presentation";
import type { MerchantPricingPlanWithChildren } from "@/lib/admin/merchant/pricing-plan";
import { assessMerchantPricingEconomicsOverride } from "@/lib/admin/merchant/pricing-economics-override";
import {
  buildMerchantPricingTranslationTemplate,
  type MerchantPricingTranslationParseResult,
} from "@/lib/admin/merchant/pricing-translations";
import {
  addBuilderTier,
  type BuilderEvent,
  createEmptyBuilderEvent,
  evaluateBuilderEconomics,
  formatBuilderEventPrice,
  formatMinorUnits,
  hasUnboundedZeroCostFixedEvent,
  initialEvents,
  initialHighlights,
  merchantPricingBuilderMerchantContentValid,
  merchantPricingBuilderRequiredFieldsValid,
  merchantPricingBuilderTranslationsRetained,
  minorUnitsToMoney,
  moveBuilderEvent,
  moveBuilderHighlight,
  serializeBuilderEvent,
  updateBuilderEvent,
  updateBuilderHighlight,
  updateBuilderTier,
  ZERO_COST_USAGE_EVENT_MESSAGE,
} from "@/lib/admin/merchant/pricing-plan-builder";
import { presentMerchantPricingEconomicsResult } from "@/lib/admin/merchant/pricing-economics-presentation";
import { useEffect, useMemo, useRef, useState } from "react";
import { MerchantPricingTranslationWorkbook } from "./merchant-pricing-translation-workbook";
import { MerchantPricingPlanSubmitButton } from "./merchant-pricing-plan-submit-button";

const inputClass =
  "w-full rounded-md border border-gray-300 bg-white p-2 text-sm";

export function MerchantPricingPlanBuilder({
  plan,
  cataloguePlans = [],
  minimumUpgradePremiumBps = 2000,
}: {
  plan?: MerchantPricingPlanWithChildren;
  cataloguePlans?: MerchantPricingPlanWithChildren[];
  minimumUpgradePremiumBps?: number;
}) {
  const nextEventKeyRef = useRef(0);
  const [step, setStep] = useState(0);
  const [name, setName] = useState(plan?.displayName ?? "");
  const [handle, setHandle] = useState(plan?.shopifyPlanHandle ?? "");
  const hasFreePlan = cataloguePlans.some(
    (cataloguePlan) => cataloguePlan.planKind === "FREE",
  );
  const freePlanAlreadyExists = hasFreePlan && plan?.planKind !== "FREE";

  const [planKind, setPlanKind] = useState<"FREE" | "PAID_METERED">(
    plan?.planKind ?? (hasFreePlan ? "PAID_METERED" : "FREE"),
  );
  const [isActive, setIsActive] = useState(plan?.isActive ?? true);
  const [featured, setFeatured] = useState(plan?.featured ?? false);
  const [credits, setCredits] = useState(plan?.includedRecoveryCredits ?? 0);
  const [recoveryUsageEventHandle, setRecoveryUsageEventHandle] = useState(
    plan?.shopifyRecoveryUsageEventHandle ?? "",
  );
  const [supportedFeatureKeys, setSupportedFeatureKeys] = useState<string[]>(
    plan?.features.filter(({ feature }) => feature.active).map(({ feature }) => feature.key) ?? [],
  );
  const [currency, setCurrency] = useState(plan?.currency ?? "USD");
  const [recurring, setRecurring] = useState(
    plan ? minorUnitsToMoney(plan.recurringAmountMinor) : "0",
  );
  const cataloguePlanIds = useMemo(
    () => cataloguePlans.map((cataloguePlan) => cataloguePlan.id),
    [cataloguePlans],
  );
  const [placement, setPlacement] = useState(() =>
    plan
      ? "UNCHANGED"
      : resolveMerchantPricingCreatePlacement(planKind, cataloguePlanIds),
  );
  const effectivePlacement =
    !plan && planKind === "FREE"
      ? resolveMerchantPricingCreatePlacement("FREE", cataloguePlanIds)
      : placement;
  const [description, setDescription] = useState(
    plan
      ? (plan.translations.find((translation) => translation.locale === "en")
          ?.merchantDescription ?? "")
      : "",
  );
  const [reason, setReason] = useState("");
  const [economicsOverrideEnabled, setEconomicsOverrideEnabled] =
    useState(false);

  const [economicsOverrideReason, setEconomicsOverrideReason] = useState("");
  const [events, setEvents] = useState<BuilderEvent[]>(initialEvents(plan));
  const [highlights, setHighlights] = useState<
    MerchantPricingBuilderHighlight[]
  >(initialHighlights(plan));
  const [translationJson, setTranslationJson] = useState("");
  const [translationResult, setTranslationResult] =
    useState<MerchantPricingTranslationParseResult | null>(null);

  const economicsConfigurationKey = useMemo(
    () =>
      JSON.stringify({
        handle: handle.trim(),
        credits,
        currency: currency.trim().toUpperCase(),
        recurring,
        placement: effectivePlacement,
        minimumUpgradePremiumBps,
        usageEvents: events.map(serializeBuilderEvent),
      }),
    [
      handle,
      credits,
      currency,
      recurring,
      effectivePlacement,
      minimumUpgradePremiumBps,
      events,
    ],
  );

  const previousEconomicsConfigurationKeyRef = useRef(
    economicsConfigurationKey,
  );

  useEffect(() => {
    if (
      previousEconomicsConfigurationKeyRef.current !== economicsConfigurationKey
    ) {
      setEconomicsOverrideEnabled(false);

      previousEconomicsConfigurationKeyRef.current = economicsConfigurationKey;
    }
  }, [economicsConfigurationKey]);
  const merchantContentValid = merchantPricingBuilderMerchantContentValid({
    description,
    highlights,
  });

  const economicsState = evaluateBuilderEconomics({
    plan,
    cataloguePlans,
    handle,
    name,
    credits,
    recurring,
    currency,
    events,
    placement: effectivePlacement,
    minimumUpgradePremiumBps,
  });

  const payload = useMemo(() => {
    return {
      id: plan?.id ?? null,
      shopifyPlanHandle: handle,
      name,
      planKind,
      shopifyRecoveryUsageEventHandle:
        planKind === "FREE" ? null : recoveryUsageEventHandle,
      supportedFeatureKeys,
      materializedAt: plan?.materializedAt?.toISOString() ?? null,
      isActive,
      featured,
      includedRecoveryCredits: Number(credits),
      allowancePeriod: planKind === "FREE" ? "LIFETIME" : "EVERY_30_DAYS",
      billingPeriod: "EVERY_30_DAYS",
      currency: currency.toUpperCase(),
      recurringAmount: recurring,
      placement: effectivePlacement,
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
    recoveryUsageEventHandle,
    supportedFeatureKeys,
    effectivePlacement,
    reason,
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

  const economicsOverrideAssessment = assessMerchantPricingEconomicsOverride(
    economicsPreview,
    economicsState.invalid,
  );

  const economicsOverrideAvailable =
    economicsOverrideAssessment.kind === "OVERRIDEABLE";

  const economicsOverrideReasonValid =
    Boolean(economicsOverrideReason.trim()) &&
    economicsOverrideReason.trim().length <= 2000;

  const economicsOverrideReady =
    economicsOverrideAvailable &&
    economicsOverrideEnabled &&
    economicsOverrideReasonValid;

  const economicsSatisfied = economicsPassed || economicsOverrideReady;

  const presentedEconomics = economicsPreview.map((result) => ({
    result,
    presentation: presentMerchantPricingEconomicsResult({
      result,
      lowerPlan: economicsState.plansById[result.lowerPlanId],
      higherPlan: economicsState.plansById[result.higherPlanId],
      minimumUpgradePremiumBps,
    }),
  }));
  const failedEconomics = presentedEconomics.filter(
    ({ result }) => result.status !== "PASS",
  );

  const passedEconomics = presentedEconomics.filter(
    ({ result }) => result.status === "PASS",
  );
  const requiredFieldsValid = merchantPricingBuilderRequiredFieldsValid({
    handle,
    name,
    currency,
    credits,
    description,
    events,
    recoveryUsageEventHandle,
    planKind,
  });
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
  const translationsRetained = merchantPricingBuilderTranslationsRetained(
    plan,
    description,
    highlights,
  );

  const canSubmit =
    requiredFieldsValid &&
    Boolean(reason.trim()) &&
    reason.trim().length <= 2000 &&
    economicsSatisfied &&
    (translationsRetained || Boolean(translationResult?.valid));

  const placementLabel = plan
    ? `Current position (${plan.cataloguePosition + 1})`
    : effectivePlacement === "ONLY"
      ? "This will be the first plan."
      : effectivePlacement.startsWith("BEFORE:")
        ? `First — before ${cataloguePlans[0]?.displayName ?? "the first plan"}`
        : `After ${cataloguePlans.find((cataloguePlan) => effectivePlacement === `AFTER:${cataloguePlan.id}`)?.displayName ?? "the selected plan"}`;

  function handlePlanKindChange(nextPlanKind: "FREE" | "PAID_METERED") {
    setPlanKind(nextPlanKind);

    if (plan) return;

    setPlacement(
      resolveMerchantPricingCreatePlacement(nextPlanKind, cataloguePlanIds),
    );
  }

  function canNavigateTo(targetStep: number): boolean {
    if (targetStep <= step) return true;
    if (targetStep > step + 1) return false;

    if (step === 3 && events.some(hasUnboundedZeroCostFixedEvent)) {
      return false;
    }

    if (step === 4 && !merchantContentValid) {
      return false;
    }

    if (step === 5 && !economicsSatisfied) {
      return false;
    }

    return true;
  }

  function addEvent() {
    if (events.length >= 5) return;

    const clientKey = `new-usage-event-${nextEventKeyRef.current++}`;

    setEvents((current) => [...current, createEmptyBuilderEvent(clientKey)]);
  }
  function moveEvent(index: number, direction: -1 | 1) {
    setEvents((current) => moveBuilderEvent(current, index, direction));
  }

  function updateTier(
    eventIndex: number,
    tierIndex: number,
    update: Partial<NonNullable<BuilderEvent["tiers"]>[number]>,
  ) {
    setEvents((current) =>
      updateBuilderTier(current, eventIndex, tierIndex, update),
    );
  }

  function addTier(eventIndex: number) {
    setEvents((current) => addBuilderTier(current, eventIndex));
  }

  function updateEvent(
    index: number,
    update: Partial<Omit<BuilderEvent, "clientKey">>,
  ) {
    setEvents((current) => updateBuilderEvent(current, index, update));
  }

  function updateHighlight(
    index: number,
    update: Partial<MerchantPricingBuilderHighlight>,
  ) {
    setHighlights((current) => updateBuilderHighlight(current, index, update));
  }

  function moveHighlight(index: number, direction: -1 | 1) {
    setHighlights((current) => moveBuilderHighlight(current, index, direction));
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
      <input
        type="hidden"
        name="economicsOverrideRequested"
        value={economicsOverrideReady ? "true" : "false"}
      />

      <input
        type="hidden"
        name="economicsOverrideReason"
        value={economicsOverrideReady ? economicsOverrideReason.trim() : ""}
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
                handlePlanKindChange(
                  event.target.value as "FREE" | "PAID_METERED",
                )
              }
            >
              <option value="FREE" disabled={freePlanAlreadyExists}>
                FREE
              </option>
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
            value={effectivePlacement}
            disabled={Boolean(plan) || planKind === "FREE"}
            onChange={(event) => setPlacement(event.target.value)}
          >
            {plan ? (
              <option value="UNCHANGED">Keep current position</option>
            ) : !cataloguePlans.length ? (
              <option value="ONLY">This will be the first plan.</option>
            ) : planKind === "FREE" ? (
              <option value={`BEFORE:${cataloguePlans[0].id}`}>
                First — before {cataloguePlans[0].displayName}
              </option>
            ) : (
              cataloguePlans.map((cataloguePlan) => (
                <option
                  key={cataloguePlan.id}
                  value={`AFTER:${cataloguePlan.id}`}
                >
                  After {cataloguePlan.displayName}
                </option>
              ))
            )}
          </select>
          {!plan && planKind === "FREE" && cataloguePlans.length ? (
            <p className="text-sm text-gray-600">
              The FREE plan must be the first plan in the catalogue, so it will
              be inserted before {cataloguePlans[0].displayName}.
            </p>
          ) : null}
          {plan ? (
            <p className="text-sm text-gray-600">
              Current position: {plan.cataloguePosition}
            </p>
          ) : null}
        </section>
      ) : null}
      {step === 2 ? (
        <section className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-gray-700 sm:col-span-2">
            Recovery usage-event handle
            <input
              className={inputClass}
              value={recoveryUsageEventHandle}
              required={planKind === "PAID_METERED"}
              disabled={planKind === "FREE"}
              onChange={(event) => setRecoveryUsageEventHandle(event.target.value)}
            />
            <span className="mt-1 block text-xs font-normal text-gray-500">
              Normal paid recovery meter copied to BillingPlan.shopifyUsageEventHandle. Usage events below are top-up offers.
            </span>
          </label>
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
      {step === 0 ? (
        <section className="mt-4 space-y-3 rounded-md border border-gray-200 p-4">
          <div>
            <h3 className="font-semibold text-gray-900">Supported features</h3>
            <p className="text-sm text-gray-600">
              System-required features are always included. Inactive mapped features remain selected until the catalogue feature is reactivated.
            </p>
          </div>
          {plan?.features.map(({ feature }) => feature).concat(
            cataloguePlans.flatMap((cataloguePlan) => cataloguePlan.features.map(({ feature }) => feature)),
          ).filter((feature, index, all) => all.findIndex((candidate) => candidate.id === feature.id) === index).map((feature) => {
            const checked = supportedFeatureKeys.includes(feature.key);
            const locked = feature.systemRequired || !feature.active;
            return (
              <label key={feature.id} className="flex items-start gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={checked || feature.systemRequired}
                  disabled={locked}
                  onChange={(event) => setSupportedFeatureKeys((current) => event.target.checked ? [...current, feature.key] : current.filter((key) => key !== feature.key))}
                />
                <span>
                  <span className="font-medium">{feature.displayName}</span>
                  {feature.systemRequired ? " (Required)" : !feature.active ? " (Inactive globally)" : ""}
                  {feature.description ? <span className="block text-xs text-gray-500">{feature.description}</span> : null}
                </span>
              </label>
            );
          })}
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
              key={event.clientKey}
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

          {!merchantContentValid ? (
            <p className="text-sm font-medium text-red-700">
              Enter the English merchant description. If you add a highlight,
              both its title and description are required before continuing.
            </p>
          ) : null}
        </section>
      ) : null}
      {step === 5 ? (
        <section
          className={`space-y-3 rounded-md border p-4 text-sm ${
            economicsPassed
              ? "border-green-200 bg-green-50 text-green-900"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          <div>
            <h3 className="font-semibold">
              {economicsPassed
                ? "Portfolio economics passed"
                : "This pricing configuration cannot be saved"}
            </h3>

            <p className="mt-2">
              {economicsPassed
                ? "All required plan comparisons satisfy the pricing policy."
                : "One or more required plan comparisons need attention before you can continue."}
            </p>
          </div>

          {failedEconomics.length ? (
            <ul className="space-y-2">
              {failedEconomics.map(({ result, presentation }) => (
                <li
                  key={`${result.lowerPlanId}-${result.higherPlanId}`}
                  className="rounded border border-amber-200 bg-white p-3"
                >
                  {result.code === "UNBOUNDED_ZERO_COST_USAGE_EVENT" ? (
                    <div className="space-y-1">
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
                    <div className="space-y-1">
                      <h4 className="font-semibold">{presentation.title}</h4>

                      <p>{presentation.description}</p>

                      {presentation.guidance ? (
                        <p>
                          <span className="font-semibold">What to change:</span>{" "}
                          {presentation.guidance}
                        </p>
                      ) : null}
                    </div>
                  )}

                  <details className="mt-2 text-xs">
                    <summary>Technical details</summary>

                    <div className="mt-1">
                      {result.lowerPlanId} to {result.higherPlanId}; additional
                      credits: {result.additionalCreditsNeeded}; code:{" "}
                      {result.code}; status: {result.status}
                    </div>

                    <div>
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

                    <div>
                      Stay + top-up:{" "}
                      {formatMinorUnits(result.stayAndTopUpCostMinor, currency)}
                      ; higher recurring:{" "}
                      {formatMinorUnits(result.upgradeCostMinor, currency)};
                      premium:{" "}
                      {Number.isFinite(result.premiumBps)
                        ? `${result.premiumBps} bps`
                        : "infinity/not applicable"}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          ) : null}

          {passedEconomics.length ? (
            <details className="rounded border border-gray-200 bg-white p-3 text-gray-700">
              <summary className="cursor-pointer font-medium">
                {passedEconomics.length}{" "}
                {passedEconomics.length === 1 ? "comparison" : "comparisons"}{" "}
                passed
              </summary>

              <ul className="mt-2 space-y-1 text-xs">
                {passedEconomics.map(({ result }) => {
                  const lowerPlan =
                    economicsState.plansById[result.lowerPlanId];
                  const higherPlan =
                    economicsState.plansById[result.higherPlanId];

                  return (
                    <li key={`${result.lowerPlanId}-${result.higherPlanId}`}>
                      {lowerPlan?.name ?? result.lowerPlanId} →{" "}
                      {higherPlan?.name ?? result.higherPlanId}
                    </li>
                  );
                })}
              </ul>
            </details>
          ) : null}

          {economicsPreview.length ? (
            <ul className="space-y-2">
              {economicsPreview.map((result) => (
                <li
                  key={`${result.lowerPlanId}-${result.higherPlanId}`}
                  className="rounded border border-amber-200 bg-white p-2"
                >
                  {/* existing economics result content */}
                </li>
              ))}
            </ul>
          ) : (
            <p>No active plan pair requires comparison yet.</p>
          )}

          {economicsOverrideAssessment.kind === "OVERRIDEABLE" ? (
            <div className="space-y-3 rounded-md border border-amber-300 bg-white p-4">
              <div>
                <p className="font-semibold text-amber-900">
                  Economics policy override available
                </p>

                <p className="mt-1 text-sm text-amber-800">
                  These failures are commercial-policy exceptions and may be
                  overridden by a SUPER_ADMIN.
                </p>
              </div>

              <label className="flex items-start gap-2 text-sm font-medium text-gray-800">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={economicsOverrideEnabled}
                  onChange={(event) =>
                    setEconomicsOverrideEnabled(event.target.checked)
                  }
                />

                <span>
                  Override the portfolio economics policy for this pricing
                  configuration
                </span>
              </label>

              {economicsOverrideEnabled ? (
                <label className="block text-sm font-medium text-gray-700">
                  Override reason
                  <textarea
                    className={`${inputClass} mt-1`}
                    rows={3}
                    maxLength={2000}
                    value={economicsOverrideReason}
                    onChange={(event) =>
                      setEconomicsOverrideReason(event.target.value)
                    }
                    placeholder="Explain why this commercial exception is being approved."
                  />
                  {!economicsOverrideReason.trim() ? (
                    <span className="mt-1 block text-sm font-medium text-red-700">
                      An override reason is required.
                    </span>
                  ) : null}
                </label>
              ) : null}
            </div>
          ) : null}

          {economicsOverrideAssessment.kind === "HARD_FAIL" &&
          !economicsPassed ? (
            <div className="rounded-md border border-red-300 bg-red-50 p-4">
              <p className="font-semibold text-red-800">
                This economics failure cannot be overridden.
              </p>

              <p className="mt-1 text-sm text-red-700">
                Correct the pricing configuration before continuing.
              </p>
            </div>
          ) : null}
        </section>
      ) : null}
      <div className={step === 6 ? "" : "hidden"}>
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
      </div>
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
              <li key={event.clientKey}>
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
          <p>
            Portfolio economics:{" "}
            {economicsPassed
              ? "PASS"
              : economicsOverrideReady
                ? "OVERRIDE REQUESTED"
                : "NOT PASS"}
          </p>

          {economicsOverrideReady ? (
            <>
              <p>
                Override failures:{" "}
                {economicsOverrideAssessment.failureCodes.join(", ")}
              </p>
              <p>Override reason: {economicsOverrideReason.trim()}</p>
            </>
          ) : null}
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
        <MerchantPricingPlanSubmitButton
          disabled={!canSubmit}
          isUpdate={Boolean(plan)}
        />
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
