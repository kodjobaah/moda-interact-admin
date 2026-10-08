#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import process from "node:process";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CONFIRM_FLAG = "--confirm-test-data";
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 20_000 };
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
  cs: {
    description: (name, credits) =>
      `${name} obsahuje ${credits} kreditů pro obnovu opuštěných košíků.`,
    includedTitle: "Zahrnuté kredity pro obnovu",
    includedDescription: (credits) =>
      `${credits} kreditů pro obnovu je zahrnuto v tomto plánu.`,
    topupTitle: "Flexibilní navýšení",
    topupDescription: (credits) =>
      `Dokupte další balíčky po ${credits} kreditech.`,
  },
  da: {
    description: (name, credits) =>
      `${name} indeholder ${credits} recovery-kreditter til forladte kurve.`,
    includedTitle: "Inkluderede recovery-kreditter",
    includedDescription: (credits) =>
      `${credits} recovery-kreditter er inkluderet i denne plan.`,
    topupTitle: "Fleksible ekstra kreditter",
    topupDescription: (credits) =>
      `Køb ekstra pakker med ${credits} kreditter.`,
  },
  de: {
    description: (name, credits) =>
      `${name} enthält ${credits} Recovery-Credits für abgebrochene Warenkörbe.`,
    includedTitle: "Enthaltene Recovery-Credits",
    includedDescription: (credits) =>
      `${credits} Recovery-Credits sind in diesem Tarif enthalten.`,
    topupTitle: "Flexible Zusatz-Credits",
    topupDescription: (credits) =>
      `Zusätzliche Pakete mit ${credits} Credits sind erhältlich.`,
  },
  en: {
    description: (name, credits) =>
      `${name} includes ${credits} recovery credits for abandoned-cart conversations and predictable recovery capacity.`,
    includedTitle: "Included recovery credits",
    includedDescription: (credits) =>
      `${credits} recovery credits are included with this plan.`,
    topupTitle: "Flexible top-ups",
    topupDescription: (credits) =>
      `Buy additional packs of ${credits} recovery credits when needed.`,
  },
  es: {
    description: (name, credits) =>
      `${name} incluye ${credits} créditos de recuperación para conversaciones sobre carritos abandonados.`,
    includedTitle: "Créditos de recuperación incluidos",
    includedDescription: (credits) =>
      `Este plan incluye ${credits} créditos de recuperación.`,
    topupTitle: "Recargas flexibles",
    topupDescription: (credits) =>
      `Compra paquetes adicionales de ${credits} créditos cuando los necesites.`,
  },
  fi: {
    description: (name, credits) =>
      `${name} sisältää ${credits} palautuskrediittiä hylättyjen ostoskorien keskusteluihin.`,
    includedTitle: "Sisältyvät palautuskrediitit",
    includedDescription: (credits) =>
      `Tähän pakettiin sisältyy ${credits} palautuskrediittiä.`,
    topupTitle: "Joustavat lisäkrediitit",
    topupDescription: (credits) =>
      `Osta tarvittaessa lisää ${credits} krediitin paketteja.`,
  },
  fr: {
    description: (name, credits) =>
      `${name} comprend ${credits} crédits de récupération pour les conversations liées aux paniers abandonnés.`,
    includedTitle: "Crédits de récupération inclus",
    includedDescription: (credits) =>
      `${credits} crédits de récupération sont inclus dans cette offre.`,
    topupTitle: "Recharges flexibles",
    topupDescription: (credits) =>
      `Achetez des lots supplémentaires de ${credits} crédits selon vos besoins.`,
  },
  it: {
    description: (name, credits) =>
      `${name} include ${credits} crediti di recupero per le conversazioni sui carrelli abbandonati.`,
    includedTitle: "Crediti di recupero inclusi",
    includedDescription: (credits) =>
      `Questo piano include ${credits} crediti di recupero.`,
    topupTitle: "Ricariche flessibili",
    topupDescription: (credits) =>
      `Acquista pacchetti aggiuntivi da ${credits} crediti quando serve.`,
  },
  ja: {
    description: (name, credits) =>
      `${name} には、カゴ落ち顧客との会話に使えるリカバリークレジットが ${credits} 件含まれます。`,
    includedTitle: "含まれるリカバリークレジット",
    includedDescription: (credits) =>
      `このプランには ${credits} 件のリカバリークレジットが含まれます。`,
    topupTitle: "柔軟な追加クレジット",
    topupDescription: (credits) =>
      `${credits} クレジット単位で追加購入できます。`,
  },
  ko: {
    description: (name, credits) =>
      `${name} 요금제에는 장바구니 이탈 고객 대화를 위한 복구 크레딧 ${credits}개가 포함됩니다.`,
    includedTitle: "포함된 복구 크레딧",
    includedDescription: (credits) =>
      `이 요금제에는 복구 크레딧 ${credits}개가 포함됩니다.`,
    topupTitle: "유연한 추가 충전",
    topupDescription: (credits) =>
      `${credits} 크레딧 단위의 패키지를 추가 구매할 수 있습니다.`,
  },
  nb: {
    description: (name, credits) =>
      `${name} inkluderer ${credits} recovery-kreditter for samtaler om forlatte handlekurver.`,
    includedTitle: "Inkluderte recovery-kreditter",
    includedDescription: (credits) =>
      `${credits} recovery-kreditter er inkludert i denne planen.`,
    topupTitle: "Fleksible påfyll",
    topupDescription: (credits) =>
      `Kjøp ekstra pakker med ${credits} kreditter når du trenger mer kapasitet.`,
  },
  nl: {
    description: (name, credits) =>
      `${name} bevat ${credits} herstelcredits voor gesprekken over verlaten winkelwagens.`,
    includedTitle: "Inbegrepen herstelcredits",
    includedDescription: (credits) =>
      `${credits} herstelcredits zijn inbegrepen bij dit plan.`,
    topupTitle: "Flexibele extra credits",
    topupDescription: (credits) =>
      `Koop extra pakketten van ${credits} credits wanneer je meer capaciteit nodig hebt.`,
  },
  pl: {
    description: (name, credits) =>
      `${name} obejmuje ${credits} kredytów odzyskiwania dla rozmów o porzuconych koszykach.`,
    includedTitle: "Kredyty odzyskiwania w planie",
    includedDescription: (credits) =>
      `Ten plan obejmuje ${credits} kredytów odzyskiwania.`,
    topupTitle: "Elastyczne doładowania",
    topupDescription: (credits) =>
      `W razie potrzeby kup dodatkowe pakiety po ${credits} kredytów.`,
  },
  "pt-BR": {
    description: (name, credits) =>
      `${name} inclui ${credits} créditos de recuperação para conversas de carrinho abandonado.`,
    includedTitle: "Créditos de recuperação incluídos",
    includedDescription: (credits) =>
      `Este plano inclui ${credits} créditos de recuperação.`,
    topupTitle: "Recargas flexíveis",
    topupDescription: (credits) =>
      `Compre pacotes adicionais de ${credits} créditos quando precisar.`,
  },
  "pt-PT": {
    description: (name, credits) =>
      `${name} inclui ${credits} créditos de recuperação para conversas de carrinho abandonado.`,
    includedTitle: "Créditos de recuperação incluídos",
    includedDescription: (credits) =>
      `Este plano inclui ${credits} créditos de recuperação.`,
    topupTitle: "Recargas flexíveis",
    topupDescription: (credits) =>
      `Compre pacotes adicionais de ${credits} créditos quando precisar.`,
  },
  sv: {
    description: (name, credits) =>
      `${name} innehåller ${credits} återvinningskrediter för samtal om övergivna kundvagnar.`,
    includedTitle: "Inkluderade återvinningskrediter",
    includedDescription: (credits) =>
      `${credits} återvinningskrediter ingår i planen.`,
    topupTitle: "Flexibla påfyllningar",
    topupDescription: (credits) =>
      `Köp extra paket med ${credits} krediter när du behöver mer kapacitet.`,
  },
  th: {
    description: (name, credits) =>
      `${name} มีเครดิตกู้คืน ${credits} เครดิตสำหรับการสนทนาเกี่ยวกับตะกร้าที่ถูกละทิ้ง`,
    includedTitle: "เครดิตกู้คืนที่รวมอยู่",
    includedDescription: (credits) => `แผนนี้รวมเครดิตกู้คืน ${credits} เครดิต`,
    topupTitle: "เติมเครดิตได้ยืดหยุ่น",
    topupDescription: (credits) =>
      `ซื้อแพ็กเพิ่มครั้งละ ${credits} เครดิตเมื่อคุณต้องการ`,
  },
  tr: {
    description: (name, credits) =>
      `${name}, terk edilmiş sepet görüşmeleri için ${credits} kurtarma kredisi içerir.`,
    includedTitle: "Dahil kurtarma kredileri",
    includedDescription: (credits) =>
      `Bu planda ${credits} kurtarma kredisi dahildir.`,
    topupTitle: "Esnek ek krediler",
    topupDescription: (credits) =>
      `${credits} kredilik ek paketler satın alabilirsiniz.`,
  },
  "zh-Hans": {
    description: (name, credits) =>
      `${name} 包含 ${credits} 个购物车挽回积分，用于与弃购客户沟通。`,
    includedTitle: "包含的挽回积分",
    includedDescription: (credits) => `此方案包含 ${credits} 个挽回积分。`,
    topupTitle: "灵活加购",
    topupDescription: (credits) =>
      `需要更多容量时，可购买每包 ${credits} 个积分。`,
  },
  "zh-Hant": {
    description: (name, credits) =>
      `${name} 包含 ${credits} 個購物車挽回點數，用於與棄購顧客溝通。`,
    includedTitle: "包含的挽回點數",
    includedDescription: (credits) => `此方案包含 ${credits} 個挽回點數。`,
    topupTitle: "彈性加購",
    topupDescription: (credits) =>
      `需要更多容量時，可購買每包 ${credits} 個點數。`,
  },
};

const PLANS = [
  {
    handle: "starter",
    name: "Starter",
    position: 1,
    credits: 25,
    price: 1900,
    active: true,
    featured: false,
    grant: 25,
  },
  {
    handle: "growth",
    name: "Growth",
    position: 2,
    credits: 100,
    price: 5900,
    active: true,
    featured: true,
    grant: 50,
  },
  {
    handle: "scale",
    name: "Scale",
    position: 3,
    credits: 450,
    price: 15900,
    active: false,
    featured: false,
    grant: 200,
  },
  {
    handle: "premium",
    name: "Premium",
    position: 4,
    credits: 2100,
    price: 39900,
    active: false,
    featured: false,
    grant: 700,
  },
];

function usage() {
  return `Four-plan realistic MerchantPricing seeder\n\nUsage:\n  node scripts/seed-four-merchant-pricing.mjs --help\n  node scripts/seed-four-merchant-pricing.mjs --confirm-test-data\n\nCreates only starter, growth, scale, and premium at catalogue positions 1-4.\nIt refuses occupied handles or positions and never resets or reorders other plans.`;
}

function requiredTopUpPriceMinor(plans, lowerIndex, minimumUpgradePremiumBps) {
  const lower = plans[lowerIndex];
  let required = 100;
  for (
    let higherIndex = lowerIndex + 1;
    higherIndex < plans.length;
    higherIndex += 1
  ) {
    const higher = plans[higherIndex];
    const units = Math.ceil((higher.credits - lower.credits) / lower.grant);
    const requiredStayAndTopUp = Math.ceil(
      (higher.price * (10_000 + minimumUpgradePremiumBps)) / 10_000,
    );
    required = Math.max(
      required,
      Math.ceil(Math.max(0, requiredStayAndTopUp - lower.price) / units),
    );
  }
  return Math.ceil((required * 1.1) / 100) * 100;
}

function validateEconomics(plans, premiumBps) {
  for (let lowerIndex = 0; lowerIndex < plans.length - 1; lowerIndex += 1) {
    const lower = plans[lowerIndex];
    for (
      let higherIndex = lowerIndex + 1;
      higherIndex < plans.length;
      higherIndex += 1
    ) {
      const higher = plans[higherIndex];
      if (higher.credits <= lower.credits)
        throw new Error(
          `${higher.name} must include more credits than ${lower.name}.`,
        );
      const units = Math.ceil((higher.credits - lower.credits) / lower.grant);
      const actual = lower.price + units * lower.topUpPriceMinor;
      const required = Math.ceil(
        (higher.price * (10_000 + premiumBps)) / 10_000,
      );
      if (actual < required)
        throw new Error(
          `Pricing economics failed for ${lower.name} -> ${higher.name}.`,
        );
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
  const rows = [{ contentKey: randomUUID(), position: 0, title: "included" }];
  if (plan.grant)
    rows.push({ contentKey: randomUUID(), position: 1, title: "topup" });
  return rows.map((row) => ({
    contentKey: row.contentKey,
    position: row.position,
    translations: LOCALES.map((locale) => ({
      locale,
      merchantTitle:
        row.title === "included"
          ? COPY[locale].includedTitle
          : COPY[locale].topupTitle,
      merchantDescription:
        row.title === "included"
          ? COPY[locale].includedDescription(plan.credits)
          : COPY[locale].topupDescription(plan.grant),
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

  await prisma.$transaction(async (transaction) => {
    const positions = PLANS.map((plan) => plan.position);
    const occupied = await transaction.merchantPricingPlan.findMany({
      where: {
        OR: [
          { shopifyPlanHandle: { in: PLANS.map((plan) => plan.handle) } },
          { cataloguePosition: { in: positions } },
        ],
      },
      select: {
        shopifyPlanHandle: true,
        cataloguePosition: true,
        displayName: true,
      },
    });
    if (occupied.length) {
      const details = occupied
        .map(
          (plan) =>
            `${plan.shopifyPlanHandle} at ${plan.cataloguePosition} (${plan.displayName})`,
        )
        .join(", ");
      throw new Error(
        `Refusing to overwrite or move existing plans; requested handles/positions are occupied: ${details}.`,
      );
    }

    const policy = await transaction.platformBillingPolicy.findUnique({
      where: { id: "default" },
      select: { minimumUpgradePremiumBps: true },
    });
    const minimumUpgradePremiumBps = policy?.minimumUpgradePremiumBps ?? 2000;
    const plans = PLANS.map((plan) => ({ ...plan }));
    plans.forEach((plan, index) => {
      plan.topUpPriceMinor = requiredTopUpPriceMinor(
        plans,
        index,
        minimumUpgradePremiumBps,
      );
    });
    validateEconomics(plans, minimumUpgradePremiumBps);

    for (const plan of plans) {
      const planHighlights = highlights(plan);
      await transaction.merchantPricingPlan.create({
        data: {
          shopifyPlanHandle: plan.handle,
          displayName: plan.name,
          planKind: "PAID_METERED",
          isActive: plan.active,
          cataloguePosition: plan.position,
          featured: plan.featured,
          includedRecoveryCredits: plan.credits,
          allowancePeriod: "EVERY_30_DAYS",
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
            create: {
              eventHandle: `${plan.handle}-top-up`,
              adminLabel: `${plan.name} recovery-credit top-up`,
              creditsGrantedPerUnit: plan.grant,
              position: 0,
              pricingMode: "FIXED",
              currency: "USD",
              fixedUnitAmountMinor: plan.topUpPriceMinor,
              maximumUnitsPerBillingPeriod: null,
            },
          },
        },
        select: {
          shopifyPlanHandle: true,
          displayName: true,
          cataloguePosition: true,
        },
      });
      console.log(
        `Created ${plan.handle} at position ${plan.position}: $${(plan.price / 100).toFixed(2)} / 30 days, ${plan.credits} included credits.`,
      );
    }
  }, TRANSACTION_OPTIONS);

  console.log(
    "Created exactly four MerchantPricing plans; no existing plans were modified.",
  );
}

main()
  .catch((error) => {
    console.error(
      `seed-four-merchant-pricing: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
