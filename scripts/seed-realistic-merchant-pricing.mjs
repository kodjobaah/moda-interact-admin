#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import process from "node:process";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CONFIRM_FLAG = "--confirm-test-data";
const RESET_FLAG = "--reset-catalogue";
const CLEANUP_FLAG = "--cleanup";
const HANDLE_PREFIX = "demo-catalogue-";

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
      `${name} obsahuje ${credits} kreditů pro obnovu opuštěných košíků a je určen pro obchodníky, kteří chtějí předvídatelnou kapacitu pro konverzace se zákazníky.`,
    includedTitle: "Zahrnuté kredity pro obnovu",
    includedDescription: (credits) =>
      `${credits} kreditů pro obnovu je zahrnuto v tomto plánu.`,
    topupTitle: "Flexibilní navýšení",
    topupDescription: (credits) =>
      `Když potřebujete větší kapacitu, můžete dokoupit další balíčky po ${credits} kreditech.`,
  },
  da: {
    description: (name, credits) =>
      `${name} indeholder ${credits} recovery-kreditter til forladte kurve og er lavet til butikker, der ønsker forudsigelig kapacitet til kundedialoger.`,
    includedTitle: "Inkluderede recovery-kreditter",
    includedDescription: (credits) =>
      `${credits} recovery-kreditter er inkluderet i denne plan.`,
    topupTitle: "Fleksible ekstra kreditter",
    topupDescription: (credits) =>
      `Køb ekstra pakker med ${credits} kreditter, når du har brug for mere kapacitet.`,
  },
  de: {
    description: (name, credits) =>
      `${name} enthält ${credits} Recovery-Credits für abgebrochene Warenkörbe und bietet Händlern planbare Kapazität für Kundengespräche.`,
    includedTitle: "Enthaltene Recovery-Credits",
    includedDescription: (credits) =>
      `${credits} Recovery-Credits sind in diesem Tarif enthalten.`,
    topupTitle: "Flexible Zusatz-Credits",
    topupDescription: (credits) =>
      `Bei höherem Bedarf können zusätzliche Pakete mit ${credits} Credits erworben werden.`,
  },
  en: {
    description: (name, credits) =>
      `${name} includes ${credits} recovery credits for abandoned-cart conversations and is designed for merchants who want predictable recovery capacity as they grow.`,
    includedTitle: "Included recovery credits",
    includedDescription: (credits) =>
      `${credits} recovery credits are included with this plan.`,
    topupTitle: "Flexible top-ups",
    topupDescription: (credits) =>
      `Buy additional packs of ${credits} recovery credits when you need extra capacity.`,
  },
  es: {
    description: (name, credits) =>
      `${name} incluye ${credits} créditos de recuperación para conversaciones sobre carritos abandonados y ofrece una capacidad predecible a medida que crece el comercio.`,
    includedTitle: "Créditos de recuperación incluidos",
    includedDescription: (credits) =>
      `Este plan incluye ${credits} créditos de recuperación.`,
    topupTitle: "Recargas flexibles",
    topupDescription: (credits) =>
      `Compra paquetes adicionales de ${credits} créditos cuando necesites más capacidad.`,
  },
  fi: {
    description: (name, credits) =>
      `${name} sisältää ${credits} palautuskrediittiä hylättyjen ostoskorien keskusteluihin ja tarjoaa ennakoitavaa kapasiteettia kasvaville kauppiaille.`,
    includedTitle: "Sisältyvät palautuskrediitit",
    includedDescription: (credits) =>
      `Tähän pakettiin sisältyy ${credits} palautuskrediittiä.`,
    topupTitle: "Joustavat lisäkrediitit",
    topupDescription: (credits) =>
      `Osta tarvittaessa lisää ${credits} krediitin paketteja.`,
  },
  fr: {
    description: (name, credits) =>
      `${name} comprend ${credits} crédits de récupération pour les conversations liées aux paniers abandonnés et offre une capacité prévisible à mesure que votre activité se développe.`,
    includedTitle: "Crédits de récupération inclus",
    includedDescription: (credits) =>
      `${credits} crédits de récupération sont inclus dans cette offre.`,
    topupTitle: "Recharges flexibles",
    topupDescription: (credits) =>
      `Achetez des lots supplémentaires de ${credits} crédits lorsque vous avez besoin de plus de capacité.`,
  },
  it: {
    description: (name, credits) =>
      `${name} include ${credits} crediti di recupero per le conversazioni sui carrelli abbandonati e offre capacità prevedibile durante la crescita del negozio.`,
    includedTitle: "Crediti di recupero inclusi",
    includedDescription: (credits) =>
      `Questo piano include ${credits} crediti di recupero.`,
    topupTitle: "Ricariche flessibili",
    topupDescription: (credits) =>
      `Acquista pacchetti aggiuntivi da ${credits} crediti quando serve più capacità.`,
  },
  ja: {
    description: (name, credits) =>
      `${name} には、カゴ落ち顧客との会話に使えるリカバリークレジットが ${credits} 件含まれ、成長に合わせて予測しやすい運用容量を提供します。`,
    includedTitle: "含まれるリカバリークレジット",
    includedDescription: (credits) =>
      `このプランには ${credits} 件のリカバリークレジットが含まれます。`,
    topupTitle: "柔軟な追加クレジット",
    topupDescription: (credits) =>
      `容量が必要なときに ${credits} クレジット単位で追加購入できます。`,
  },
  ko: {
    description: (name, credits) =>
      `${name} 요금제에는 장바구니 이탈 고객 대화를 위한 복구 크레딧 ${credits}개가 포함되며 성장에 맞춰 예측 가능한 용량을 제공합니다.`,
    includedTitle: "포함된 복구 크레딧",
    includedDescription: (credits) =>
      `이 요금제에는 복구 크레딧 ${credits}개가 포함됩니다.`,
    topupTitle: "유연한 추가 충전",
    topupDescription: (credits) =>
      `추가 용량이 필요할 때 ${credits} 크레딧 단위의 패키지를 구매할 수 있습니다.`,
  },
  nb: {
    description: (name, credits) =>
      `${name} inkluderer ${credits} recovery-kreditter for samtaler om forlatte handlekurver og gir forutsigbar kapasitet når butikken vokser.`,
    includedTitle: "Inkluderte recovery-kreditter",
    includedDescription: (credits) =>
      `${credits} recovery-kreditter er inkludert i denne planen.`,
    topupTitle: "Fleksible påfyll",
    topupDescription: (credits) =>
      `Kjøp ekstra pakker med ${credits} kreditter når du trenger mer kapasitet.`,
  },
  nl: {
    description: (name, credits) =>
      `${name} bevat ${credits} herstelcredits voor gesprekken over verlaten winkelwagens en biedt voorspelbare capaciteit terwijl je winkel groeit.`,
    includedTitle: "Inbegrepen herstelcredits",
    includedDescription: (credits) =>
      `${credits} herstelcredits zijn inbegrepen bij dit plan.`,
    topupTitle: "Flexibele extra credits",
    topupDescription: (credits) =>
      `Koop extra pakketten van ${credits} credits wanneer je meer capaciteit nodig hebt.`,
  },
  pl: {
    description: (name, credits) =>
      `${name} obejmuje ${credits} kredytów odzyskiwania dla rozmów o porzuconych koszykach i zapewnia przewidywalną pojemność wraz ze wzrostem sklepu.`,
    includedTitle: "Kredyty odzyskiwania w planie",
    includedDescription: (credits) =>
      `Ten plan obejmuje ${credits} kredytów odzyskiwania.`,
    topupTitle: "Elastyczne doładowania",
    topupDescription: (credits) =>
      `W razie potrzeby kup dodatkowe pakiety po ${credits} kredytów.`,
  },
  "pt-BR": {
    description: (name, credits) =>
      `${name} inclui ${credits} créditos de recuperação para conversas de carrinho abandonado e oferece capacidade previsível conforme a loja cresce.`,
    includedTitle: "Créditos de recuperação incluídos",
    includedDescription: (credits) =>
      `Este plano inclui ${credits} créditos de recuperação.`,
    topupTitle: "Recargas flexíveis",
    topupDescription: (credits) =>
      `Compre pacotes adicionais de ${credits} créditos quando precisar de mais capacidade.`,
  },
  "pt-PT": {
    description: (name, credits) =>
      `${name} inclui ${credits} créditos de recuperação para conversas de carrinho abandonado e oferece capacidade previsível à medida que a loja cresce.`,
    includedTitle: "Créditos de recuperação incluídos",
    includedDescription: (credits) =>
      `Este plano inclui ${credits} créditos de recuperação.`,
    topupTitle: "Recargas flexíveis",
    topupDescription: (credits) =>
      `Compre pacotes adicionais de ${credits} créditos quando precisar de mais capacidade.`,
  },
  sv: {
    description: (name, credits) =>
      `${name} innehåller ${credits} återvinningskrediter för samtal om övergivna kundvagnar och ger förutsägbar kapacitet när butiken växer.`,
    includedTitle: "Inkluderade återvinningskrediter",
    includedDescription: (credits) =>
      `${credits} återvinningskrediter ingår i planen.`,
    topupTitle: "Flexibla påfyllningar",
    topupDescription: (credits) =>
      `Köp extra paket med ${credits} krediter när du behöver mer kapacitet.`,
  },
  th: {
    description: (name, credits) =>
      `${name} มีเครดิตกู้คืน ${credits} เครดิตสำหรับการสนทนาเกี่ยวกับตะกร้าที่ถูกละทิ้ง และช่วยให้ร้านค้าวางแผนความจุได้อย่างคาดการณ์ได้เมื่อเติบโตขึ้น`,
    includedTitle: "เครดิตกู้คืนที่รวมอยู่",
    includedDescription: (credits) =>
      `แผนนี้รวมเครดิตกู้คืน ${credits} เครดิต`,
    topupTitle: "เติมเครดิตได้ยืดหยุ่น",
    topupDescription: (credits) =>
      `ซื้อแพ็กเพิ่มครั้งละ ${credits} เครดิตเมื่อคุณต้องการความจุเพิ่ม`,
  },
  tr: {
    description: (name, credits) =>
      `${name}, terk edilmiş sepet görüşmeleri için ${credits} kurtarma kredisi içerir ve mağaza büyüdükçe öngörülebilir kapasite sağlar.`,
    includedTitle: "Dahil kurtarma kredileri",
    includedDescription: (credits) =>
      `Bu planda ${credits} kurtarma kredisi dahildir.`,
    topupTitle: "Esnek ek krediler",
    topupDescription: (credits) =>
      `Daha fazla kapasite gerektiğinde ${credits} kredilik ek paketler satın alın.`,
  },
  "zh-Hans": {
    description: (name, credits) =>
      `${name} 包含 ${credits} 个购物车挽回积分，用于与弃购客户沟通，并随着商店增长提供可预测的容量。`,
    includedTitle: "包含的挽回积分",
    includedDescription: (credits) =>
      `此方案包含 ${credits} 个挽回积分。`,
    topupTitle: "灵活加购",
    topupDescription: (credits) =>
      `需要更多容量时，可购买每包 ${credits} 个积分的额外额度。`,
  },
  "zh-Hant": {
    description: (name, credits) =>
      `${name} 包含 ${credits} 個購物車挽回點數，用於與棄購顧客溝通，並隨商店成長提供可預測的容量。`,
    includedTitle: "包含的挽回點數",
    includedDescription: (credits) =>
      `此方案包含 ${credits} 個挽回點數。`,
    topupTitle: "彈性加購",
    topupDescription: (credits) =>
      `需要更多容量時，可購買每包 ${credits} 個點數的額外額度。`,
  },
};

const PLAN_DEFINITIONS = [
  { handle: "free", name: "Free", credits: 5, price: 0, active: true, featured: false, grant: null },
  { handle: "starter", name: "Starter", credits: 25, price: 1900, active: true, featured: false, grant: 25 },
  { handle: "starter-plus", name: "Starter Plus", credits: 40, price: 2900, active: false, featured: false, grant: 25 },
  { handle: "launch", name: "Launch", credits: 60, price: 3900, active: false, featured: false, grant: 25 },
  { handle: "growth", name: "Growth", credits: 100, price: 5900, active: true, featured: true, grant: 50 },
  { handle: "growth-plus", name: "Growth Plus", credits: 150, price: 7900, active: false, featured: false, grant: 50 },
  { handle: "pro", name: "Pro", credits: 220, price: 9900, active: false, featured: false, grant: 100 },
  { handle: "pro-plus", name: "Pro Plus", credits: 320, price: 12900, active: true, featured: false, grant: 100 },
  { handle: "scale", name: "Scale", credits: 450, price: 15900, active: false, featured: false, grant: 200 },
  { handle: "scale-plus", name: "Scale Plus", credits: 650, price: 19900, active: false, featured: false, grant: 250 },
  { handle: "business", name: "Business", credits: 900, price: 24900, active: true, featured: true, grant: 300 },
  { handle: "business-plus", name: "Business Plus", credits: 1200, price: 29900, active: false, featured: false, grant: 400 },
  { handle: "advanced", name: "Advanced", credits: 1600, price: 34900, active: false, featured: false, grant: 500 },
  { handle: "premium", name: "Premium", credits: 2100, price: 39900, active: false, featured: false, grant: 700 },
  { handle: "premium-plus", name: "Premium Plus", credits: 2800, price: 49900, active: false, featured: true, grant: 800 },
  { handle: "enterprise-lite", name: "Enterprise Lite", credits: 3600, price: 59900, active: false, featured: false, grant: 1200 },
  { handle: "enterprise", name: "Enterprise", credits: 4800, price: 74900, active: true, featured: true, grant: 1400 },
  { handle: "enterprise-plus", name: "Enterprise Plus", credits: 6200, price: 89900, active: false, featured: false, grant: 1800 },
  { handle: "enterprise-max", name: "Enterprise Max", credits: 8000, price: 109900, active: false, featured: false, grant: 2000 },
  { handle: "ultimate", name: "Ultimate", credits: 10000, price: 129900, active: false, featured: true, grant: 2500 },
];

function seededHandle(handle) {
  return `${HANDLE_PREFIX}${handle}`;
}

function money(minor) {
  return `$${(minor / 100).toFixed(2)}`;
}

function requiredTopUpPriceMinor(plans, lowerIndex, minimumUpgradePremiumBps) {
  const lower = plans[lowerIndex];
  if (!lower.grant) return null;

  if (lowerIndex === plans.length - 1) return 60_000;

  let required = 100;
  for (let higherIndex = lowerIndex + 1; higherIndex < plans.length; higherIndex += 1) {
    const higher = plans[higherIndex];
    const creditsNeeded = higher.credits - lower.credits;
    const units = Math.ceil(creditsNeeded / lower.grant);
    const requiredStayAndTopUp = Math.ceil(
      (higher.price * (10_000 + minimumUpgradePremiumBps)) / 10_000,
    );
    const minimumUnitPrice = Math.ceil(
      Math.max(0, requiredStayAndTopUp - lower.price) / Math.max(1, units),
    );
    required = Math.max(required, minimumUnitPrice);
  }

  // Add a 10% buffer and round up to whole dollars so the fixture remains
  // comfortably inside the policy boundary and reads naturally in the UI.
  return Math.ceil((required * 1.1) / 100) * 100;
}

function assertEconomics(plans, minimumUpgradePremiumBps) {
  for (let lowerIndex = 0; lowerIndex < plans.length - 1; lowerIndex += 1) {
    const lower = plans[lowerIndex];
    for (let higherIndex = lowerIndex + 1; higherIndex < plans.length; higherIndex += 1) {
      const higher = plans[higherIndex];
      if (higher.credits <= lower.credits) {
        throw new Error(`${higher.name} must include more credits than ${lower.name}.`);
      }
      if (!lower.grant) continue;

      const units = Math.ceil((higher.credits - lower.credits) / lower.grant);
      const stayAndTopUp = lower.price + units * lower.topUpPriceMinor;
      const required = Math.ceil(
        (higher.price * (10_000 + minimumUpgradePremiumBps)) / 10_000,
      );
      if (stayAndTopUp < required) {
        throw new Error(
          `Seed economics failed for ${lower.name} -> ${higher.name}: ${stayAndTopUp} < ${required}.`,
        );
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
  const includedKey = randomUUID();
  const topUpKey = randomUUID();

  const rows = [
    {
      contentKey: includedKey,
      position: 0,
      translations: LOCALES.map((locale) => ({
        locale,
        merchantTitle: COPY[locale].includedTitle,
        merchantDescription: COPY[locale].includedDescription(plan.credits),
      })),
    },
  ];

  if (plan.grant) {
    rows.push({
      contentKey: topUpKey,
      position: 1,
      translations: LOCALES.map((locale) => ({
        locale,
        merchantTitle: COPY[locale].topupTitle,
        merchantDescription: COPY[locale].topupDescription(plan.grant),
      })),
    });
  }

  return rows;
}

async function cleanupSeedRows() {
  const seeded = await prisma.merchantPricingPlan.findMany({
    where: { shopifyPlanHandle: { startsWith: HANDLE_PREFIX } },
    select: { id: true },
  });

  if (!seeded.length) return 0;

  await prisma.merchantPricingPlan.deleteMany({
    where: { id: { in: seeded.map((row) => row.id) } },
  });

  const remaining = await prisma.merchantPricingPlan.findMany({
    orderBy: [{ cataloguePosition: "asc" }, { id: "asc" }],
    select: { id: true },
  });

  for (const [index, row] of remaining.entries()) {
    await prisma.merchantPricingPlan.update({
      where: { id: row.id },
      data: { cataloguePosition: index },
    });
  }

  return seeded.length;
}

async function main() {
  if (!process.argv.includes(CONFIRM_FLAG)) {
    throw new Error(
      `Refusing to modify the database. Re-run with ${CONFIRM_FLAG} after confirming this is a development/test database.`,
    );
  }

  if (process.argv.includes(CLEANUP_FLAG)) {
    const deleted = await cleanupSeedRows();
    console.log(`Deleted ${deleted} realistic MerchantPricing seed plans.`);
    return;
  }

  const existingCount = await prisma.merchantPricingPlan.count();
  if (existingCount > 0 && !process.argv.includes(RESET_FLAG)) {
    throw new Error(
      `The MerchantPricing catalogue already contains ${existingCount} plan(s). ` +
        `Re-run with ${RESET_FLAG} ${CONFIRM_FLAG} if you want to replace the catalogue with this test fixture.`,
    );
  }

  if (process.argv.includes(RESET_FLAG)) {
    const deleted = await prisma.merchantPricingPlan.deleteMany();
    console.log(`Removed ${deleted.count} existing MerchantPricing plans.`);
  }

  const policy = await prisma.platformBillingPolicy.findUnique({
    where: { id: "default" },
    select: { minimumUpgradePremiumBps: true },
  });
  const minimumUpgradePremiumBps = policy?.minimumUpgradePremiumBps ?? 2000;

  const plans = PLAN_DEFINITIONS.map((definition) => ({ ...definition }));
  for (let index = 0; index < plans.length; index += 1) {
    plans[index].topUpPriceMinor = requiredTopUpPriceMinor(
      plans,
      index,
      minimumUpgradePremiumBps,
    );
  }
  assertEconomics(plans, minimumUpgradePremiumBps);

  console.log(
    `Creating ${plans.length} realistic MerchantPricing plans using a ${minimumUpgradePremiumBps / 100}% minimum upgrade premium.`,
  );

  for (const [index, plan] of plans.entries()) {
    const planHighlights = highlights(plan);
    const created = await prisma.merchantPricingPlan.create({
      data: {
        shopifyPlanHandle: seededHandle(plan.handle),
        displayName: plan.name,
        planKind: index === 0 ? "FREE" : "PAID_METERED",
        isActive: plan.active,
        cataloguePosition: index,
        featured: plan.featured,
        includedRecoveryCredits: plan.credits,
        allowancePeriod: index === 0 ? "LIFETIME" : "EVERY_30_DAYS",
        billingPeriod: "EVERY_30_DAYS",
        recurringAmountMinor: plan.price,
        currency: "USD",
        economicsOverrideEnabled: false,
        economicsOverrideReason: null,
        economicsOverrideApprovedAt: null,
        economicsOverrideApprovedByAdminId: null,
        economicsOverrideFailureCodes: [],
        economicsOverrideFingerprint: null,
        translations: {
          create: translations(plan),
        },
        highlights: {
          create: planHighlights.map((highlight) => ({
            contentKey: highlight.contentKey,
            position: highlight.position,
            translations: {
              create: highlight.translations,
            },
          })),
        },
        ...(plan.grant
          ? {
              usageEvents: {
                create: {
                  eventHandle: `${seededHandle(plan.handle)}-top-up`,
                  adminLabel: `${plan.name} recovery-credit top-up`,
                  creditsGrantedPerUnit: plan.grant,
                  position: 0,
                  pricingMode: "FIXED",
                  currency: "USD",
                  fixedUnitAmountMinor: plan.topUpPriceMinor,
                  maximumUnitsPerBillingPeriod: null,
                },
              },
            }
          : {}),
      },
      select: {
        id: true,
        displayName: true,
        shopifyPlanHandle: true,
        cataloguePosition: true,
        planKind: true,
        isActive: true,
        recurringAmountMinor: true,
        includedRecoveryCredits: true,
        _count: {
          select: {
            translations: true,
            highlights: true,
            usageEvents: true,
          },
        },
      },
    });

    console.log(
      [
        `✓ ${String(created.cataloguePosition + 1).padStart(2, "0")}. ${created.displayName}`,
        created.planKind,
        created.isActive ? "active" : "inactive",
        `${created.includedRecoveryCredits} credits`,
        money(created.recurringAmountMinor),
        `${created._count.translations}/20 translations`,
        `${created._count.highlights} highlights`,
        `${created._count.usageEvents} usage events`,
        plan.topUpPriceMinor ? `top-up ${plan.grant} credits @ ${money(plan.topUpPriceMinor)}` : "no top-up",
      ].join(" | "),
    );
  }

  console.log("");
  console.log("Realistic MerchantPricing catalogue seed complete.");
  console.log("The FREE plan is at catalogue position 0.");
  console.log("All allowances strictly increase with catalogue order.");
  console.log("Each plan has all 20 supported merchant translations.");
  console.log("Each plan has translated highlights; paid plans also have one fixed top-up event.");
  console.log("The generated top-up prices are checked against the current minimum-upgrade-premium policy before anything is written.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
