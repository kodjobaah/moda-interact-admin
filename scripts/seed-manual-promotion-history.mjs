#!/usr/bin/env node
"use strict";

import {
  PlatformAdminRole,
  PrismaClient,
  PromotionCampaignEventType,
  PromotionCampaignStatus,
  PromotionTargetScope,
} from "@prisma/client";

const prisma = new PrismaClient();

const FIXTURE_PREFIX = "manual-promotion-history-";
const TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 20_000,
};

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

const SCENARIOS = [
  "selected",
  "used",
  "exhausted",
  "expired",
  "closed",
  "reopened",
  "no-longer-eligible",
];

const DAY_MS = 24 * 60 * 60 * 1000;

function usage() {
  return `
Manual promotion-history seed data

Usage:
  node scripts/seed-manual-promotion-history.mjs status --shop <shop>
  node scripts/seed-manual-promotion-history.mjs seed <scenario|all> --shop <shop> --confirm-test-data
  node scripts/seed-manual-promotion-history.mjs delete <scenario|all> --shop <shop> --confirm-test-data

Scenarios:
  selected
  used
  exhausted
  expired
  closed
  reopened
  no-longer-eligible
  all

Options:
  --shop <domain-or-id>          Required. Shopify domain or internal Shop.id.
  --copies <N>                   Number of rows per scenario. Default: 1. Max: 10.
  --confirm-test-data            Required for seed/delete mutations.
  --force-used-test-data         Allows deletion when real UsageReservation rows exist.
  --help                         Show this help.

Examples:
  node scripts/seed-manual-promotion-history.mjs seed all \
    --shop kwadwo-e4bf4mc4.myshopify.com \
    --confirm-test-data

  node scripts/seed-manual-promotion-history.mjs seed used \
    --shop kwadwo-e4bf4mc4.myshopify.com \
    --copies 5 \
    --confirm-test-data

  node scripts/seed-manual-promotion-history.mjs delete all \
    --shop kwadwo-e4bf4mc4.myshopify.com \
    --confirm-test-data
`.trim();
}

function argument(name) {
  const exact = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (exact) return exact.slice(name.length + 3);

  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function parseCopies() {
  const raw = argument("copies");
  if (raw === undefined) return 1;

  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 1 || value > 10) {
    throw new Error("--copies must be an integer between 1 and 10.");
  }
  return value;
}

function requireConfirmation() {
  if (!hasFlag("confirm-test-data")) {
    throw new Error(
      "Mutation refused. Re-run with --confirm-test-data to confirm this is disposable development/test data.",
    );
  }
}

function dateAt(now, days) {
  return new Date(now.getTime() + days * DAY_MS);
}

function safeFixtureToken(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function shopFixturePrefix(shopId) {
  return `${FIXTURE_PREFIX}${safeFixtureToken(shopId)}-`;
}

function fixtureId(shopId, scenario, copyIndex) {
  return `${shopFixturePrefix(shopId)}${scenario}-${String(copyIndex).padStart(2, "0")}`;
}

async function resolveShop(shopArgument) {
  if (!shopArgument) {
    throw new Error("--shop is required.");
  }

  const normalized = String(shopArgument).trim().toLowerCase();
  const shop = await prisma.shop.findFirst({
    where: {
      OR: [
        { id: shopArgument },
        { domain: normalized },
      ],
    },
    select: {
      id: true,
      domain: true,
      status: true,
      subscription: {
        select: {
          status: true,
          planId: true,
          plan: {
            select: {
              id: true,
              name: true,
              shopifyPlanHandle: true,
              active: true,
            },
          },
        },
      },
    },
  });

  if (!shop) {
    throw new Error(`Shop not found for --shop ${shopArgument}`);
  }

  return shop;
}

async function ensureDevelopmentAdmin(transaction) {
  const existing = await transaction.platformAdmin.findUnique({
    where: { id: DEVELOPMENT_ADMIN.id },
  });

  if (!existing) {
    return transaction.platformAdmin.create({ data: DEVELOPMENT_ADMIN });
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

async function findAlternatePlan(transaction, currentPlanId) {
  if (!currentPlanId) return null;

  return transaction.billingPlan.findFirst({
    where: {
      id: { not: currentPlanId },
    },
    orderBy: [
      { active: "desc" },
      { name: "asc" },
      { id: "asc" },
    ],
    select: {
      id: true,
      name: true,
      shopifyPlanHandle: true,
      active: true,
    },
  });
}

function scenarioDefinition(scenario, copyIndex, now) {
  const spread = (copyIndex - 1) * 2;

  switch (scenario) {
    case "selected":
      return {
        quantity: 10,
        reservedQuantity: 0,
        committedQuantity: 0,
        selectionCount: 1,
        firstSelectedAt: dateAt(now, -30 - spread),
        lastSelectedAt: dateAt(now, -30 - spread),
        firstUsedAt: null,
        lastUsedAt: null,
        exhaustedAt: null,
        status: PromotionCampaignStatus.ACTIVE,
        startsAt: dateAt(now, -45 - spread),
        expiresAt: dateAt(now, 45 + spread),
        scope: PromotionTargetScope.GLOBAL,
        events: ["CREATED", "ACTIVATED"],
      };

    case "used":
      return {
        quantity: 12,
        reservedQuantity: 1,
        committedQuantity: 4,
        selectionCount: 2,
        firstSelectedAt: dateAt(now, -35 - spread),
        lastSelectedAt: dateAt(now, -12 - spread),
        firstUsedAt: dateAt(now, -25 - spread),
        lastUsedAt: dateAt(now, -3 - spread),
        exhaustedAt: null,
        status: PromotionCampaignStatus.ACTIVE,
        startsAt: dateAt(now, -50 - spread),
        expiresAt: dateAt(now, 35 + spread),
        scope: PromotionTargetScope.GLOBAL,
        events: ["CREATED", "ACTIVATED"],
      };

    case "exhausted":
      return {
        quantity: 8,
        reservedQuantity: 0,
        committedQuantity: 8,
        selectionCount: 1,
        firstSelectedAt: dateAt(now, -45 - spread),
        lastSelectedAt: dateAt(now, -45 - spread),
        firstUsedAt: dateAt(now, -35 - spread),
        lastUsedAt: dateAt(now, -3 - spread),
        exhaustedAt: dateAt(now, -3 - spread),
        status: PromotionCampaignStatus.ACTIVE,
        startsAt: dateAt(now, -60 - spread),
        expiresAt: dateAt(now, 25 + spread),
        scope: PromotionTargetScope.GLOBAL,
        events: ["CREATED", "ACTIVATED"],
      };

    case "expired":
      return {
        quantity: 7,
        reservedQuantity: 0,
        committedQuantity: 2,
        selectionCount: 1,
        firstSelectedAt: dateAt(now, -75 - spread),
        lastSelectedAt: dateAt(now, -75 - spread),
        firstUsedAt: dateAt(now, -60 - spread),
        lastUsedAt: dateAt(now, -50 - spread),
        exhaustedAt: null,
        status: PromotionCampaignStatus.ACTIVE,
        startsAt: dateAt(now, -90 - spread),
        expiresAt: dateAt(now, -7 - spread),
        scope: PromotionTargetScope.GLOBAL,
        events: ["CREATED", "ACTIVATED"],
      };

    case "closed":
      return {
        quantity: 6,
        reservedQuantity: 0,
        committedQuantity: 1,
        selectionCount: 1,
        firstSelectedAt: dateAt(now, -60 - spread),
        lastSelectedAt: dateAt(now, -60 - spread),
        firstUsedAt: dateAt(now, -50 - spread),
        lastUsedAt: dateAt(now, -50 - spread),
        exhaustedAt: null,
        status: PromotionCampaignStatus.CLOSED,
        startsAt: dateAt(now, -75 - spread),
        expiresAt: dateAt(now, 20 + spread),
        scope: PromotionTargetScope.GLOBAL,
        events: ["CREATED", "ACTIVATED", "CLOSED"],
      };

    case "reopened":
      return {
        quantity: 9,
        reservedQuantity: 1,
        committedQuantity: 3,
        selectionCount: 2,
        firstSelectedAt: dateAt(now, -70 - spread),
        lastSelectedAt: dateAt(now, -4 - spread),
        firstUsedAt: dateAt(now, -55 - spread),
        lastUsedAt: dateAt(now, -20 - spread),
        exhaustedAt: null,
        status: PromotionCampaignStatus.ACTIVE,
        startsAt: dateAt(now, -85 - spread),
        expiresAt: dateAt(now, 50 + spread),
        scope: PromotionTargetScope.GLOBAL,
        events: ["CREATED", "ACTIVATED", "CLOSED", "REOPENED"],
      };

    case "no-longer-eligible":
      return {
        quantity: 11,
        reservedQuantity: 0,
        committedQuantity: 2,
        selectionCount: 1,
        firstSelectedAt: dateAt(now, -40 - spread),
        lastSelectedAt: dateAt(now, -40 - spread),
        firstUsedAt: dateAt(now, -30 - spread),
        lastUsedAt: dateAt(now, -30 - spread),
        exhaustedAt: null,
        status: PromotionCampaignStatus.ACTIVE,
        startsAt: dateAt(now, -55 - spread),
        expiresAt: dateAt(now, 40 + spread),
        scope: PromotionTargetScope.PLAN,
        events: ["CREATED", "ACTIVATED"],
      };

    default:
      throw new Error(`Unsupported history scenario: ${scenario}`);
  }
}

function eventTime(kind, definition) {
  switch (kind) {
    case "CREATED":
      return dateAt(definition.startsAt, -2);
    case "ACTIVATED":
      return definition.startsAt;
    case "CLOSED":
      // A reopened fixture must have been closed before it was reopened.
      return definition.events.includes("REOPENED")
        ? dateAt(definition.lastSelectedAt ?? definition.startsAt, -6)
        : dateAt(definition.lastSelectedAt ?? definition.startsAt, 1);
    case "REOPENED":
      // Must be after first selection and after the CLOSED event for merchant
      // history to project REOPENED.
      return dateAt(definition.lastSelectedAt ?? definition.startsAt, -2);
    default:
      return definition.startsAt;
  }
}

function eventEnum(kind) {
  return PromotionCampaignEventType[kind];
}

function translationData(campaignId, scenario, copyIndex, now) {
  const scenarioLabel = scenario
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  return LOCALES.map((locale) => {
    const prefix = LOCALE_TEST_LABELS[locale] ?? "Test";
    const merchantTitle = `Promotion history — ${scenarioLabel} ${copyIndex}`;
    const merchantDescription =
      `Manual history fixture for ${scenarioLabel}. ` +
      "This promotion exists only to exercise merchant promotion-history rendering.";

    return {
      id: `${campaignId}-translation-${locale}`,
      promotionCampaignId: campaignId,
      locale,
      merchantTitle: locale === "en" ? merchantTitle : `${prefix} · ${merchantTitle}`,
      merchantDescription:
        locale === "en" ? merchantDescription : `${prefix} · ${merchantDescription}`,
      createdAt: now,
      updatedAt: now,
    };
  });
}

async function existingFixtureCampaigns(transaction, shopId, scenarios = null) {
  const prefix = shopFixturePrefix(shopId);
  const ids = scenarios
    ? scenarios.flatMap((scenario) =>
        Array.from({ length: 10 }, (_, index) => fixtureId(shopId, scenario, index + 1)),
      )
    : null;

  return transaction.promotionCampaign.findMany({
    where: ids
      ? { id: { in: ids } }
      : { id: { startsWith: prefix } },
    select: {
      id: true,
      name: true,
      promotionalCreditGrants: {
        where: { shopId },
        select: {
          id: true,
          quantity: true,
          reservedQuantity: true,
          committedQuantity: true,
          reservations: {
            select: {
              id: true,
              status: true,
              quantity: true,
            },
          },
          selection: {
            select: {
              id: true,
              shopId: true,
            },
          },
        },
      },
    },
  });
}

async function deleteFixtureCampaigns(transaction, shopId, scenarios, forceUsedTestData) {
  const campaigns = await existingFixtureCampaigns(transaction, shopId, scenarios);
  if (campaigns.length === 0) {
    return { campaigns: 0, grants: 0, reservations: 0, selections: 0 };
  }

  const grantIds = campaigns.flatMap((campaign) =>
    campaign.promotionalCreditGrants.map((grant) => grant.id),
  );
  const reservations = campaigns.flatMap((campaign) =>
    campaign.promotionalCreditGrants.flatMap((grant) => grant.reservations),
  );

  if (reservations.length > 0 && !forceUsedTestData) {
    throw new Error(
      [
        "Refusing to delete history fixtures that now have real UsageReservation rows.",
        `Found ${reservations.length} reservation(s) for this shop's manual history fixtures.`,
        "Re-run with --force-used-test-data only if this is disposable development/test state.",
      ].join("\n"),
    );
  }

  const selectionsDeleted =
    grantIds.length === 0
      ? { count: 0 }
      : await transaction.merchantPromotionSelection.deleteMany({
          where: {
            shopId,
            promotionalCreditGrantId: { in: grantIds },
          },
        });

  let reservationsDeleted = { count: 0 };
  if (forceUsedTestData && grantIds.length > 0) {
    reservationsDeleted = await transaction.usageReservation.deleteMany({
      where: {
        shopId,
        promotionalCreditGrantId: { in: grantIds },
      },
    });
  }

  const grantsDeleted =
    grantIds.length === 0
      ? { count: 0 }
      : await transaction.promotionalCreditGrant.deleteMany({
          where: {
            shopId,
            id: { in: grantIds },
          },
        });

  const campaignIds = campaigns.map((campaign) => campaign.id);

  await transaction.promotionCampaignEvent.deleteMany({
    where: { campaignId: { in: campaignIds } },
  });

  await transaction.promotionCampaignTranslation.deleteMany({
    where: { promotionCampaignId: { in: campaignIds } },
  });

  const campaignsDeleted = await transaction.promotionCampaign.deleteMany({
    where: { id: { in: campaignIds } },
  });

  return {
    campaigns: campaignsDeleted.count,
    grants: grantsDeleted.count,
    reservations: reservationsDeleted.count,
    selections: selectionsDeleted.count,
  };
}

async function seedScenario({
  transaction,
  shop,
  admin,
  scenario,
  copyIndex,
  now,
  alternatePlan,
  createCurrentSelection,
}) {
  const definition = scenarioDefinition(scenario, copyIndex, now);

  if (scenario === "no-longer-eligible" && !alternatePlan) {
    return {
      skipped: true,
      scenario,
      copyIndex,
      reason:
        "No alternate BillingPlan exists, so a deterministic NO_LONGER_ELIGIBLE PLAN fixture cannot be created.",
    };
  }

  const id = fixtureId(shop.id, scenario, copyIndex);
  const scenarioLabel = scenario
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  const targetPlanId = scenario === "no-longer-eligible" ? alternatePlan.id : null;

  const campaign = await transaction.promotionCampaign.create({
    data: {
      id,
      name: `Manual promotion history · ${scenarioLabel} · ${shop.domain} · ${copyIndex}`,
      merchantDescription: null,
      scope: definition.scope,
      quantity: definition.quantity,
      targetPlanId,
      targetShopId: null,
      startsAt: definition.startsAt,
      expiresAt: definition.expiresAt,
      status: definition.status,
      createdByPlatformAdminId: admin.id,
      createdAt: eventTime("CREATED", definition),
      updatedAt: now,
      version: definition.events.includes("REOPENED")
        ? 3
        : definition.events.includes("CLOSED")
          ? 2
          : definition.events.includes("ACTIVATED")
            ? 1
            : 0,
    },
  });

  await transaction.promotionCampaignTranslation.createMany({
    data: translationData(id, scenario, copyIndex, eventTime("CREATED", definition)),
  });

  for (const kind of definition.events) {
    await transaction.promotionCampaignEvent.create({
      data: {
        id: `${id}-event-${kind.toLowerCase()}`,
        campaignId: id,
        kind: eventEnum(kind),
        oldExpiresAt: null,
        newExpiresAt: null,
        platformAdminId: admin.id,
        createdAt: eventTime(kind, definition),
      },
    });
  }

  const grant = await transaction.promotionalCreditGrant.create({
    data: {
      id: `${id}-grant`,
      shopId: shop.id,
      campaignId: id,
      quantity: definition.quantity,
      reservedQuantity: definition.reservedQuantity,
      committedQuantity: definition.committedQuantity,
      firstSelectedAt: definition.firstSelectedAt,
      lastSelectedAt: definition.lastSelectedAt,
      selectionCount: definition.selectionCount,
      firstUsedAt: definition.firstUsedAt,
      lastUsedAt: definition.lastUsedAt,
      exhaustedAt: definition.exhaustedAt,
      version: 0,
      createdAt: definition.firstSelectedAt ?? campaign.createdAt,
    },
  });

  let currentlySelected = false;
  if (createCurrentSelection) {
    const existingSelection = await transaction.merchantPromotionSelection.findUnique({
      where: { shopId: shop.id },
      select: { id: true, promotionalCreditGrantId: true },
    });

    if (!existingSelection) {
      await transaction.merchantPromotionSelection.create({
        data: {
          id: `${id}-selection`,
          shopId: shop.id,
          promotionalCreditGrantId: grant.id,
          selectedAt: definition.lastSelectedAt ?? now,
          version: 0,
        },
      });
      currentlySelected = true;
    }
  }

  return {
    skipped: false,
    scenario,
    copyIndex,
    campaignId: id,
    status: definition.status,
    scope: definition.scope,
    quantity: definition.quantity,
    committed: definition.committedQuantity,
    reserved: definition.reservedQuantity,
    currentlySelected,
    targetPlan:
      scenario === "no-longer-eligible"
        ? {
            id: alternatePlan.id,
            name: alternatePlan.name,
            shopifyPlanHandle: alternatePlan.shopifyPlanHandle,
          }
        : null,
  };
}

async function seedHistory(shop, requestedScenario, copies) {
  requireConfirmation();

  const scenarios =
    requestedScenario === "all" ? SCENARIOS : [requestedScenario];

  for (const scenario of scenarios) {
    if (!SCENARIOS.includes(scenario)) {
      throw new Error(
        `Unknown scenario "${scenario}". Expected one of: ${SCENARIOS.join(", ")}, all.`,
      );
    }
  }

  const now = new Date();

  return prisma.$transaction(
    async (transaction) => {
      const admin = await ensureDevelopmentAdmin(transaction);
      const alternatePlan = await findAlternatePlan(
        transaction,
        shop.subscription?.planId ?? null,
      );

      // Reseeding is deterministic. Remove only this shop's requested manual fixtures.
      await deleteFixtureCampaigns(
        transaction,
        shop.id,
        scenarios,
        hasFlag("force-used-test-data"),
      );

      const results = [];
      let currentSelectionCreated = false;

      for (const scenario of scenarios) {
        for (let copyIndex = 1; copyIndex <= copies; copyIndex += 1) {
          const result = await seedScenario({
            transaction,
            shop,
            admin,
            scenario,
            copyIndex,
            now,
            alternatePlan,
            // Only the first SELECTED fixture may become current, and only when the
            // shop does not already have an existing current selection.
            createCurrentSelection:
              !currentSelectionCreated &&
              scenario === "selected" &&
              copyIndex === 1,
          });

          if (!result.skipped && result.currentlySelected) {
            currentSelectionCreated = true;
          }

          results.push(result);
        }
      }

      return results;
    },
    TRANSACTION_OPTIONS,
  );
}

async function deleteHistory(shop, requestedScenario) {
  requireConfirmation();

  const scenarios =
    requestedScenario === "all" ? null : [requestedScenario];

  if (
    requestedScenario !== "all" &&
    !SCENARIOS.includes(requestedScenario)
  ) {
    throw new Error(
      `Unknown scenario "${requestedScenario}". Expected one of: ${SCENARIOS.join(", ")}, all.`,
    );
  }

  return prisma.$transaction(
    (transaction) =>
      deleteFixtureCampaigns(
        transaction,
        shop.id,
        scenarios,
        hasFlag("force-used-test-data"),
      ),
    TRANSACTION_OPTIONS,
  );
}

async function status(shop) {
  const campaigns = await existingFixtureCampaigns(prisma, shop.id, null);

  const rows = campaigns
    .flatMap((campaign) =>
      campaign.promotionalCreditGrants.map((grant) => ({
        campaignId: campaign.id,
        name: campaign.name,
        grantId: grant.id,
        quantity: grant.quantity,
        reserved: grant.reservedQuantity,
        committed: grant.committedQuantity,
        remaining: Math.max(
          0,
          grant.quantity - grant.reservedQuantity - grant.committedQuantity,
        ),
        currentlySelected: Boolean(grant.selection),
        reservations: grant.reservations.length,
      })),
    )
    .sort((a, b) => a.campaignId.localeCompare(b.campaignId));

  console.log("");
  console.log("Manual promotion-history fixtures");
  console.log("=================================");
  console.log(`Shop: ${shop.domain}`);
  console.log(`Shop ID: ${shop.id}`);
  console.log(
    `Current billing plan: ${
      shop.subscription?.plan?.name ??
      shop.subscription?.planId ??
      "(none)"
    }`,
  );
  console.log("");

  if (rows.length === 0) {
    console.log("No manual promotion-history fixtures exist for this shop.");
    return;
  }

  console.table(rows);
}

async function main() {
  const [command, target] = process.argv.slice(2);

  if (!command || command === "--help" || command === "-h") {
    console.log(usage());
    return;
  }

  const shop = await resolveShop(argument("shop"));

  if (command === "status") {
    await status(shop);
    return;
  }

  if (command === "seed") {
    if (!target) {
      throw new Error("seed requires a scenario or all.");
    }

    const results = await seedHistory(shop, target, parseCopies());

    console.log("");
    console.log("Promotion-history seed complete");
    console.log("===============================");
    console.log(`Shop: ${shop.domain}`);
    console.log("");

    const created = results.filter((result) => !result.skipped);
    const skipped = results.filter((result) => result.skipped);

    console.table(
      created.map((result) => ({
        scenario: result.scenario,
        copy: result.copyIndex,
        campaignId: result.campaignId,
        scope: result.scope,
        quantity: result.quantity,
        reserved: result.reserved,
        committed: result.committed,
        current: result.currentlySelected ? "YES" : "NO",
      })),
    );

    if (skipped.length > 0) {
      console.log("");
      console.log("Skipped:");
      for (const result of skipped) {
        console.log(
          `- ${result.scenario} copy ${result.copyIndex}: ${result.reason}`,
        );
      }
    }

    console.log("");
    console.log(
      "Open the merchant Promotions page and inspect Promotion history manually.",
    );
    return;
  }

  if (command === "delete") {
    if (!target) {
      throw new Error("delete requires a scenario or all.");
    }

    const result = await deleteHistory(shop, target);

    console.log("");
    console.log("Promotion-history fixtures deleted");
    console.log("==================================");
    console.log(`Shop: ${shop.domain}`);
    console.table([result]);
    return;
  }

  throw new Error(`Unknown command "${command}".\n\n${usage()}`);
}

main()
  .catch((error) => {
    console.error(
      `seed-manual-promotion-history: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
