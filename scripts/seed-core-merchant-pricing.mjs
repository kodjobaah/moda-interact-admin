#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import process from "node:process";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CONFIRM_FLAG = "--confirm-test-data";
const HANDLE_PREFIX = "";
const LOCALES = [
  "cs", "da", "de", "en", "es", "fi", "fr", "it", "ja", "ko",
  "nb", "nl", "pl", "pt-BR", "pt-PT", "sv", "th", "tr", "zh-Hans", "zh-Hant",
];

const COPY = {
  cs: {
    description: (name, credits) => `${name} obsahuje ${credits} kreditů pro obnovu opuštěných košíků a je určen pro obchodníky, kteří chtějí předvídatelnou kapacitu pro konverzace se zákazníky.`,
    includedTitle: "Zahrnuté kredity pro obnovu",
    includedDescription: (credits) => `${credits} kreditů pro obnovu je zahrnuto v tomto plánu.`,
    topupTitle: "Flexibilní navýšení",
    topupDescription: () => "Když potřebujete větší kapacitu, můžete dokoupit balíčky po 5, 10 nebo 20 kreditech.",
  },
  da: {
    description: (name, credits) => `${name} indeholder ${credits} recovery-kreditter til forladte kurve og er lavet til butikker, der ønsker forudsigelig kapacitet til kundedialoger.`,
    includedTitle: "Inkluderede recovery-kreditter",
    includedDescription: (credits) => `${credits} recovery-kreditter er inkluderet i denne plan.`,
    topupTitle: "Fleksible ekstra kreditter",
    topupDescription: () => "Køb ekstra pakker med 5, 10 eller 20 kreditter, når du har brug for mere kapacitet.",
  },
  de: {
    description: (name, credits) => `${name} enthält ${credits} Recovery-Credits für abgebrochene Warenkörbe und bietet Händlern planbare Kapazität für Kundengespräche.`,
    includedTitle: "Enthaltene Recovery-Credits",
    includedDescription: (credits) => `${credits} Recovery-Credits sind in diesem Tarif enthalten.`,
    topupTitle: "Flexible Zusatz-Credits",
    topupDescription: () => "Bei höherem Bedarf können zusätzliche Pakete mit 5, 10 oder 20 Credits erworben werden.",
  },
  en: {
    description: (name, credits) => `${name} includes ${credits} recovery credits for abandoned-cart conversations and is designed for merchants who want predictable recovery capacity as they grow.`,
    includedTitle: "Included recovery credits",
    includedDescription: (credits) => `${credits} recovery credits are included with this plan.`,
    topupTitle: "Flexible top-ups",
    topupDescription: () => "Buy additional packs of 5, 10, or 20 recovery credits when you need extra capacity.",
  },
  es: {
    description: (name, credits) => `${name} incluye ${credits} créditos de recuperación para conversaciones sobre carritos abandonados y ofrece una capacidad predecible a medida que crece el comercio.`,
    includedTitle: "Créditos de recuperación incluidos",
    includedDescription: (credits) => `Este plan incluye ${credits} créditos de recuperación.`,
    topupTitle: "Recargas flexibles",
    topupDescription: () => "Compra paquetes adicionales de 5, 10 o 20 créditos cuando necesites más capacidad.",
  },
  fi: {
    description: (name, credits) => `${name} sisältää ${credits} palautuskrediittiä hylättyjen ostoskorien keskusteluihin ja tarjoaa ennakoitavaa kapasiteettia kasvaville kauppiaille.`,
    includedTitle: "Sisältyvät palautuskrediitit",
    includedDescription: (credits) => `Tähän pakettiin sisältyy ${credits} palautuskrediittiä.`,
    topupTitle: "Joustavat lisäkrediitit",
    topupDescription: () => "Osta tarvittaessa 5, 10 tai 20 krediitin lisäpaketteja.",
  },
  fr: {
    description: (name, credits) => `${name} comprend ${credits} crédits de récupération pour les conversations liées aux paniers abandonnés et offre une capacité prévisible à mesure que votre activité se développe.`,
    includedTitle: "Crédits de récupération inclus",
    includedDescription: (credits) => `${credits} crédits de récupération sont inclus dans cette offre.`,
    topupTitle: "Recharges flexibles",
    topupDescription: () => "Achetez des lots supplémentaires de 5, 10 ou 20 crédits lorsque vous avez besoin de plus de capacité.",
  },
  it: {
    description: (name, credits) => `${name} include ${credits} crediti di recupero per le conversazioni sui carrelli abbandonati e offre capacità prevedibile durante la crescita del negozio.`,
    includedTitle: "Crediti di recupero inclusi",
    includedDescription: (credits) => `Questo piano include ${credits} crediti di recupero.`,
    topupTitle: "Ricariche flessibili",
    topupDescription: () => "Acquista pacchetti aggiuntivi da 5, 10 o 20 crediti quando serve più capacità.",
  },
  ja: {
    description: (name, credits) => `${name} には、カゴ落ち顧客との会話に使えるリカバリークレジットが ${credits} 件含まれ、成長に合わせて予測しやすい運用容量を提供します。`,
    includedTitle: "含まれるリカバリークレジット",
    includedDescription: (credits) => `このプランには ${credits} 件のリカバリークレジットが含まれます。`,
    topupTitle: "柔軟な追加クレジット",
    topupDescription: () => "容量が必要なときに 5、10、20 クレジットの追加パックを購入できます。",
  },
  ko: {
    description: (name, credits) => `${name} 요금제에는 장바구니 이탈 고객 대화를 위한 복구 크레딧 ${credits}개가 포함되며 성장에 맞춰 예측 가능한 용량을 제공합니다.`,
    includedTitle: "포함된 복구 크레딧",
    includedDescription: (credits) => `이 요금제에는 복구 크레딧 ${credits}개가 포함됩니다.`,
    topupTitle: "유연한 추가 충전",
    topupDescription: () => "추가 용량이 필요할 때 5, 10 또는 20 크레딧 팩을 구매할 수 있습니다.",
  },
  nb: {
    description: (name, credits) => `${name} inkluderer ${credits} recovery-kreditter for samtaler om forlatte handlekurver og gir forutsigbar kapasitet når butikken vokser.`,
    includedTitle: "Inkluderte recovery-kreditter",
    includedDescription: (credits) => `${credits} recovery-kreditter er inkludert i denne planen.`,
    topupTitle: "Fleksible påfyll",
    topupDescription: () => "Kjøp ekstra pakker med 5, 10 eller 20 kreditter når du trenger mer kapasitet.",
  },
  nl: {
    description: (name, credits) => `${name} bevat ${credits} herstelcredits voor gesprekken over verlaten winkelwagens en biedt voorspelbare capaciteit terwijl je winkel groeit.`,
    includedTitle: "Inbegrepen herstelcredits",
    includedDescription: (credits) => `${credits} herstelcredits zijn inbegrepen bij dit plan.`,
    topupTitle: "Flexibele extra credits",
    topupDescription: () => "Koop extra pakketten van 5, 10 of 20 credits wanneer je meer capaciteit nodig hebt.",
  },
  pl: {
    description: (name, credits) => `${name} obejmuje ${credits} kredytów odzyskiwania dla rozmów o porzuconych koszykach i zapewnia przewidywalną pojemność wraz ze wzrostem sklepu.`,
    includedTitle: "Kredyty odzyskiwania w planie",
    includedDescription: (credits) => `Ten plan obejmuje ${credits} kredytów odzyskiwania.`,
    topupTitle: "Elastyczne doładowania",
    topupDescription: () => "W razie potrzeby kup dodatkowe pakiety po 5, 10 lub 20 kredytów.",
  },
  "pt-BR": {
    description: (name, credits) => `${name} inclui ${credits} créditos de recuperação para conversas de carrinho abandonado e oferece capacidade previsível conforme a loja cresce.`,
    includedTitle: "Créditos de recuperação incluídos",
    includedDescription: (credits) => `Este plano inclui ${credits} créditos de recuperação.`,
    topupTitle: "Recargas flexíveis",
    topupDescription: () => "Compre pacotes adicionais de 5, 10 ou 20 créditos quando precisar de mais capacidade.",
  },
  "pt-PT": {
    description: (name, credits) => `${name} inclui ${credits} créditos de recuperação para conversas de carrinho abandonado e oferece capacidade previsível à medida que a loja cresce.`,
    includedTitle: "Créditos de recuperação incluídos",
    includedDescription: (credits) => `Este plano inclui ${credits} créditos de recuperação.`,
    topupTitle: "Recargas flexíveis",
    topupDescription: () => "Compre pacotes adicionais de 5, 10 ou 20 créditos quando precisar de mais capacidade.",
  },
  sv: {
    description: (name, credits) => `${name} innehåller ${credits} återvinningskrediter för samtal om övergivna kundvagnar och ger förutsägbar kapacitet när butiken växer.`,
    includedTitle: "Inkluderade återvinningskrediter",
    includedDescription: (credits) => `${credits} återvinningskrediter ingår i planen.`,
    topupTitle: "Flexibla påfyllningar",
    topupDescription: () => "Köp extra paket med 5, 10 eller 20 krediter när du behöver mer kapacitet.",
  },
  th: {
    description: (name, credits) => `${name} มีเครดิตกู้คืน ${credits} เครดิตสำหรับการสนทนาเกี่ยวกับตะกร้าที่ถูกละทิ้ง และช่วยให้ร้านค้าวางแผนความจุได้อย่างคาดการณ์ได้เมื่อเติบโตขึ้น`,
    includedTitle: "เครดิตกู้คืนที่รวมอยู่",
    includedDescription: (credits) => `แผนนี้รวมเครดิตกู้คืน ${credits} เครดิต`,
    topupTitle: "เติมเครดิตได้ยืดหยุ่น",
    topupDescription: () => "ซื้อแพ็กเพิ่มขนาด 5, 10 หรือ 20 เครดิตเมื่อคุณต้องการความจุเพิ่ม",
  },
  tr: {
    description: (name, credits) => `${name}, terk edilmiş sepet görüşmeleri için ${credits} kurtarma kredisi içerir ve mağaza büyüdükçe öngörülebilir kapasite sağlar.`,
    includedTitle: "Dahil kurtarma kredileri",
    includedDescription: (credits) => `Bu planda ${credits} kurtarma kredisi dahildir.`,
    topupTitle: "Esnek ek krediler",
    topupDescription: () => "Daha fazla kapasite gerektiğinde 5, 10 veya 20 kredilik ek paketler satın alın.",
  },
  "zh-Hans": {
    description: (name, credits) => `${name} 包含 ${credits} 个购物车挽回积分，用于与弃购客户沟通，并随着商店增长提供可预测的容量。`,
    includedTitle: "包含的挽回积分",
    includedDescription: (credits) => `此方案包含 ${credits} 个挽回积分。`,
    topupTitle: "灵活加购",
    topupDescription: () => "需要更多容量时，可购买含 5、10 或 20 个积分的额外包。",
  },
  "zh-Hant": {
    description: (name, credits) => `${name} 包含 ${credits} 個購物車挽回點數，用於與棄購顧客溝通，並隨商店成長提供可預測的容量。`,
    includedTitle: "包含的挽回點數",
    includedDescription: (credits) => `此方案包含 ${credits} 個挽回點數。`,
    topupTitle: "彈性加購",
    topupDescription: () => "需要更多容量時，可購買含 5、10 或 20 個點數的額外包。",
  },
};

// These Shopify billing-event handles are shared by all four public plans.
// Amounts are deliberately supplied from the actual Shopify pricing configuration;
// the Partner Dashboard screenshot shows handles but not per-plan meter rates.
const TOP_UP_BUNDLES = Object.freeze([
  { handle: "bronze-top-up-free", label: "Bronze", credits: 5, position: 0 },
  { handle: "silver-top-up", label: "Silver", credits: 10, position: 1 },
  { handle: "gold-top-up", label: "Gold", credits: 20, position: 2 },
]);

const PLANS = [
  { handle: "free", name: "Free", position: 0, credits: 2, price: 0, active: true, featured: false },
  { handle: "starter", name: "Starter", position: 1, credits: 10, price: 3500, active: true, featured: false },
  { handle: "growth", name: "Growth", position: 2, credits: 25, price: 7500, active: true, featured: true },
  { handle: "scale", name: "Scale", position: 3, credits: 50, price: 14900, active: true, featured: false },
];

function usage() {
  return `Core MerchantPricing seeder

Usage:
  node scripts/seed-core-merchant-pricing.mjs --help
  node scripts/seed-core-merchant-pricing.mjs --confirm-test-data --top-up-prices-file ./shopify-top-up-prices.json

Seeds the exact Shopify handles free, starter, growth and scale.
Every plan uses the same three usage-event handles: bronze-top-up-free,
silver-top-up and gold-top-up, granting 5, 10 and 20 credits respectively.

The pricing JSON must specify the positive unit price in USD minor units for each
handle in EACH plan. Missing prices are rejected; no Shopify prices are guessed.
Existing conflicting plans are not overwritten, reset or reordered.`;
}

function loadTopUpPrices() {
  const flag = "--top-up-prices-file";
  const flagIndices = process.argv.flatMap((value, index) => value === flag ? [index] : []);
  if (flagIndices.length !== 1 || !process.argv[flagIndices[0] + 1] || process.argv[flagIndices[0] + 1].startsWith("--")) {
    throw new Error(`Supply exactly one ${flag} pointing to confirmed Shopify usage-meter rates.`);
  }
  const path = process.argv[flagIndices[0] + 1];
  const data = JSON.parse(readFileSync(path, "utf8"));
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Top-up pricing file must be an object keyed by Shopify plan handle.");
  }
  for (const planKey of Object.keys(data)) {
    if (!PLANS.some((plan) => plan.handle === planKey)) {
      throw new Error(`Unexpected plan in top-up pricing file: ${planKey}`);
    }
  }
  for (const plan of PLANS) {
    const rates = data[plan.handle];
    if (!rates || typeof rates !== "object" || Array.isArray(rates)) {
      throw new Error(`Missing top-up prices for Shopify plan ${plan.handle}`);
    }
    for (const handle of Object.keys(rates)) {
      if (!TOP_UP_BUNDLES.some((bundle) => bundle.handle === handle)) {
        throw new Error(`Unexpected usage event ${handle} in plan ${plan.handle}`);
      }
    }
    for (const bundle of TOP_UP_BUNDLES) {
      const amount = rates[bundle.handle];
      if (!Number.isSafeInteger(amount) || amount < 1 || amount > 2_147_483_647) {
        throw new Error(`Invalid or missing Shopify price for ${plan.handle}/${bundle.handle}; expected a positive integer in USD cents.`);
      }
    }
  }
  return data;
}

// Preserve the original upgrade-economics safeguard, but evaluate the cheapest
// available combination of all three top-ups rather than assuming one pack size.
function minimumTopUpCost(requiredCredits, rates) {
  const upperBound = requiredCredits + Math.max(...TOP_UP_BUNDLES.map((bundle) => bundle.credits)) - 1;
  const costs = Array(upperBound + 1).fill(Infinity);
  costs[0] = 0;
  for (let credits = 0; credits <= upperBound; credits += 1) {
    if (!Number.isFinite(costs[credits])) continue;
    for (const bundle of TOP_UP_BUNDLES) {
      const next = credits + bundle.credits;
      if (next <= upperBound) {
        costs[next] = Math.min(costs[next], costs[credits] + rates[bundle.handle]);
      }
    }
  }
  return Math.min(...costs.slice(requiredCredits));
}

function validateEconomics(plans, ratesByPlan, minimumUpgradePremiumBps) {
  for (let lowerIndex = 0; lowerIndex < plans.length - 1; lowerIndex += 1) {
    const lower = plans[lowerIndex];
    for (let higherIndex = lowerIndex + 1; higherIndex < plans.length; higherIndex += 1) {
      const higher = plans[higherIndex];
      if (higher.credits <= lower.credits) {
        throw new Error(`${higher.name} must include more credits than ${lower.name}.`);
      }
      // The two lifetime Free credits are granted once to every store,
      // regardless of subscription plan. They are not a recurring Free-plan
      // allowance and must not reduce the paid plan's periodic credit increment.
      const lowerRecurringCredits = lower.handle === "free" ? 0 : lower.credits;
      const neededCredits = higher.credits - lowerRecurringCredits;
      const actual = lower.price + minimumTopUpCost(neededCredits, ratesByPlan[lower.handle]);
      const required = Math.ceil((higher.price * (10_000 + minimumUpgradePremiumBps)) / 10_000);
      if (actual < required) {
        throw new Error(`Pricing economics failed for ${lower.name} -> ${higher.name}; compare published Shopify bundle prices.`);
      }
    }
  }
}

function translations(plan) {
  return LOCALES.map((locale) => ({
    locale,
    merchantDescription: COPY[locale].description(plan.name, plan.credits),
  }));
}

function highlights(plan) {
  const rows = [{ position: 0, kind: "included" }];
  rows.push({ position: 1, kind: "topup" });
  return rows.map((row) => ({
    contentKey: randomUUID(),
    position: row.position,
    translations: LOCALES.map((locale) => ({
      locale,
      merchantTitle: row.kind === "included" ? COPY[locale].includedTitle : COPY[locale].topupTitle,
      merchantDescription: row.kind === "included"
        ? COPY[locale].includedDescription(plan.credits)
        : COPY[locale].topupDescription(),
    })),
  }));
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(usage());
    return;
  }
  if (!process.argv.includes(CONFIRM_FLAG)) {
    throw new Error(
      `Refusing to modify the database. Re-run with ${CONFIRM_FLAG} after confirming this is a development/test database.`,
    );
  }

  const topUpPrices = loadTopUpPrices();

  const created = await prisma.$transaction(async (transaction) => {
    const handles = PLANS.map((plan) => `${HANDLE_PREFIX}${plan.handle}`);
    const positions = PLANS.map((plan) => plan.position);
    const occupied = await transaction.merchantPricingPlan.findMany({
      where: {
        OR: [
          { shopifyPlanHandle: { in: handles } },
          { cataloguePosition: { in: positions } },
        ],
      },
      select: {
        shopifyPlanHandle: true, cataloguePosition: true, displayName: true,
        planKind: true, includedRecoveryCredits: true, recurringAmountMinor: true,
        isActive: true, allowancePeriod: true, currency: true,
        usageEvents: {
          select: {
            eventHandle: true, creditsGrantedPerUnit: true, position: true,
            pricingMode: true, fixedUnitAmountMinor: true, currency: true,
          },
        },
      },
    });
    const alreadySeeded = occupied.length === PLANS.length && PLANS.every((plan) =>
      occupied.some((row) =>
        row.shopifyPlanHandle === `${HANDLE_PREFIX}${plan.handle}` &&
        row.cataloguePosition === plan.position &&
        row.displayName === plan.name &&
        row.planKind === (plan.handle === "free" ? "FREE" : "PAID_METERED") &&
        row.includedRecoveryCredits === plan.credits &&
        row.recurringAmountMinor === plan.price &&
        row.isActive === plan.active &&
        row.allowancePeriod === (plan.handle === "free" ? "LIFETIME" : "EVERY_30_DAYS") &&
        row.currency === "USD" &&
        row.usageEvents.length === TOP_UP_BUNDLES.length &&
        TOP_UP_BUNDLES.every((bundle) => row.usageEvents.some((usage) =>
          usage.eventHandle === bundle.handle &&
          usage.creditsGrantedPerUnit === bundle.credits &&
          usage.position === bundle.position &&
          usage.pricingMode === "FIXED" &&
          usage.fixedUnitAmountMinor === topUpPrices[plan.handle][bundle.handle] &&
          usage.currency === "USD"
        )),
      ),
    );
    if (alreadySeeded) return false;

    if (occupied.length) {
      const details = occupied
        .map((plan) => `${plan.shopifyPlanHandle} at ${plan.cataloguePosition} (${plan.displayName})`)
        .join(", ");
      throw new Error(
        `Refusing to overwrite or move existing plans (including plans whose Shopify prices, credits or active status differ); requested handles/positions are occupied: ${details}.`,
      );
    }

    const policy = await transaction.platformBillingPolicy.findUnique({
      where: { id: "default" },
      select: { minimumUpgradePremiumBps: true },
    });
    const minimumUpgradePremiumBps = policy?.minimumUpgradePremiumBps ?? 2000;
    const plans = PLANS.map((plan) => ({ ...plan }));
    validateEconomics(plans, topUpPrices, minimumUpgradePremiumBps);

    for (const plan of plans) {
      const planHighlights = highlights(plan);
      const isFree = plan.handle === "free";
      await transaction.merchantPricingPlan.create({
        data: {
          shopifyPlanHandle: `${HANDLE_PREFIX}${plan.handle}`,
          displayName: plan.name,
          planKind: isFree ? "FREE" : "PAID_METERED",
          isActive: plan.active,
          cataloguePosition: plan.position,
          featured: plan.featured,
          includedRecoveryCredits: plan.credits,
          allowancePeriod: isFree ? "LIFETIME" : "EVERY_30_DAYS",
          billingPeriod: "EVERY_30_DAYS",
          recurringAmountMinor: plan.price,
          currency: "USD",
          economicsOverrideEnabled: false,
          economicsOverrideReason: null,
          economicsOverrideApprovedAt: null,
          economicsOverrideApprovedByAdminId: null,
          economicsOverrideFailureCodes: [],
          economicsOverrideFingerprint: null,
          translations: { create: translations(plan) },
          highlights: {
            create: planHighlights.map((highlight) => ({
              contentKey: highlight.contentKey,
              position: highlight.position,
              translations: { create: highlight.translations },
            })),
          },
          usageEvents: {
            create: TOP_UP_BUNDLES.map((bundle) => ({
              eventHandle: bundle.handle,
              adminLabel: `${bundle.label} recovery-credit top-up`,
              creditsGrantedPerUnit: bundle.credits,
              position: bundle.position,
              pricingMode: "FIXED",
              currency: "USD",
              fixedUnitAmountMinor: topUpPrices[plan.handle][bundle.handle],
              maximumUnitsPerBillingPeriod: null,
            })),
          },
        },
        select: { displayName: true, cataloguePosition: true, recurringAmountMinor: true },
      });
      console.log(
        `Created ${plan.name} at position ${plan.position}: $${(plan.price / 100).toFixed(2)} / ${isFree ? "lifetime" : "30 days"}, ${plan.credits} included credits, three shared Shopify top-up meter handles (5, 10, 20 credits).`,
      );
    }

    return true;
  }, { maxWait: 10_000, timeout: 20_000 });

  if (!created) {
    console.log("The four core MerchantPricing plans already exist; no changes were made.");
    return;
  }

  console.log("Created exactly four MerchantPricing plans; no existing plans were modified.");
}

main()
  .catch((error) => {
    console.error(
      `seed-core-merchant-pricing: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
