import {
  PlatformAdminRole,
  PrismaClient,
  PromotionCampaignEventType,
  PromotionCampaignStatus,
  PromotionTargetScope,
} from "@prisma/client";

const prisma = new PrismaClient();

const FIXTURE_PREFIX = "promo-flow-fixture-";
const DEFAULT_COUNT = 50;
const MAX_COUNT = 500;

const DEVELOPMENT_ADMIN = {
  id: "development-platform-admin",
  provider: "development",
  providerSubject: "development-platform-admin",
  email: "development-platform-admin@local.invalid",
  displayName: "Development Platform Admin",
  role: PlatformAdminRole.SUPER_ADMIN,
  active: true,
};

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

const STATE_SEQUENCE = [
  "DRAFT",
  "SCHEDULED",
  "RUNNING",
  "EXPIRED",
  "CLOSED",
];

const QUANTITIES = [1, 2, 3, 5, 8, 10];

const OFFER_FAMILIES = [
  "Welcome recovery boost",
  "Weekend cart rescue",
  "Growth recovery bonus",
  "VIP merchant recovery",
  "Seasonal checkout boost",
  "New-store launch offer",
  "Returning shopper rescue",
  "High-value cart bonus",
  "Retention recovery pack",
  "Limited-time recovery credits",
];

const LOCALE_TEST_LABELS = {
  cs: "Test",
  da: "Test",
  de: "Test",
  en: "Test",
  es: "Prueba",
  fi: "Testi",
  fr: "Test",
  it: "Test",
  ja: "テスト",
  ko: "테스트",
  nb: "Test",
  nl: "Test",
  pl: "Test",
  "pt-BR": "Teste",
  "pt-PT": "Teste",
  sv: "Test",
  th: "ทดสอบ",
  tr: "Test",
  "zh-Hans": "测试",
  "zh-Hant": "測試",
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

function argument(name) {
  const exact = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (exact) return exact.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function parseCount() {
  const raw = argument("count");
  if (raw === undefined) return DEFAULT_COUNT;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 1 || value > MAX_COUNT) {
    throw new Error(`--count must be an integer between 1 and ${MAX_COUNT}.`);
  }
  return value;
}

function fixtureId(index) {
  return `${FIXTURE_PREFIX}${String(index).padStart(3, "0")}`;
}

function dateAt(base, offsetMs) {
  return new Date(base.getTime() + offsetMs);
}

function windowForState(state, index, now) {
  const spread = (index % 7) + 1;

  switch (state) {
    case "DRAFT": {
      const startsAt = dateAt(now, spread * DAY_MS);
      return {
        status: PromotionCampaignStatus.DRAFT,
        startsAt,
        expiresAt: dateAt(startsAt, (7 + spread) * DAY_MS),
        version: 0,
      };
    }
    case "SCHEDULED": {
      const startsAt = dateAt(now, spread * DAY_MS);
      return {
        status: PromotionCampaignStatus.ACTIVE,
        startsAt,
        expiresAt: dateAt(startsAt, (7 + spread) * DAY_MS),
        version: 1,
      };
    }
    case "RUNNING":
      return {
        status: PromotionCampaignStatus.ACTIVE,
        startsAt: dateAt(now, -spread * DAY_MS),
        expiresAt: dateAt(now, (2 + spread) * DAY_MS),
        version: 1,
      };
    case "EXPIRED":
      return {
        status: PromotionCampaignStatus.ACTIVE,
        startsAt: dateAt(now, -(14 + spread) * DAY_MS),
        expiresAt: dateAt(now, -spread * DAY_MS),
        version: 1,
      };
    case "CLOSED":
      return {
        status: PromotionCampaignStatus.CLOSED,
        startsAt: dateAt(now, -(5 + spread) * DAY_MS),
        expiresAt: dateAt(now, (5 + spread) * DAY_MS),
        version: 2,
      };
    default:
      throw new Error(`Unsupported fixture state: ${state}`);
  }
}

async function ensureDevelopmentAdmin() {
  const existing = await prisma.platformAdmin.findUnique({
    where: { id: DEVELOPMENT_ADMIN.id },
  });

  if (!existing) {
    return prisma.platformAdmin.create({ data: DEVELOPMENT_ADMIN });
  }

  const matchesReservedIdentity =
    existing.provider === DEVELOPMENT_ADMIN.provider &&
    existing.providerSubject === DEVELOPMENT_ADMIN.providerSubject &&
    existing.email === DEVELOPMENT_ADMIN.email &&
    existing.displayName === DEVELOPMENT_ADMIN.displayName &&
    existing.role === DEVELOPMENT_ADMIN.role &&
    existing.active === DEVELOPMENT_ADMIN.active;

  if (!matchesReservedIdentity) {
    throw new Error(
      "The reserved development-platform-admin row conflicts with the expected development identity.",
    );
  }

  return existing;
}

async function findFixtureCampaigns() {
  return prisma.promotionCampaign.findMany({
    where: { id: { startsWith: FIXTURE_PREFIX } },
    select: {
      id: true,
      name: true,
      _count: { select: { promotionalCreditGrants: true } },
    },
  });
}

async function clearFixtures() {
  const existing = await findFixtureCampaigns();
  if (!existing.length) return 0;

  const used = existing.filter(
    (campaign) => campaign._count.promotionalCreditGrants > 0,
  );
  if (used.length) {
    throw new Error(
      [
        "Refusing to delete promotion fixtures that already have promotional grants.",
        ...used.map(
          (campaign) =>
            `- ${campaign.id} (${campaign.name}): ${campaign._count.promotionalCreditGrants} grant(s)`,
        ),
        "Remove those grant relationships deliberately before reseeding.",
      ].join("\n"),
    );
  }

  const ids = existing.map((campaign) => campaign.id);
  await prisma.$transaction([
    prisma.promotionCampaignEvent.deleteMany({
      where: { campaignId: { in: ids } },
    }),
    prisma.promotionCampaignTranslation.deleteMany({
      where: { promotionCampaignId: { in: ids } },
    }),
    prisma.promotionCampaign.deleteMany({
      where: { id: { in: ids } },
    }),
  ]);

  return ids.length;
}

function buildFixtureData({ count, now, adminId, plans, shops, scopes }) {
  const campaigns = [];
  const translations = [];
  const events = [];
  const stateCounts = new Map();
  const scopeCounts = new Map();

  for (let index = 1; index <= count; index += 1) {
    const id = fixtureId(index);
    const state = STATE_SEQUENCE[(index - 1) % STATE_SEQUENCE.length];
    const scope = scopes[(index - 1) % scopes.length];
    const quantity = QUANTITIES[(index - 1) % QUANTITIES.length];
    const family = OFFER_FAMILIES[(index - 1) % OFFER_FAMILIES.length];
    const lifecycle = windowForState(state, index, now);
    const createdAt = dateAt(now, -(count - index + 1) * 13 * MINUTE_MS);
    const plan = scope === PromotionTargetScope.PLAN
      ? plans[(index - 1) % plans.length]
      : null;
    const shop = scope === PromotionTargetScope.SHOP
      ? shops[(index - 1) % shops.length]
      : null;

    const padded = String(index).padStart(2, "0");
    const longNameSuffix = index % 10 === 0
      ? " — deliberately longer campaign name for wrapping/layout verification"
      : "";
    const name = `${family} ${padded} · ${state} · ${scope}${longNameSuffix}`;
    const creditLabel = quantity === 1 ? "credit" : "credits";
    const merchantTitle = `${quantity} recovery ${creditLabel}: ${family}`;
    const targetDescription =
      scope === PromotionTargetScope.GLOBAL
        ? "all eligible merchants"
        : scope === PromotionTargetScope.PLAN
          ? `billing plan ${plan.name}`
          : `shop ${shop.domain}`;
    const merchantDescription = `Catalogue test promotion ${padded} for ${targetDescription}. Fixture state: ${state}.`;

    campaigns.push({
      id,
      name,
      merchantDescription: null,
      scope,
      quantity,
      targetPlanId: plan?.id ?? null,
      targetShopId: shop?.id ?? null,
      startsAt: lifecycle.startsAt,
      expiresAt: lifecycle.expiresAt,
      status: lifecycle.status,
      createdByPlatformAdminId: adminId,
      createdAt,
      updatedAt: createdAt,
      version: lifecycle.version,
    });

    for (const locale of LOCALES) {
      const prefix = LOCALE_TEST_LABELS[locale] ?? locale;
      translations.push({
        id: `${id}-translation-${locale}`,
        promotionCampaignId: id,
        locale,
        merchantTitle:
          locale === "en" ? merchantTitle : `${prefix} · ${merchantTitle}`,
        merchantDescription:
          locale === "en"
            ? merchantDescription
            : `${prefix} · ${merchantDescription}`,
        createdAt,
        updatedAt: createdAt,
      });
    }

    events.push({
      id: `${id}-event-created`,
      campaignId: id,
      kind: PromotionCampaignEventType.CREATED,
      platformAdminId: adminId,
      createdAt: dateAt(createdAt, MINUTE_MS),
    });

    if (state !== "DRAFT") {
      events.push({
        id: `${id}-event-activated`,
        campaignId: id,
        kind: PromotionCampaignEventType.ACTIVATED,
        platformAdminId: adminId,
        createdAt: dateAt(createdAt, 2 * MINUTE_MS),
      });
    }

    if (state === "CLOSED") {
      events.push({
        id: `${id}-event-closed`,
        campaignId: id,
        kind: PromotionCampaignEventType.CLOSED,
        platformAdminId: adminId,
        createdAt: dateAt(createdAt, 3 * MINUTE_MS),
      });
    }

    stateCounts.set(state, (stateCounts.get(state) ?? 0) + 1);
    scopeCounts.set(scope, (scopeCounts.get(scope) ?? 0) + 1);
  }

  return { campaigns, translations, events, stateCounts, scopeCounts };
}

function printCounts(label, values) {
  console.log(label);
  for (const [key, value] of values.entries()) {
    console.log(`  ${key}: ${value}`);
  }
}

async function main() {
  const clearOnly = hasFlag("clear");
  const count = parseCount();

  if (clearOnly) {
    const removed = await clearFixtures();
    console.log(`Removed ${removed} promotion catalogue fixture campaign(s).`);
    return;
  }

  const [admin, plans, shops] = await Promise.all([
    ensureDevelopmentAdmin(),
    prisma.billingPlan.findMany({
      where: { active: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { id: true, name: true, shopifyPlanHandle: true },
    }),
    prisma.shop.findMany({
      orderBy: [{ domain: "asc" }, { id: "asc" }],
      select: { id: true, domain: true },
    }),
  ]);

  const scopes = [
    PromotionTargetScope.GLOBAL,
    ...(plans.length ? [PromotionTargetScope.PLAN] : []),
    ...(shops.length ? [PromotionTargetScope.SHOP] : []),
  ];

  if (!plans.length)
    console.warn("No active BillingPlan rows exist; PLAN fixtures will be skipped.");
  if (!shops.length)
    console.warn("No Shop rows exist; SHOP fixtures will be skipped.");

  const removed = await clearFixtures();
  const now = new Date();
  const fixture = buildFixtureData({
    count,
    now,
    adminId: admin.id,
    plans,
    shops,
    scopes,
  });

  await prisma.$transaction(async (transaction) => {
    await transaction.promotionCampaign.createMany({ data: fixture.campaigns });
    await transaction.promotionCampaignTranslation.createMany({
      data: fixture.translations,
    });
    await transaction.promotionCampaignEvent.createMany({ data: fixture.events });
  });

  console.log(
    `Seeded ${count} promotion catalogue fixtures${removed ? ` after replacing ${removed} previous fixture(s)` : ""}.`,
  );
  console.log(`Fixture id prefix: ${FIXTURE_PREFIX}`);
  console.log(`Translations: ${LOCALES.length}/${LOCALES.length} per campaign`);
  printCounts("Lifecycle distribution:", fixture.stateCounts);
  printCounts("Scope distribution:", fixture.scopeCounts);
  console.log(
    `Active plans available to PLAN fixtures: ${plans.length}${plans.length ? "" : " (scope skipped)"}`,
  );
  console.log(
    `Shops available to SHOP fixtures: ${shops.length}${shops.length ? "" : " (scope skipped)"}`,
  );
  console.log("Suggested catalogue checks:");
  console.log("  - default page size 5 and Next/Previous navigation");
  console.log("  - page sizes 10, 20 and 50");
  console.log("  - State filters: DRAFT, SCHEDULED, RUNNING, EXPIRED, CLOSED");
  console.log("  - Scope filters: GLOBAL, PLAN, SHOP");
  console.log("  - Target/name search using a fixture name, plan name or shop domain");
}

main()
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Promotion fixture seeding failed.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
