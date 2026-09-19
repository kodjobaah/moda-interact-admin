#!/usr/bin/env node

import process from "node:process";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CONFIRM_FLAG = "--confirm-test-data";
const FORCE_MATERIALIZED_FLAG = "--force-materialized-test-data";

const TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 20_000,
};

const PLAN_ORDER = ["free", "starter", "growth", "scale"];
const SEEDED_ID_PREFIX = "manual-test-mpp-";

const FEATURE_DEFINITIONS = [
  {
    key: "checkout_recovery",
    displayName: "Checkout Recovery",
    description: "Recover abandoned checkouts.",
    activationMode: "ALWAYS_ENABLED",
    systemRequired: true,
    active: true,
  },
  {
    key: "ai_conversations",
    displayName: "AI Conversations",
    description: "AI-assisted merchant and customer conversations.",
    activationMode: "MERCHANT_OPT_IN",
    systemRequired: false,
    active: true,
  },
  {
    key: "order_support",
    displayName: "Order Support",
    description: "Support order-related customer conversations.",
    activationMode: "MERCHANT_OPT_IN",
    systemRequired: false,
    active: true,
  },
  {
    key: "product_search",
    displayName: "Product Search",
    description: "Search merchant products during customer conversations.",
    activationMode: "MERCHANT_OPT_IN",
    systemRequired: false,
    active: true,
  },
];

const LOCALES = [
  "cs",
  "da",
  "de",
  "en",
  "es",
  "fi",
  "fr",
  "it",
  "ja",
  "ko",
  "nb",
  "nl",
  "pl",
  "pt-BR",
  "pt-PT",
  "sv",
  "th",
  "tr",
  "zh-Hans",
  "zh-Hant",
];

const COPY = {
  cs: (name, credits, period) => `${name} poskytuje ${credits} kreditů pro obnovu ${period}.`,
  da: (name, credits, period) => `${name} giver ${credits} recovery-kreditter ${period}.`,
  de: (name, credits, period) => `${name} bietet ${credits} Recovery-Credits ${period}.`,
  en: (name, credits, period) => `${name} provides ${credits} recovery credits ${period}.`,
  es: (name, credits, period) => `${name} ofrece ${credits} créditos de recuperación ${period}.`,
  fi: (name, credits, period) => `${name} tarjoaa ${credits} palautuskrediittiä ${period}.`,
  fr: (name, credits, period) => `${name} comprend ${credits} crédits de récupération ${period}.`,
  it: (name, credits, period) => `${name} include ${credits} crediti di recupero ${period}.`,
  ja: (name, credits, period) => `${name} には ${period}利用できるリカバリークレジットが ${credits} 件含まれます。`,
  ko: (name, credits, period) => `${name} 요금제에는 ${period} 사용할 수 있는 복구 크레딧 ${credits}개가 포함됩니다.`,
  nb: (name, credits, period) => `${name} gir ${credits} recovery-kreditter ${period}.`,
  nl: (name, credits, period) => `${name} bevat ${credits} herstelcredits ${period}.`,
  pl: (name, credits, period) => `${name} obejmuje ${credits} kredytów odzyskiwania ${period}.`,
  "pt-BR": (name, credits, period) => `${name} inclui ${credits} créditos de recuperação ${period}.`,
  "pt-PT": (name, credits, period) => `${name} inclui ${credits} créditos de recuperação ${period}.`,
  sv: (name, credits, period) => `${name} innehåller ${credits} återvinningskrediter ${period}.`,
  th: (name, credits, period) => `${name} มีเครดิตกู้คืน ${credits} เครดิตสำหรับใช้งาน${period}`,
  tr: (name, credits, period) => `${name}, ${period} ${credits} kurtarma kredisi sağlar.`,
  "zh-Hans": (name, credits, period) => `${name} 提供 ${credits} 个${period}挽回积分。`,
  "zh-Hant": (name, credits, period) => `${name} 提供 ${credits} 個${period}挽回點數。`,
};

const PERIOD_COPY = {
  cs: { lifetime: "během životnosti obchodu", monthly: "každých 30 dní" },
  da: { lifetime: "i butikkens levetid", monthly: "hver 30. dag" },
  de: { lifetime: "einmalig pro Shop", monthly: "alle 30 Tage" },
  en: { lifetime: "for the shop lifetime", monthly: "every 30 days" },
  es: { lifetime: "durante la vida de la tienda", monthly: "cada 30 días" },
  fi: { lifetime: "kaupan elinkaaren ajaksi", monthly: "30 päivän välein" },
  fr: { lifetime: "pour toute la durée de vie de la boutique", monthly: "tous les 30 jours" },
  it: { lifetime: "per tutta la durata del negozio", monthly: "ogni 30 giorni" },
  ja: { lifetime: "ショップの存続期間中に一度", monthly: "30日ごとに" },
  ko: { lifetime: "상점 수명 동안", monthly: "30일마다" },
  nb: { lifetime: "for butikkens levetid", monthly: "hver 30. dag" },
  nl: { lifetime: "voor de levensduur van de winkel", monthly: "elke 30 dagen" },
  pl: { lifetime: "przez cały okres działania sklepu", monthly: "co 30 dni" },
  "pt-BR": { lifetime: "durante toda a vida da loja", monthly: "a cada 30 dias" },
  "pt-PT": { lifetime: "durante toda a vida da loja", monthly: "a cada 30 dias" },
  sv: { lifetime: "under butikens livstid", monthly: "var 30:e dag" },
  th: { lifetime: "ตลอดอายุการใช้งานของร้าน", monthly: "ทุก 30 วัน" },
  tr: { lifetime: "mağaza ömrü boyunca", monthly: "her 30 günde bir" },
  "zh-Hans": { lifetime: "店铺生命周期内一次性", monthly: "每 30 天" },
  "zh-Hant": { lifetime: "商店生命週期內一次性", monthly: "每 30 天" },
};

const USAGE_EVENT_DEFINITIONS = {
  free: [
    { eventHandle: "bronze-top-up-free", adminLabel: "Bronze Top Up Free", creditsGrantedPerUnit: 1, fixedUnitAmountMinor: 12000 },
    { eventHandle: "silver-top-up", adminLabel: "Silver Top Up", creditsGrantedPerUnit: 2, fixedUnitAmountMinor: 13000 },
    { eventHandle: "gold-top-up", adminLabel: "Gold Top Up", creditsGrantedPerUnit: 3, fixedUnitAmountMinor: 15000 },
  ],
  starter: [
    { eventHandle: "bronze-top-up-free", adminLabel: "Bronze Top Up Free", creditsGrantedPerUnit: 1, fixedUnitAmountMinor: 11000 },
    { eventHandle: "silver-top-up", adminLabel: "Silver Top Up", creditsGrantedPerUnit: 2, fixedUnitAmountMinor: 12500 },
    { eventHandle: "gold-top-up", adminLabel: "Gold Top Up", creditsGrantedPerUnit: 3, fixedUnitAmountMinor: 14000 },
  ],
  growth: [
    { eventHandle: "bronze-top-up-free", adminLabel: "Bronze Top Up Free", creditsGrantedPerUnit: 1, fixedUnitAmountMinor: 10400 },
    { eventHandle: "silver-top-up", adminLabel: "Silver Top Up", creditsGrantedPerUnit: 2, fixedUnitAmountMinor: 12000 },
    { eventHandle: "gold-top-up", adminLabel: "Gold Top Up", creditsGrantedPerUnit: 3, fixedUnitAmountMinor: 13500 },
  ],
  scale: [
    { eventHandle: "bronze-top-up-free", adminLabel: "Bronze Top Up Free", creditsGrantedPerUnit: 1, fixedUnitAmountMinor: 2500 },
    { eventHandle: "silver-top-up", adminLabel: "Silver Top Up", creditsGrantedPerUnit: 2, fixedUnitAmountMinor: 4000 },
    { eventHandle: "gold-top-up", adminLabel: "Gold Top Up", creditsGrantedPerUnit: 3, fixedUnitAmountMinor: 5000 },
  ],
};

const PLAN_DEFINITIONS = {
  free: {
    id: `${SEEDED_ID_PREFIX}free`,
    shopifyPlanHandle: "free",
    displayName: "Free",
    planKind: "FREE",
    isActive: true,
    cataloguePosition: 0,
    featured: false,
    // The operational 5-credit shop-lifetime grant lives in PlatformBillingPolicy.
    // This catalogue value is 0 so the current hard portfolio rule remains strictly
    // increasing when the paid test allowances below are intentionally tiny (2/5/6).
    includedRecoveryCredits: 0,
    allowancePeriod: "LIFETIME",
    billingPeriod: "EVERY_30_DAYS",
    recurringAmountMinor: 0,
    currency: "GBP",
    screenshotDescription: "Perfect for testing Moda Interact on live abandoned checkouts.",
  },
  starter: {
    id: `${SEEDED_ID_PREFIX}starter`,
    shopifyPlanHandle: "starter",
    displayName: "Starter",
    planKind: "PAID_METERED",
    isActive: true,
    cataloguePosition: 1,
    featured: true,
    includedRecoveryCredits: 2,
    allowancePeriod: "EVERY_30_DAYS",
    billingPeriod: "EVERY_30_DAYS",
    recurringAmountMinor: 3500,
    currency: "GBP",
    screenshotDescription: "For smaller stores starting automated WhatsApp checkout recovery.",
  },
  growth: {
    id: `${SEEDED_ID_PREFIX}growth`,
    shopifyPlanHandle: "growth",
    displayName: "Growth",
    planKind: "PAID_METERED",
    isActive: true,
    cataloguePosition: 2,
    featured: false,
    includedRecoveryCredits: 5,
    allowancePeriod: "EVERY_30_DAYS",
    billingPeriod: "EVERY_30_DAYS",
    recurringAmountMinor: 7500,
    currency: "GBP",
    screenshotDescription: "For growing stores recovering more abandoned checkouts each month.",
  },
  scale: {
    id: `${SEEDED_ID_PREFIX}scale`,
    shopifyPlanHandle: "scale",
    displayName: "Scale",
    planKind: "PAID_METERED",
    isActive: true,
    cataloguePosition: 3,
    featured: false,
    includedRecoveryCredits: 6,
    allowancePeriod: "EVERY_30_DAYS",
    billingPeriod: "EVERY_30_DAYS",
    recurringAmountMinor: 14900,
    currency: "GBP",
    screenshotDescription: "For higher-volume stores running WhatsApp recovery at scale.",
  },
};

function usage() {
  return `
Manual MerchantPricing test catalogue seeder

Usage:
  node scripts/seed-manual-merchant-pricing.mjs status

  node scripts/seed-manual-merchant-pricing.mjs seed free    --confirm-test-data
  node scripts/seed-manual-merchant-pricing.mjs seed starter --confirm-test-data
  node scripts/seed-manual-merchant-pricing.mjs seed growth  --confirm-test-data
  node scripts/seed-manual-merchant-pricing.mjs seed scale   --confirm-test-data
  node scripts/seed-manual-merchant-pricing.mjs seed next    --confirm-test-data
  node scripts/seed-manual-merchant-pricing.mjs seed all     --confirm-test-data

  node scripts/seed-manual-merchant-pricing.mjs delete scale   --confirm-test-data
  node scripts/seed-manual-merchant-pricing.mjs delete growth  --confirm-test-data
  node scripts/seed-manual-merchant-pricing.mjs delete starter --confirm-test-data
  node scripts/seed-manual-merchant-pricing.mjs delete free    --confirm-test-data
  node scripts/seed-manual-merchant-pricing.mjs delete last    --confirm-test-data
  node scripts/seed-manual-merchant-pricing.mjs delete all     --confirm-test-data

Safety:
  Every mutation requires --confirm-test-data.
  The script owns only deterministic MerchantPricingPlan IDs beginning with:
    ${SEEDED_ID_PREFIX}
  It refuses to overwrite a same-handle plan with a different ID.
  It refuses normal deletion of a materialized MerchantPricingPlan.

  --force-materialized-test-data bypasses only that last MerchantPricingPlan
  safety check. It does NOT delete any BillingPlan or merchant billing history.
`.trim();
}

function money(minor) {
  return `£${(minor / 100).toFixed(2)}`;
}

function requireConfirmation() {
  if (!process.argv.includes(CONFIRM_FLAG)) {
    throw new Error(`Refusing to modify the database. Re-run with ${CONFIRM_FLAG}.`);
  }
}

function seededId(key) {
  return `${SEEDED_ID_PREFIX}${key}`;
}

function translationsFor(plan) {
  return LOCALES.map((locale) => {
    if (locale === "en") {
      return { locale, merchantDescription: plan.screenshotDescription };
    }
    const periodKey = plan.planKind === "FREE" ? "lifetime" : "monthly";
    return {
      locale,
      merchantDescription: COPY[locale](
        plan.displayName,
        plan.includedRecoveryCredits,
        PERIOD_COPY[locale][periodKey],
      ),
    };
  });
}

function usageEventsFor(key) {
  return USAGE_EVENT_DEFINITIONS[key].map((event, position) => ({
    ...event,
    position,
    pricingMode: "FIXED",
    currency: "GBP",
    maximumUnitsPerBillingPeriod: null,
  }));
}

function cheapestFixedTopUpCost(events, creditsNeeded) {
  if (creditsNeeded <= 0) return 0;
  const maxCredits = Math.max(...events.map((event) => event.creditsGrantedPerUnit));
  const bound = creditsNeeded + maxCredits;
  const costs = Array(bound + 1).fill(Number.POSITIVE_INFINITY);
  costs[0] = 0;

  for (let current = 0; current <= bound; current += 1) {
    if (!Number.isFinite(costs[current])) continue;
    for (const event of events) {
      const next = Math.min(bound, current + event.creditsGrantedPerUnit);
      costs[next] = Math.min(costs[next], costs[current] + event.fixedUnitAmountMinor);
    }
  }

  return Math.min(...costs.slice(creditsNeeded));
}

function validateStaticPlan(planKey) {
  const plan = PLAN_DEFINITIONS[planKey];
  const events = usageEventsFor(planKey);

  if (!Number.isSafeInteger(plan.includedRecoveryCredits) || plan.includedRecoveryCredits < 0) {
    throw new Error(`${plan.displayName}: includedRecoveryCredits is invalid.`);
  }
  if (!Number.isSafeInteger(plan.recurringAmountMinor) || plan.recurringAmountMinor < 0) {
    throw new Error(`${plan.displayName}: recurringAmountMinor is invalid.`);
  }
  if (events.length !== 3) {
    throw new Error(`${plan.displayName}: exactly three usage events are required.`);
  }

  const seen = new Set();
  for (const event of events) {
    if (seen.has(event.eventHandle)) throw new Error(`${plan.displayName}: duplicate usage event ${event.eventHandle}.`);
    seen.add(event.eventHandle);
    if (!Number.isSafeInteger(event.creditsGrantedPerUnit) || event.creditsGrantedPerUnit <= 0) {
      throw new Error(`${plan.displayName}/${event.eventHandle}: creditsGrantedPerUnit must be positive.`);
    }
    if (!Number.isSafeInteger(event.fixedUnitAmountMinor) || event.fixedUnitAmountMinor <= 0) {
      throw new Error(`${plan.displayName}/${event.eventHandle}: test pricing must be positive.`);
    }
  }
}

function validatePortfolio(planKeys, minimumUpgradePremiumBps) {
  const ordered = PLAN_ORDER.filter((key) => planKeys.includes(key));
  for (const key of ordered) validateStaticPlan(key);

  for (let lowerIndex = 0; lowerIndex < ordered.length - 1; lowerIndex += 1) {
    const lowerKey = ordered[lowerIndex];
    const lower = PLAN_DEFINITIONS[lowerKey];
    for (let higherIndex = lowerIndex + 1; higherIndex < ordered.length; higherIndex += 1) {
      const higherKey = ordered[higherIndex];
      const higher = PLAN_DEFINITIONS[higherKey];
      const delta = higher.includedRecoveryCredits - lower.includedRecoveryCredits;
      if (delta <= 0) {
        throw new Error(
          `Hard economics failure: ${lower.displayName} -> ${higher.displayName} has non-increasing included credits (${lower.includedRecoveryCredits} -> ${higher.includedRecoveryCredits}).`,
        );
      }

      const topUpCostMinor = cheapestFixedTopUpCost(usageEventsFor(lowerKey), delta);
      const stayAndTopUpMinor = lower.recurringAmountMinor + topUpCostMinor;
      const requiredMinor = Math.ceil(
        (higher.recurringAmountMinor * (10_000 + minimumUpgradePremiumBps)) / 10_000,
      );
      if (stayAndTopUpMinor < requiredMinor) {
        throw new Error(
          `Economics failure: ${lower.displayName} -> ${higher.displayName}: stay+top-up ${money(stayAndTopUpMinor)} < required ${money(requiredMinor)}.`,
        );
      }
    }
  }
}

async function ensureFeatureCatalogue(transaction) {
  for (const feature of FEATURE_DEFINITIONS) {
    await transaction.feature.upsert({
      where: { key: feature.key },
      create: feature,
      update: {
        displayName: feature.displayName,
        description: feature.description,
        activationMode: feature.activationMode,
        systemRequired: feature.systemRequired,
        active: feature.active,
      },
    });
  }
}

async function loadSeedState() {
  const plans = await prisma.merchantPricingPlan.findMany({
    where: { id: { startsWith: SEEDED_ID_PREFIX } },
    include: {
      features: { include: { feature: true } },
      usageEvents: { orderBy: { position: "asc" } },
      translations: true,
    },
    orderBy: { cataloguePosition: "asc" },
  });
  return plans;
}

async function assertNoForeignHandleCollision(key) {
  const plan = PLAN_DEFINITIONS[key];
  const existing = await prisma.merchantPricingPlan.findUnique({
    where: { shopifyPlanHandle: plan.shopifyPlanHandle },
    select: { id: true, displayName: true },
  });
  if (existing && existing.id !== plan.id) {
    throw new Error(
      `Refusing to overwrite existing MerchantPricingPlan handle ${plan.shopifyPlanHandle} owned by ${existing.id} (${existing.displayName}).`,
    );
  }
}

async function assertCatalogueContainsOnlySeedPlans() {
  const foreign = await prisma.merchantPricingPlan.findMany({
    where: { NOT: { id: { startsWith: SEEDED_ID_PREFIX } } },
    select: { id: true, shopifyPlanHandle: true, displayName: true },
  });
  if (foreign.length) {
    throw new Error(
      `Refusing to mix this deterministic manual-test catalogue with ${foreign.length} existing MerchantPricingPlan row(s): ${foreign
        .slice(0, 5)
        .map((plan) => `${plan.shopifyPlanHandle}(${plan.id})`)
        .join(", ")}.`,
    );
  }
}

async function currentMinimumUpgradePremiumBps() {
  const policy = await prisma.platformBillingPolicy.findUnique({
    where: { id: "default" },
    select: { minimumUpgradePremiumBps: true, lifetimeFreeRecoveryAllowance: true },
  });
  return {
    minimumUpgradePremiumBps: policy?.minimumUpgradePremiumBps ?? 2000,
    lifetimeFreeRecoveryAllowance: policy?.lifetimeFreeRecoveryAllowance ?? null,
  };
}

async function reindexSeedPlans(transaction) {
  const rows = await transaction.merchantPricingPlan.findMany({
    where: { id: { startsWith: SEEDED_ID_PREFIX } },
    select: { id: true, shopifyPlanHandle: true },
  });
  const byHandle = new Map(rows.map((row) => [row.shopifyPlanHandle, row]));
  let position = 0;
  for (const key of PLAN_ORDER) {
    const row = byHandle.get(key);
    if (!row) continue;
    await transaction.merchantPricingPlan.update({
      where: { id: row.id },
      data: { cataloguePosition: position },
    });
    position += 1;
  }
}

async function seedOne(key) {
  requireConfirmation();
  if (!PLAN_ORDER.includes(key)) throw new Error(`Unknown plan: ${key}`);

  await assertCatalogueContainsOnlySeedPlans();
  await assertNoForeignHandleCollision(key);

  const keyIndex = PLAN_ORDER.indexOf(key);
  const prerequisites = PLAN_ORDER.slice(0, keyIndex);
  const existing = await loadSeedState();
  const existingHandles = new Set(existing.map((plan) => plan.shopifyPlanHandle));
  const missing = prerequisites.filter((required) => !existingHandles.has(required));
  if (missing.length) {
    throw new Error(`Seed ${missing.join(", ")} first. Required order: ${PLAN_ORDER.join(" -> ")}.`);
  }

  const selectedHandles = [...new Set([...existingHandles, key])];
  const policy = await currentMinimumUpgradePremiumBps();
  validatePortfolio(selectedHandles, policy.minimumUpgradePremiumBps);

  const plan = PLAN_DEFINITIONS[key];
  const translations = translationsFor(plan);
  const usageEvents = usageEventsFor(key);

  await prisma.$transaction(async (transaction) => {
    await ensureFeatureCatalogue(transaction);

    const current = await transaction.merchantPricingPlan.findUnique({
      where: { id: plan.id },
      select: { materializedAt: true },
    });
    if (current?.materializedAt) {
      throw new Error(
        `${plan.displayName} is already materialized (${current.materializedAt.toISOString()}); refusing to rewrite durable pricing test data.`,
      );
    }

    await transaction.merchantPricingPlan.upsert({
      where: { id: plan.id },
      create: {
        id: plan.id,
        shopifyPlanHandle: plan.shopifyPlanHandle,
        displayName: plan.displayName,
        planKind: plan.planKind,
        isActive: plan.isActive,
        cataloguePosition: plan.cataloguePosition,
        featured: plan.featured,
        includedRecoveryCredits: plan.includedRecoveryCredits,
        allowancePeriod: plan.allowancePeriod,
        billingPeriod: plan.billingPeriod,
        recurringAmountMinor: plan.recurringAmountMinor,
        currency: plan.currency,
        economicsOverrideEnabled: false,
        economicsOverrideReason: null,
        economicsOverrideApprovedAt: null,
        economicsOverrideApprovedByAdminId: null,
        economicsOverrideFailureCodes: [],
        economicsOverrideFingerprint: null,
        shopifyRecoveryUsageEventHandle: null,
        materializedAt: null,
        translations: { create: translations },
        usageEvents: { create: usageEvents },
        features: {
          create: FEATURE_DEFINITIONS.map((feature) => ({
            feature: { connect: { key: feature.key } },
          })),
        },
      },
      update: {
        displayName: plan.displayName,
        planKind: plan.planKind,
        isActive: plan.isActive,
        featured: plan.featured,
        includedRecoveryCredits: plan.includedRecoveryCredits,
        allowancePeriod: plan.allowancePeriod,
        billingPeriod: plan.billingPeriod,
        recurringAmountMinor: plan.recurringAmountMinor,
        currency: plan.currency,
        economicsOverrideEnabled: false,
        economicsOverrideReason: null,
        economicsOverrideApprovedAt: null,
        economicsOverrideApprovedByAdminId: null,
        economicsOverrideFailureCodes: [],
        economicsOverrideFingerprint: null,
        shopifyRecoveryUsageEventHandle: null,
        translations: {
          deleteMany: {},
          create: translations,
        },
        usageEvents: {
          deleteMany: {},
          create: usageEvents,
        },
        features: {
          deleteMany: {},
          create: FEATURE_DEFINITIONS.map((feature) => ({
            feature: { connect: { key: feature.key } },
          })),
        },
      },
    });

    await reindexSeedPlans(transaction);
  }, TRANSACTION_OPTIONS);

  console.log(`Seeded ${plan.displayName}.`);
  console.log(`  recurring: ${money(plan.recurringAmountMinor)} / 30 days`);
  console.log(`  included catalogue credits: ${plan.includedRecoveryCredits}`);
  console.log(`  features: ${FEATURE_DEFINITIONS.map((feature) => feature.displayName).join(", ")}`);
  for (const event of usageEvents) {
    console.log(
      `  usage: ${event.eventHandle} | ${event.adminLabel} | ${event.creditsGrantedPerUnit} credit(s) | ${money(event.fixedUnitAmountMinor)}`,
    );
  }
}

async function seedTarget(target) {
  if (target === "all") {
    for (const key of PLAN_ORDER) await seedOne(key);
    return;
  }

  if (target === "next") {
    const existing = new Set((await loadSeedState()).map((plan) => plan.shopifyPlanHandle));
    const next = PLAN_ORDER.find((key) => !existing.has(key));
    if (!next) {
      console.log("All four manual-test MerchantPricing plans are already seeded.");
      return;
    }
    await seedOne(next);
    return;
  }

  await seedOne(target);
}

async function deleteOne(key) {
  requireConfirmation();
  if (!PLAN_ORDER.includes(key)) throw new Error(`Unknown plan: ${key}`);

  const plan = await prisma.merchantPricingPlan.findUnique({
    where: { id: seededId(key) },
    select: { id: true, displayName: true, materializedAt: true },
  });
  if (!plan) {
    console.log(`${key}: no owned seed row exists.`);
    return;
  }

  if (plan.materializedAt && !process.argv.includes(FORCE_MATERIALIZED_FLAG)) {
    throw new Error(
      `${plan.displayName} was materialized at ${plan.materializedAt.toISOString()}. ` +
        `Normal cleanup refuses to delete durable catalogue identity. If this is disposable test data, re-run with ${FORCE_MATERIALIZED_FLAG}.`,
    );
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.merchantPricingPlan.delete({ where: { id: plan.id } });
    await reindexSeedPlans(transaction);
  }, TRANSACTION_OPTIONS);

  console.log(`Deleted ${plan.displayName} MerchantPricing test seed.`);
  if (plan.materializedAt) {
    console.warn(
      "WARNING: only MerchantPricingPlan test data was deleted. Any materialized BillingPlan and merchant billing history remain durable and were not deleted.",
    );
  }
}

async function assertDeleteTargetsSafe(keys) {
  const rows = await prisma.merchantPricingPlan.findMany({
    where: { id: { in: keys.map(seededId) } },
    select: { shopifyPlanHandle: true, displayName: true, materializedAt: true },
  });

  if (process.argv.includes(FORCE_MATERIALIZED_FLAG)) return;

  const materialized = rows.filter((row) => row.materializedAt);
  if (materialized.length) {
    throw new Error(
      `Refusing cleanup because ${materialized.map((row) => row.displayName).join(", ")} ` +
        `is materialized. Re-run with ${FORCE_MATERIALIZED_FLAG} only for disposable test data.`,
    );
  }
}

async function deleteTarget(target) {
  if (target === "all") {
    await assertDeleteTargetsSafe(PLAN_ORDER);
    for (const key of [...PLAN_ORDER].reverse()) await deleteOne(key);
    return;
  }

  if (target === "last") {
    const existing = new Set((await loadSeedState()).map((plan) => plan.shopifyPlanHandle));
    const last = [...PLAN_ORDER].reverse().find((key) => existing.has(key));
    if (!last) {
      console.log("No owned manual-test MerchantPricing plans exist.");
      return;
    }
    await deleteOne(last);
    return;
  }

  await deleteOne(target);
}

async function status() {
  const policy = await currentMinimumUpgradePremiumBps();
  const rows = await loadSeedState();

  console.log("Manual MerchantPricing test catalogue");
  console.log("====================================");
  console.log(`minimum upgrade premium: ${(policy.minimumUpgradePremiumBps / 100).toFixed(2)}%`);
  console.log(
    `platform lifetime Free grant: ${policy.lifetimeFreeRecoveryAllowance ?? "not configured"}`,
  );
  console.log("");

  if (!rows.length) {
    console.log("No owned seed plans exist.");
    console.log("Next: seed free --confirm-test-data");
    return;
  }

  console.table(
    rows.map((plan) => ({
      position: plan.cataloguePosition,
      handle: plan.shopifyPlanHandle,
      name: plan.displayName,
      active: plan.isActive,
      featured: plan.featured,
      included: plan.includedRecoveryCredits,
      recurring: money(plan.recurringAmountMinor),
      features: plan.features.map(({ feature }) => feature.key).join(", "),
      usageEvents: plan.usageEvents.length,
      translations: plan.translations.length,
      materialized: plan.materializedAt ? "yes" : "no",
    })),
  );

  const handles = rows.map((plan) => plan.shopifyPlanHandle);
  validatePortfolio(handles, policy.minimumUpgradePremiumBps);
  console.log("Economics validation: PASS for the currently seeded ordered portfolio.");

  const missing = PLAN_ORDER.find((key) => !handles.includes(key));
  console.log(missing ? `Next: seed ${missing} --confirm-test-data` : "All four plans are seeded.");
}

async function main() {
  const args = process.argv.slice(2).filter(
    (arg) => arg !== CONFIRM_FLAG && arg !== FORCE_MATERIALIZED_FLAG,
  );
  const [command = "status", target] = args;

  if (command === "-h" || command === "--help" || command === "help") {
    console.log(usage());
    return;
  }
  if (command === "status") {
    await status();
    return;
  }
  if (command === "seed") {
    if (!target) throw new Error(`Missing seed target.\n\n${usage()}`);
    await seedTarget(target);
    return;
  }
  if (command === "delete") {
    if (!target) throw new Error(`Missing delete target.\n\n${usage()}`);
    await deleteTarget(target);
    return;
  }

  throw new Error(`Unknown command: ${command}\n\n${usage()}`);
}

main()
  .catch((error) => {
    console.error(`seed-manual-merchant-pricing: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
