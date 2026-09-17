#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import process from "node:process";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SEED_PREFIX = "ui-pagination-seed-";
const REQUIRED_CONFIRMATION = "--confirm-test-data";
const CLEANUP_FLAG = "--cleanup";

const MERCHANT_PRICING_LOCALES = [
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

const TRANSLATION_COPY = {
  cs: {
    description: (name) =>
      `${name} je testovací cenový plán určený k ověření stránkování, filtrování a úprav v administračním rozhraní.`,
    highlights: [
      ["Předvídatelná cena", "Jasná testovací cena pro ověření zobrazení plánu."],
      ["Flexibilní kredity", "Různé limity kreditů pomáhají testovat řazení a ekonomiku portfolia."],
    ],
  },
  da: {
    description: (name) =>
      `${name} er en testprisplan til validering af paginering, filtrering og redigering i administrationsgrænsefladen.`,
    highlights: [
      ["Forudsigelig pris", "En tydelig testpris til kontrol af planvisningen."],
      ["Fleksible kreditter", "Forskellige kreditgrænser hjælper med at teste sortering og porteføljeøkonomi."],
    ],
  },
  de: {
    description: (name) =>
      `${name} ist ein Testtarif zur Prüfung von Seitennavigation, Filtern und Bearbeitung in der Administrationsoberfläche.`,
    highlights: [
      ["Planbare Preise", "Ein klarer Testpreis zur Überprüfung der Tarifdarstellung."],
      ["Flexible Guthaben", "Unterschiedliche Guthabenmengen helfen beim Testen von Sortierung und Portfolioökonomie."],
    ],
  },
  en: {
    description: (name) =>
      `${name} is a test pricing plan for validating pagination, filtering and editing flows in the admin interface.`,
    highlights: [
      ["Predictable pricing", "A clear test price for validating plan presentation."],
      ["Flexible credits", "Different credit allowances help exercise sorting and portfolio economics."],
    ],
  },
  es: {
    description: (name) =>
      `${name} es un plan de precios de prueba para validar la paginación, los filtros y los flujos de edición en la interfaz de administración.`,
    highlights: [
      ["Precio predecible", "Un precio de prueba claro para validar la presentación del plan."],
      ["Créditos flexibles", "Distintas asignaciones de créditos ayudan a probar el orden y la economía de la cartera."],
    ],
  },
  fi: {
    description: (name) =>
      `${name} on testihinnoittelupaketti sivutuksen, suodatuksen ja muokkauspolkujen tarkistamiseen hallintaliittymässä.`,
    highlights: [
      ["Ennakoitava hinnoittelu", "Selkeä testihinta suunnitelman esityksen tarkistamiseen."],
      ["Joustavat krediitit", "Eri krediittimäärät auttavat testaamaan järjestystä ja portfolioekonomiaa."],
    ],
  },
  fr: {
    description: (name) =>
      `${name} est une offre tarifaire de test destinée à valider la pagination, les filtres et les parcours de modification dans l’interface d’administration.`,
    highlights: [
      ["Tarification prévisible", "Un tarif de test clair pour vérifier la présentation de l’offre."],
      ["Crédits flexibles", "Des allocations de crédits variées permettent de tester le tri et l’économie du portefeuille."],
    ],
  },
  it: {
    description: (name) =>
      `${name} è un piano tariffario di test per verificare paginazione, filtri e flussi di modifica nell’interfaccia di amministrazione.`,
    highlights: [
      ["Prezzo prevedibile", "Un prezzo di test chiaro per verificare la presentazione del piano."],
      ["Crediti flessibili", "Diverse quantità di crediti aiutano a testare ordinamento ed economia del portafoglio."],
    ],
  },
  ja: {
    description: (name) =>
      `${name} は、管理画面のページネーション、フィルター、編集フローを検証するためのテスト料金プランです。`,
    highlights: [
      ["分かりやすい料金", "プラン表示を検証するための明確なテスト料金です。"],
      ["柔軟なクレジット", "異なるクレジット数で並び順やポートフォリオ経済性をテストできます。"],
    ],
  },
  ko: {
    description: (name) =>
      `${name}은(는) 관리자 화면의 페이지네이션, 필터링 및 편집 흐름을 검증하기 위한 테스트 요금제입니다.`,
    highlights: [
      ["예측 가능한 가격", "요금제 표시를 검증하기 위한 명확한 테스트 가격입니다."],
      ["유연한 크레딧", "서로 다른 크레딧 제공량으로 정렬과 포트폴리오 경제성을 테스트할 수 있습니다."],
    ],
  },
  nb: {
    description: (name) =>
      `${name} er en testprisplan for å validere paginering, filtrering og redigeringsflyt i administrasjonsgrensesnittet.`,
    highlights: [
      ["Forutsigbar pris", "En tydelig testpris for å kontrollere presentasjonen av planen."],
      ["Fleksible kreditter", "Ulike kredittmengder gjør det mulig å teste sortering og porteføljeøkonomi."],
    ],
  },
  nl: {
    description: (name) =>
      `${name} is een testprijsplan voor het valideren van paginering, filters en bewerkingsstromen in de beheerinterface.`,
    highlights: [
      ["Voorspelbare prijs", "Een duidelijke testprijs om de weergave van het plan te controleren."],
      ["Flexibele credits", "Verschillende creditlimieten helpen bij het testen van sortering en portfolio-economie."],
    ],
  },
  pl: {
    description: (name) =>
      `${name} to testowy plan cenowy służący do sprawdzania paginacji, filtrowania i edycji w panelu administracyjnym.`,
    highlights: [
      ["Przewidywalna cena", "Czytelna cena testowa do sprawdzania prezentacji planu."],
      ["Elastyczne kredyty", "Różne limity kredytów pomagają testować sortowanie i ekonomię portfela."],
    ],
  },
  "pt-BR": {
    description: (name) =>
      `${name} é um plano de preços de teste para validar paginação, filtros e fluxos de edição na interface administrativa.`,
    highlights: [
      ["Preço previsível", "Um preço de teste claro para validar a apresentação do plano."],
      ["Créditos flexíveis", "Diferentes quantidades de créditos ajudam a testar ordenação e economia do portfólio."],
    ],
  },
  "pt-PT": {
    description: (name) =>
      `${name} é um plano de preços de teste para validar paginação, filtros e fluxos de edição na interface de administração.`,
    highlights: [
      ["Preço previsível", "Um preço de teste claro para validar a apresentação do plano."],
      ["Créditos flexíveis", "Diferentes quantidades de créditos ajudam a testar ordenação e economia do portefólio."],
    ],
  },
  sv: {
    description: (name) =>
      `${name} är en testprisplan för att validera sidindelning, filtrering och redigeringsflöden i administratörsgränssnittet.`,
    highlights: [
      ["Förutsägbar prissättning", "Ett tydligt testpris för att kontrollera hur planen presenteras."],
      ["Flexibla krediter", "Olika kreditnivåer hjälper till att testa sortering och portföljekonomi."],
    ],
  },
  th: {
    description: (name) =>
      `${name} เป็นแผนราคาสำหรับทดสอบการแบ่งหน้า การกรอง และขั้นตอนการแก้ไขในหน้าผู้ดูแลระบบ`,
    highlights: [
      ["ราคาที่คาดเดาได้", "ราคาทดสอบที่ชัดเจนสำหรับตรวจสอบการแสดงผลของแผน"],
      ["เครดิตยืดหยุ่น", "จำนวนเครดิตที่แตกต่างกันช่วยทดสอบการเรียงลำดับและเศรษฐศาสตร์ของพอร์ตโฟลิโอ"],
    ],
  },
  tr: {
    description: (name) =>
      `${name}, yönetici arayüzündeki sayfalama, filtreleme ve düzenleme akışlarını doğrulamak için hazırlanmış bir test fiyatlandırma planıdır.`,
    highlights: [
      ["Öngörülebilir fiyat", "Plan sunumunu doğrulamak için net bir test fiyatı."],
      ["Esnek krediler", "Farklı kredi miktarları sıralama ve portföy ekonomisini test etmeye yardımcı olur."],
    ],
  },
  "zh-Hans": {
    description: (name) =>
      `${name} 是一个测试定价方案，用于验证管理界面中的分页、筛选和编辑流程。`,
    highlights: [
      ["价格清晰", "使用明确的测试价格验证方案展示。"],
      ["灵活积分", "不同的积分额度可用于测试排序和组合经济性。"],
    ],
  },
  "zh-Hant": {
    description: (name) =>
      `${name} 是一個測試定價方案，用於驗證管理介面中的分頁、篩選和編輯流程。`,
    highlights: [
      ["價格清晰", "使用明確的測試價格驗證方案顯示。"],
      ["彈性點數", "不同的點數額度可用於測試排序和組合經濟性。"],
    ],
  },
};

const PLAN_LABELS = [
  "Starter",
  "Launch",
  "Essentials",
  "Builder",
  "Momentum",
  "Growth",
  "Growth Plus",
  "Commerce",
  "Commerce Plus",
  "Scale",
  "Scale Plus",
  "Advanced",
  "Professional",
  "Business",
  "Business Plus",
  "Premium",
  "Premium Plus",
  "Enterprise",
  "Enterprise Plus",
  "Ultimate",
];

function parseCount() {
  const argument = process.argv.find((value) => value.startsWith("--count="));
  if (!argument) return 20;

  const count = Number(argument.slice("--count=".length));
  if (!Number.isSafeInteger(count) || count < 1 || count > 100) {
    throw new Error("--count must be a whole number between 1 and 100.");
  }

  return count;
}

function seededHandle(index) {
  return `${SEED_PREFIX}${String(index + 1).padStart(2, "0")}`;
}

function seededName(index) {
  const label = PLAN_LABELS[index % PLAN_LABELS.length];
  return `Pagination ${label} ${String(index + 1).padStart(2, "0")}`;
}

function buildTranslations(name) {
  return MERCHANT_PRICING_LOCALES.map((locale) => ({
    locale,
    merchantDescription: TRANSLATION_COPY[locale].description(name),
  }));
}

function buildHighlights(name) {
  return [0, 1].map((highlightIndex) => ({
    contentKey: randomUUID(),
    position: highlightIndex,
    translations: {
      create: MERCHANT_PRICING_LOCALES.map((locale) => {
        const [title, description] =
          TRANSLATION_COPY[locale].highlights[highlightIndex];

        return {
          locale,
          merchantTitle:
            highlightIndex === 0 ? title : `${title} · ${name}`,
          merchantDescription: description,
        };
      }),
    },
  }));
}

function fixedUsageEvent(index) {
  return {
    eventHandle: `${seededHandle(index)}-fixed-top-up`,
    adminLabel: "Fixed credit top-up",
    creditsGrantedPerUnit: 5 + (index % 3) * 5,
    position: 0,
    pricingMode: "FIXED",
    currency: "USD",
    fixedUnitAmountMinor: 2500 + index * 125,
    maximumUnitsPerBillingPeriod: 10,
  };
}

function graduatedUsageEvent(index) {
  return {
    eventHandle: `${seededHandle(index)}-graduated-top-up`,
    adminLabel: "Graduated credit top-up",
    creditsGrantedPerUnit: 10,
    position: 0,
    pricingMode: "GRADUATED",
    currency: "USD",
    fixedUnitAmountMinor: null,
    maximumUnitsPerBillingPeriod: 20,
    tiers: {
      create: [
        {
          position: 0,
          upTo: 5,
          amountPerUnitMinor: 1800 + index * 75,
          flatAmountMinor: 0,
        },
        {
          position: 1,
          upTo: 10,
          amountPerUnitMinor: 1500 + index * 75,
          flatAmountMinor: 0,
        },
        {
          position: 2,
          upTo: null,
          amountPerUnitMinor: 1200 + index * 75,
          flatAmountMinor: 0,
        },
      ],
    },
  };
}

function volumeUsageEvent(index) {
  return {
    eventHandle: `${seededHandle(index)}-volume-top-up`,
    adminLabel: "Volume credit top-up",
    creditsGrantedPerUnit: 10,
    position: 0,
    pricingMode: "VOLUME",
    currency: "USD",
    fixedUnitAmountMinor: null,
    maximumUnitsPerBillingPeriod: 20,
    tiers: {
      create: [
        {
          position: 0,
          upTo: 5,
          amountPerUnitMinor: 1900 + index * 75,
          flatAmountMinor: 0,
        },
        {
          position: 1,
          upTo: 10,
          amountPerUnitMinor: 1600 + index * 75,
          flatAmountMinor: 0,
        },
        {
          position: 2,
          upTo: null,
          amountPerUnitMinor: 1300 + index * 75,
          flatAmountMinor: 0,
        },
      ],
    },
  };
}

function buildUsageEvents(index) {
  switch (index % 4) {
    case 0:
      return [fixedUsageEvent(index)];
    case 1:
      return [graduatedUsageEvent(index)];
    case 2:
      return [volumeUsageEvent(index)];
    default:
      return [];
  }
}

async function deleteSeededPlans() {
  const result = await prisma.merchantPricingPlan.deleteMany({
    where: {
      shopifyPlanHandle: {
        startsWith: SEED_PREFIX,
      },
    },
  });

  return result.count;
}

async function main() {
  if (!process.argv.includes(REQUIRED_CONFIRMATION)) {
    throw new Error(
      `Refusing to modify the database. Re-run with ${REQUIRED_CONFIRMATION} after confirming this is a development/test database.`,
    );
  }

  if (process.argv.includes(CLEANUP_FLAG)) {
    const deleted = await deleteSeededPlans();
    console.log(`Deleted ${deleted} merchant-pricing pagination seed plans.`);
    return;
  }

  const count = parseCount();

  // Idempotent re-seed: only rows created by this script are removed.
  const deleted = await deleteSeededPlans();
  if (deleted > 0) {
    console.log(`Removed ${deleted} previous merchant-pricing pagination seed plans.`);
  }

  const existingPlans = await prisma.merchantPricingPlan.findMany({
    select: {
      cataloguePosition: true,
      includedRecoveryCredits: true,
    },
    orderBy: {
      cataloguePosition: "asc",
    },
  });

  const startPosition =
    existingPlans.reduce(
      (maximum, plan) => Math.max(maximum, plan.cataloguePosition),
      -1,
    ) + 1;

  const startingCredits =
    existingPlans.reduce(
      (maximum, plan) => Math.max(maximum, plan.includedRecoveryCredits),
      0,
    ) + 10;

  console.log(
    `Creating ${count} inactive MerchantPricing plans from catalogue position ${startPosition}.`,
  );

  for (let index = 0; index < count; index += 1) {
    const name = seededName(index);
    const handle = seededHandle(index);
    const includedRecoveryCredits = startingCredits + index * 10;
    const recurringAmountMinor = 900 + index * 500;

    const created = await prisma.merchantPricingPlan.create({
      data: {
        shopifyPlanHandle: handle,
        displayName: name,
        planKind: "PAID_METERED",

        // Keep the pagination fixture isolated from active-portfolio economics.
        // Activate individual rows manually when you explicitly want to test
        // activation/economics behaviour.
        isActive: false,

        cataloguePosition: startPosition + index,
        featured: index % 5 === 0,
        includedRecoveryCredits,
        allowancePeriod: "EVERY_30_DAYS",
        billingPeriod: "EVERY_30_DAYS",
        recurringAmountMinor,
        currency: "USD",

        economicsOverrideEnabled: false,
        economicsOverrideReason: null,
        economicsOverrideApprovedAt: null,
        economicsOverrideApprovedByAdminId: null,
        economicsOverrideFailureCodes: [],
        economicsOverrideFingerprint: null,

        translations: {
          create: buildTranslations(name),
        },

        highlights: {
          create: buildHighlights(name),
        },

        usageEvents: {
          create: buildUsageEvents(index),
        },
      },
      select: {
        id: true,
        shopifyPlanHandle: true,
        displayName: true,
        cataloguePosition: true,
        featured: true,
        includedRecoveryCredits: true,
        recurringAmountMinor: true,
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
        `✓ ${created.cataloguePosition + 1}. ${created.displayName}`,
        `handle=${created.shopifyPlanHandle}`,
        `credits=${created.includedRecoveryCredits}`,
        `price=$${(created.recurringAmountMinor / 100).toFixed(2)}`,
        `featured=${created.featured}`,
        `translations=${created._count.translations}`,
        `highlights=${created._count.highlights}`,
        `usageEvents=${created._count.usageEvents}`,
      ].join(" | "),
    );
  }

  console.log("");
  console.log("Merchant-pricing pagination seed complete.");
  console.log(`Created ${count} plans with 20 plan translations each.`);
  console.log("Every plan also has two fully translated highlights.");
  console.log(
    "The seeded plans are intentionally inactive so they do not change the active portfolio economics.",
  );
  console.log(
    `Cleanup command: node scripts/seed-merchant-pricing-pagination.mjs ${CLEANUP_FLAG} ${REQUIRED_CONFIRMATION}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
