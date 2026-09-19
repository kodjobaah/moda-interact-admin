#!/usr/bin/env node

import process from "node:process";
import {
  PlatformAdminRole,
  PrismaClient,
  PromotionCampaignEventType,
  PromotionCampaignStatus,
  PromotionTargetScope,
} from "@prisma/client";

const prisma = new PrismaClient();

const CONFIRM_FLAG = "--confirm-test-data";
const FORCE_USED_FLAG = "--force-used-test-data";
const FIXTURE_PREFIX = "manual-test-promotion-";
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

const TITLE_TEMPLATES = {
  cs: (quantity) => `Testovací akce — ${quantity} kreditů pro obnovu`,
  da: (quantity) => `Testkampagne — ${quantity} recovery-kreditter`,
  de: (quantity) => `Testaktion — ${quantity} Recovery-Credits`,
  en: (quantity) => `Test promotion — ${quantity} recovery credits`,
  es: (quantity) => `Promoción de prueba — ${quantity} créditos de recuperación`,
  fi: (quantity) => `Testikampanja — ${quantity} palautuskrediittiä`,
  fr: (quantity) => `Promotion test — ${quantity} crédits de récupération`,
  it: (quantity) => `Promozione di prova — ${quantity} crediti di recupero`,
  ja: (quantity) => `テストプロモーション — リカバリークレジット ${quantity} 件`,
  ko: (quantity) => `테스트 프로모션 — 복구 크레딧 ${quantity}개`,
  nb: (quantity) => `Testkampanje — ${quantity} gjenopprettingskreditter`,
  nl: (quantity) => `Testpromotie — ${quantity} herstelcredits`,
  pl: (quantity) => `Promocja testowa — ${quantity} kredytów odzyskiwania`,
  "pt-BR": (quantity) => `Promoção de teste — ${quantity} créditos de recuperação`,
  "pt-PT": (quantity) => `Promoção de teste — ${quantity} créditos de recuperação`,
  sv: (quantity) => `Testkampanj — ${quantity} återställningskrediter`,
  th: (quantity) => `โปรโมชันทดสอบ — เครดิตการกู้คืน ${quantity} เครดิต`,
  tr: (quantity) => `Test promosyonu — ${quantity} kurtarma kredisi`,
  "zh-Hans": (quantity) => `测试促销 — ${quantity} 个恢复积分`,
  "zh-Hant": (quantity) => `測試促銷 — ${quantity} 個恢復點數`,
};

const DESCRIPTION_TEMPLATES = {
  cs: (quantity, target) => `Ruční testovací akce pro ${target}. Po výběru přidá ${quantity} propagačních kreditů pro obnovu.`,
  da: (quantity, target) => `Manuel testkampagne for ${target}. Ved valg tilføjes ${quantity} salgsfremmende recovery-kreditter.`,
  de: (quantity, target) => `Manuelle Testaktion für ${target}. Bei Auswahl werden ${quantity} zusätzliche Recovery-Credits gutgeschrieben.`,
  en: (quantity, target) => `Manual test promotion for ${target}. Selecting it adds ${quantity} promotional recovery credits.`,
  es: (quantity, target) => `Promoción de prueba manual para ${target}. Al seleccionarla se añaden ${quantity} créditos de recuperación promocionales.`,
  fi: (quantity, target) => `Manuaalinen testikampanja kohteelle ${target}. Valinta lisää ${quantity} kampanjapalautuskrediittiä.`,
  fr: (quantity, target) => `Promotion de test manuelle pour ${target}. Sa sélection ajoute ${quantity} crédits de récupération promotionnels.`,
  it: (quantity, target) => `Promozione di prova manuale per ${target}. Se selezionata aggiunge ${quantity} crediti di recupero promozionali.`,
  ja: (quantity, target) => `${target} 向けの手動テストプロモーションです。選択するとプロモーション用リカバリークレジットが ${quantity} 件追加されます。`,
  ko: (quantity, target) => `${target}용 수동 테스트 프로모션입니다. 선택하면 프로모션 복구 크레딧 ${quantity}개가 추가됩니다.`,
  nb: (quantity, target) => `Manuell testkampanje for ${target}. Ved valg legges ${quantity} kampanjekreditter til.`,
  nl: (quantity, target) => `Handmatige testpromotie voor ${target}. Selecteren voegt ${quantity} promotionele herstelcredits toe.`,
  pl: (quantity, target) => `Ręczna promocja testowa dla ${target}. Wybranie jej dodaje ${quantity} promocyjnych kredytów odzyskiwania.`,
  "pt-BR": (quantity, target) => `Promoção de teste manual para ${target}. Ao selecionar, são adicionados ${quantity} créditos promocionais de recuperação.`,
  "pt-PT": (quantity, target) => `Promoção de teste manual para ${target}. Ao selecionar, são adicionados ${quantity} créditos promocionais de recuperação.`,
  sv: (quantity, target) => `Manuell testkampanj för ${target}. När den väljs läggs ${quantity} kampanjkrediter för återställning till.`,
  th: (quantity, target) => `โปรโมชันทดสอบแบบกำหนดเองสำหรับ ${target} เมื่อเลือกจะเพิ่มเครดิตการกู้คืนจากโปรโมชัน ${quantity} เครดิต`,
  tr: (quantity, target) => `${target} için manuel test promosyonu. Seçildiğinde ${quantity} promosyon kurtarma kredisi ekler.`,
  "zh-Hans": (quantity, target) => `${target} 的手动测试促销。选择后会增加 ${quantity} 个促销恢复积分。`,
  "zh-Hant": (quantity, target) => `${target} 的手動測試促銷。選取後會增加 ${quantity} 個促銷恢復點數。`,
};

function hasFlag(name) {
  return process.argv.includes(name);
}

function argument(name) {
  const prefix = `${name}=`;
  const exact = process.argv.find((value) => value.startsWith(prefix));
  if (exact) return exact.slice(prefix.length);

  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requireConfirmation() {
  if (!hasFlag(CONFIRM_FLAG)) {
    throw new Error(
      `Refusing to mutate promotion test data without ${CONFIRM_FLAG}.`,
    );
  }
}

function parsePositiveInteger(raw, fallback, label) {
  if (raw === undefined) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}

function slug(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

function normalizeScope(raw) {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "global") return PromotionTargetScope.GLOBAL;
  if (value === "plan" || value === "tiered" || value === "tier") {
    return PromotionTargetScope.PLAN;
  }
  if (value === "shop") return PromotionTargetScope.SHOP;
  throw new Error("Scope must be one of: global, plan (or tiered), shop.");
}

function lifecycleForState(rawState, now, durationDays) {
  const state = String(rawState ?? "running").trim().toLowerCase();
  const dayMs = 24 * 60 * 60 * 1000;

  if (state === "draft") {
    return {
      label: "DRAFT",
      status: PromotionCampaignStatus.DRAFT,
      startsAt: new Date(now.getTime() + dayMs),
      expiresAt: new Date(now.getTime() + (durationDays + 1) * dayMs),
      eventKinds: [PromotionCampaignEventType.CREATED],
      version: 0,
    };
  }

  if (state === "scheduled") {
    return {
      label: "SCHEDULED",
      status: PromotionCampaignStatus.ACTIVE,
      startsAt: new Date(now.getTime() + dayMs),
      expiresAt: new Date(now.getTime() + (durationDays + 1) * dayMs),
      eventKinds: [
        PromotionCampaignEventType.CREATED,
        PromotionCampaignEventType.ACTIVATED,
      ],
      version: 1,
    };
  }

  if (state === "running") {
    return {
      label: "RUNNING",
      status: PromotionCampaignStatus.ACTIVE,
      startsAt: new Date(now.getTime() - dayMs),
      expiresAt: new Date(now.getTime() + durationDays * dayMs),
      eventKinds: [
        PromotionCampaignEventType.CREATED,
        PromotionCampaignEventType.ACTIVATED,
      ],
      version: 1,
    };
  }

  if (state === "expired") {
    return {
      label: "EXPIRED",
      status: PromotionCampaignStatus.ACTIVE,
      startsAt: new Date(now.getTime() - (durationDays + 1) * dayMs),
      expiresAt: new Date(now.getTime() - dayMs),
      eventKinds: [
        PromotionCampaignEventType.CREATED,
        PromotionCampaignEventType.ACTIVATED,
      ],
      version: 1,
    };
  }

  if (state === "closed") {
    return {
      label: "CLOSED",
      status: PromotionCampaignStatus.CLOSED,
      startsAt: new Date(now.getTime() - dayMs),
      expiresAt: new Date(now.getTime() + durationDays * dayMs),
      eventKinds: [
        PromotionCampaignEventType.CREATED,
        PromotionCampaignEventType.ACTIVATED,
        PromotionCampaignEventType.CLOSED,
      ],
      version: 2,
    };
  }

  throw new Error(
    "--state must be one of: draft, scheduled, running, expired, closed.",
  );
}

async function ensureDevelopmentAdmin(transaction) {
  const existing = await transaction.platformAdmin.findUnique({
    where: { id: DEVELOPMENT_ADMIN.id },
  });

  if (!existing) {
    return transaction.platformAdmin.create({ data: DEVELOPMENT_ADMIN });
  }

  const matches =
    existing.provider === DEVELOPMENT_ADMIN.provider &&
    existing.providerSubject === DEVELOPMENT_ADMIN.providerSubject &&
    existing.email === DEVELOPMENT_ADMIN.email &&
    existing.displayName === DEVELOPMENT_ADMIN.displayName &&
    existing.role === DEVELOPMENT_ADMIN.role &&
    existing.active === DEVELOPMENT_ADMIN.active;

  if (!matches) {
    throw new Error(
      "The reserved development-platform-admin row conflicts with the expected test identity.",
    );
  }

  return existing;
}

async function resolvePlan(raw) {
  if (!raw) {
    throw new Error(
      "A PLAN/tiered promotion requires --plan <shopify handle, billing plan id, or plan name>.",
    );
  }

  const plans = await prisma.billingPlan.findMany({
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      shopifyPlanHandle: true,
      active: true,
    },
  });

  const needle = String(raw).trim().toLowerCase();
  const plan = plans.find(
    (candidate) =>
      candidate.id.toLowerCase() === needle ||
      candidate.shopifyPlanHandle.toLowerCase() === needle ||
      candidate.name.toLowerCase() === needle,
  );

  if (!plan) {
    throw new Error(
      `BillingPlan target '${raw}' was not found. Available plans: ${
        plans.length
          ? plans
              .map(
                (candidate) =>
                  `${candidate.shopifyPlanHandle} (${candidate.name}, ${candidate.active ? "active" : "inactive"})`,
              )
              .join(", ")
          : "none"
      }`,
    );
  }

  if (!plan.active) {
    throw new Error(
      `BillingPlan '${plan.shopifyPlanHandle}' is inactive. Merchant promotion selection requires an active plan.`,
    );
  }

  return plan;
}

async function resolveShop(raw) {
  if (!raw) {
    throw new Error(
      "A SHOP promotion requires --shop <myshopify domain or shop id>.",
    );
  }

  const shops = await prisma.shop.findMany({
    orderBy: [{ domain: "asc" }, { id: "asc" }],
    select: { id: true, domain: true, status: true },
  });

  const needle = String(raw).trim().toLowerCase();
  const shop = shops.find(
    (candidate) =>
      candidate.id.toLowerCase() === needle ||
      candidate.domain.toLowerCase() === needle,
  );

  if (!shop) {
    throw new Error(`Shop '${raw}' was not found.`);
  }

  return shop;
}

async function resolveTarget(scope) {
  if (scope === PromotionTargetScope.GLOBAL) {
    return {
      fixtureKey: "global",
      targetLabel: "all eligible merchants",
      targetPlanId: null,
      targetShopId: null,
      plan: null,
      shop: null,
    };
  }

  if (scope === PromotionTargetScope.PLAN) {
    const plan = await resolvePlan(argument("--plan"));
    return {
      fixtureKey: `plan-${plan.id}`,
      targetLabel: `plan ${plan.name} (${plan.shopifyPlanHandle})`,
      targetPlanId: plan.id,
      targetShopId: null,
      plan,
      shop: null,
    };
  }

  const shop = await resolveShop(argument("--shop"));
  return {
    fixtureKey: `shop-${shop.id}`,
    targetLabel: `shop ${shop.domain}`,
    targetPlanId: null,
    targetShopId: shop.id,
    plan: null,
    shop,
  };
}

function campaignId(scope, target) {
  return `${FIXTURE_PREFIX}${scope.toLowerCase()}-${slug(target.fixtureKey)}`;
}

function defaultQuantity(scope) {
  if (scope === PromotionTargetScope.GLOBAL) return 3;
  if (scope === PromotionTargetScope.PLAN) return 5;
  return 8;
}

function buildTranslations(id, quantity, targetLabel, now) {
  return LOCALES.map((locale) => ({
    id: `${id}-translation-${locale}`,
    promotionCampaignId: id,
    locale,
    merchantTitle: TITLE_TEMPLATES[locale](quantity),
    merchantDescription: DESCRIPTION_TEMPLATES[locale](quantity, targetLabel),
    createdAt: now,
    updatedAt: now,
  }));
}

async function fixtureWithUsage(id) {
  return prisma.promotionCampaign.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      scope: true,
      quantity: true,
      targetPlanId: true,
      targetShopId: true,
      promotionalCreditGrants: {
        select: {
          id: true,
          shopId: true,
          quantity: true,
          reservedQuantity: true,
          committedQuantity: true,
          selectionCount: true,
          _count: { select: { reservations: true } },
        },
      },
    },
  });
}

function usageBlockers(campaign) {
  if (!campaign) return [];

  return campaign.promotionalCreditGrants.filter(
    (grant) =>
      grant.reservedQuantity > 0 ||
      grant.committedQuantity > 0 ||
      grant._count.reservations > 0,
  );
}

async function deleteCampaignIds(ids, { forceUsed }) {
  if (!ids.length) return 0;

  const campaigns = await prisma.promotionCampaign.findMany({
    where: { AND: [{ id: { in: ids } }, { id: { startsWith: FIXTURE_PREFIX } }] },
    select: {
      id: true,
      name: true,
      promotionalCreditGrants: {
        select: {
          id: true,
          shopId: true,
          reservedQuantity: true,
          committedQuantity: true,
          _count: { select: { reservations: true } },
        },
      },
    },
  });

  const blockers = campaigns.flatMap((campaign) =>
    usageBlockers(campaign).map((grant) => ({ campaign, grant })),
  );

  if (blockers.length && !forceUsed) {
    throw new Error(
      [
        "Refusing to delete promotion fixtures with consumed/reserved usage.",
        ...blockers.map(
          ({ campaign, grant }) =>
            `- ${campaign.id} (${campaign.name}), shop=${grant.shopId}: reserved=${grant.reservedQuantity}, committed=${grant.committedQuantity}, reservations=${grant._count.reservations}`,
        ),
        `Re-run with ${FORCE_USED_FLAG} only if you intentionally want to remove that disposable test history.`,
      ].join("\n"),
    );
  }

  const campaignIds = campaigns.map((campaign) => campaign.id);
  if (!campaignIds.length) return 0;

  const grantIds = campaigns.flatMap((campaign) =>
    campaign.promotionalCreditGrants.map((grant) => grant.id),
  );

  await prisma.$transaction(
    async (transaction) => {
      if (grantIds.length) {
        await transaction.merchantPromotionSelection.deleteMany({
          where: { promotionalCreditGrantId: { in: grantIds } },
        });

        if (forceUsed) {
          await transaction.usageReservation.deleteMany({
            where: { promotionalCreditGrantId: { in: grantIds } },
          });
        }

        await transaction.promotionalCreditGrant.deleteMany({
          where: { id: { in: grantIds } },
        });
      }

      await transaction.promotionCampaignEvent.deleteMany({
        where: { campaignId: { in: campaignIds } },
      });
      await transaction.promotionCampaignTranslation.deleteMany({
        where: { promotionCampaignId: { in: campaignIds } },
      });
      await transaction.promotionCampaign.deleteMany({
        where: { id: { in: campaignIds } },
      });
    },
    TRANSACTION_OPTIONS,
  );

  return campaignIds.length;
}

async function seed(scope) {
  requireConfirmation();

  const target = await resolveTarget(scope);
  const id = campaignId(scope, target);
  const existing = await fixtureWithUsage(id);

  if (existing?.promotionalCreditGrants.length) {
    throw new Error(
      [
        `Fixture ${id} already has ${existing.promotionalCreditGrants.length} merchant grant(s).`,
        "Delete that fixture first so reseeding cannot silently rewrite merchant promotion history.",
      ].join("\n"),
    );
  }

  if (existing) {
    await deleteCampaignIds([id], { forceUsed: false });
  }

  const quantity = parsePositiveInteger(
    argument("--quantity"),
    defaultQuantity(scope),
    "--quantity",
  );
  const durationDays = parsePositiveInteger(
    argument("--days"),
    30,
    "--days",
  );
  const now = new Date();
  const lifecycle = lifecycleForState(argument("--state"), now, durationDays);
  const requestedName = argument("--name")?.trim();
  const name =
    requestedName ||
    `Manual ${scope} promotion · ${target.targetLabel} · ${lifecycle.label}`;
  const translations = buildTranslations(id, quantity, target.targetLabel, now);

  await prisma.$transaction(
    async (transaction) => {
      const admin = await ensureDevelopmentAdmin(transaction);

      await transaction.promotionCampaign.create({
        data: {
          id,
          name,
          merchantDescription: null,
          scope,
          quantity,
          targetPlanId: target.targetPlanId,
          targetShopId: target.targetShopId,
          startsAt: lifecycle.startsAt,
          expiresAt: lifecycle.expiresAt,
          status: lifecycle.status,
          createdByPlatformAdminId: admin.id,
          createdAt: now,
          updatedAt: now,
          version: lifecycle.version,
        },
      });

      await transaction.promotionCampaignTranslation.createMany({
        data: translations,
      });

      for (let index = 0; index < lifecycle.eventKinds.length; index += 1) {
        await transaction.promotionCampaignEvent.create({
          data: {
            id: `${id}-event-${index + 1}`,
            campaignId: id,
            kind: lifecycle.eventKinds[index],
            platformAdminId: admin.id,
            createdAt: new Date(now.getTime() + index * 1000),
          },
        });
      }
    },
    TRANSACTION_OPTIONS,
  );

  console.log("Seeded manual promotion fixture.");
  console.log(`  id:       ${id}`);
  console.log(`  scope:    ${scope}`);
  console.log(`  target:   ${target.targetLabel}`);
  console.log(`  state:    ${lifecycle.label}`);
  console.log(`  quantity: ${quantity}`);
  console.log(`  starts:   ${lifecycle.startsAt.toISOString()}`);
  console.log(`  expires:  ${lifecycle.expiresAt.toISOString()}`);
  console.log(`  locales:  ${LOCALES.length}/${LOCALES.length}`);
  if (target.shop) console.log(`  shop:     ${target.shop.domain}`);
  if (target.plan) {
    console.log(`  plan:     ${target.plan.name} (${target.plan.shopifyPlanHandle})`);
  }
  console.log("");
  console.log(
    "The campaign is catalogue data only. Selecting it in the merchant UI creates the PromotionalCreditGrant/selection through the real application flow.",
  );
}

async function deleteOne(scope) {
  requireConfirmation();
  const target = await resolveTarget(scope);
  const id = campaignId(scope, target);
  const removed = await deleteCampaignIds([id], {
    forceUsed: hasFlag(FORCE_USED_FLAG),
  });
  console.log(
    removed
      ? `Deleted promotion fixture ${id}.`
      : `No promotion fixture found for ${id}.`,
  );
}

async function deleteAll() {
  requireConfirmation();
  const campaigns = await prisma.promotionCampaign.findMany({
    where: { id: { startsWith: FIXTURE_PREFIX } },
    select: { id: true },
  });
  const removed = await deleteCampaignIds(
    campaigns.map((campaign) => campaign.id),
    { forceUsed: hasFlag(FORCE_USED_FLAG) },
  );
  console.log(`Deleted ${removed} manual promotion fixture(s).`);
}

function derivedState(campaign, now = new Date()) {
  if (campaign.status === PromotionCampaignStatus.DRAFT) return "DRAFT";
  if (campaign.status === PromotionCampaignStatus.CLOSED) return "CLOSED";
  if (campaign.startsAt > now) return "SCHEDULED";
  if (campaign.expiresAt <= now) return "EXPIRED";
  return "RUNNING";
}

async function status() {
  const campaigns = await prisma.promotionCampaign.findMany({
    where: { id: { startsWith: FIXTURE_PREFIX } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      scope: true,
      quantity: true,
      startsAt: true,
      expiresAt: true,
      status: true,
      targetPlan: { select: { name: true, shopifyPlanHandle: true } },
      targetShop: { select: { domain: true } },
      _count: {
        select: {
          translations: true,
          promotionalCreditGrants: true,
        },
      },
    },
  });

  if (!campaigns.length) {
    console.log("No manual promotion fixtures are currently seeded.");
    return;
  }

  console.table(
    campaigns.map((campaign) => ({
      id: campaign.id,
      scope: campaign.scope,
      target:
        campaign.scope === PromotionTargetScope.GLOBAL
          ? "all merchants"
          : campaign.scope === PromotionTargetScope.PLAN
            ? `${campaign.targetPlan?.name ?? "?"} (${campaign.targetPlan?.shopifyPlanHandle ?? "?"})`
            : campaign.targetShop?.domain ?? "?",
      state: derivedState(campaign),
      quantity: campaign.quantity,
      translations: campaign._count.translations,
      grants: campaign._count.promotionalCreditGrants,
      expiresAt: campaign.expiresAt.toISOString(),
    })),
  );
}

function printUsage() {
  console.log(`
Manual promotion fixture seeder

Usage:
  npm run admin:seed-promotion -- status

  npm run admin:seed-promotion -- seed global \\
    ${CONFIRM_FLAG}

  npm run admin:seed-promotion -- seed tiered \\
    --plan free \\
    ${CONFIRM_FLAG}

  npm run admin:seed-promotion -- seed shop \\
    --shop example.myshopify.com \\
    ${CONFIRM_FLAG}

  npm run admin:seed-promotion -- delete global \\
    ${CONFIRM_FLAG}

  npm run admin:seed-promotion -- delete tiered \\
    --plan free \\
    ${CONFIRM_FLAG}

  npm run admin:seed-promotion -- delete shop \\
    --shop example.myshopify.com \\
    ${CONFIRM_FLAG}

  npm run admin:seed-promotion -- delete all \\
    ${CONFIRM_FLAG}

Scope aliases:
  global          -> PromotionTargetScope.GLOBAL
  plan / tiered   -> PromotionTargetScope.PLAN
  shop            -> PromotionTargetScope.SHOP

Optional seed flags:
  --quantity <n>  Promotional recovery credits. Defaults: GLOBAL=3, PLAN=5, SHOP=8.
  --state <state> draft | scheduled | running | expired | closed. Default: running.
  --days <n>      Active-window length. Default: 30.
  --name <text>   Internal admin campaign name.

Deletion safety:
  By default deletion removes unused grants/selections created by real merchant selection,
  but refuses to delete a fixture with reserved/committed promotion usage or reservations.
  ${FORCE_USED_FLAG} also removes that disposable test reservation history.

All mutations require ${CONFIRM_FLAG}.
`.trim());
}

async function main() {
  const [command, rawScope] = process.argv.slice(2).filter(
    (value) => !value.startsWith("--"),
  );

  if (!command || command === "help") {
    printUsage();
    return;
  }

  if (command === "status") {
    await status();
    return;
  }

  if (command === "seed") {
    await seed(normalizeScope(rawScope));
    return;
  }

  if (command === "delete") {
    if (String(rawScope ?? "").toLowerCase() === "all") {
      await deleteAll();
      return;
    }
    await deleteOne(normalizeScope(rawScope));
    return;
  }

  throw new Error(`Unknown command '${command}'. Run with 'help' for usage.`);
}

main()
  .catch((error) => {
    console.error(
      `seed-manual-promotion: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
