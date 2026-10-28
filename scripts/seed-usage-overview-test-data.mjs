#!/usr/bin/env node
"use strict";

import process from "node:process";
import { Queue } from "bullmq";
import Redis from "ioredis";
import { PrismaClient } from "@prisma/client";
import { createRecoveryIdempotencyKey } from "@modainteract/moda-interact-shared/billing";
import { buildPaidAllowanceFixtures, verifyPaidFixtureCleanup } from "./usage-overview-paid-allocations.mjs";

const prisma = new PrismaClient();

const CONFIRM_FLAG = "--confirm-test-data";
const WITH_PENDING_FLAG = "--with-pending";
const WITH_HUMAN_FLAG = "--with-human-handover";
const PURGE_HUMAN_AUDIT_FLAG = "--purge-human-send-audit";
const WITH_PAST_PAID_HISTORY_FLAG = "--with-past-paid-history";
const LEGACY_HISTORICAL_PAID_PLAN_FLAG = "--historical-paid-plan-id";
const TEST_RECIPIENT_FLAG = "--test-recipient";
const CONFIRM_RECIPIENT_FLAG = "--confirm-test-recipient";
const PREFIX = "manual-usage-overview-";
const PENDING_QUEUE = "pending-recovery-candidates";
const PENDING_JOB = "evaluate-pending-recovery";
const PENDING_COUNT = 12;
const FREE_USAGE_EVENTS = 4;
const FREE_COUNTER = "LIFETIME_FREE_RECOVERY_CREDITS";
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const RECENT_INBOUND_AGE_MS = 5 * 60 * 1000;
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 20_000, isolationLevel: "Serializable" };

function usage() {
  return `
Usage Overview manual test-data seeder

Usage:
  node scripts/seed-usage-overview-test-data.mjs status --shop <domain-or-id>

  node scripts/seed-usage-overview-test-data.mjs seed \\
    --shop <domain-or-id> \\
    --confirm-test-data \\
    --with-past-paid-history

  node scripts/seed-usage-overview-test-data.mjs seed \\
    --shop <domain-or-id> \\
    --confirm-test-data

  node scripts/seed-usage-overview-test-data.mjs seed \\
    --shop <domain-or-id> \\
    --confirm-test-data \\
    --with-pending

  node scripts/seed-usage-overview-test-data.mjs seed \\
    --shop <domain-or-id> \\
    --confirm-test-data \\
    --with-human-handover \\
    --test-recipient <controlled-E164-number> \\
    --confirm-test-recipient

  node scripts/seed-usage-overview-test-data.mjs delete \\
    --shop <domain-or-id> \\
    --confirm-test-data

  node scripts/seed-usage-overview-test-data.mjs delete \\
    --shop <domain-or-id> \\
    --confirm-test-data \\
    --purge-human-send-audit

What seed creates:
  - 12 customer groups (11 named customers + 1 guest)
  - 13 checkout recoveries covering every recovery status
  - conversations and messages (SENT / DELIVERED / FAILED)
  - an available merchant-support system message linked to a sent recovery, with
    a direct link to its recovery conversation
  - Free plan: up to four lifetime usage events backed by fixture COMMITTED
    reservations and the real lifetime entitlement counter (no current billing period)
  - Optional --with-past-paid-history on a currently Free shop: three synthetic
    CLOSED periods with PAID_METERED plan snapshots (16 / 11 / 7 usage events),
    plus fixture-only committed included-allowance reservations/counters,
    modelling a past-paid-now-Free test-only scenario without a paid BillingPlan
  - Paid metered plan: 27 current-period usage events, three fixture CLOSED
    past periods (16 / 11 / 7 events), and usage pagination
  - customer names suffixed with the selected shop domain for visual identification
  - usage events tagged with the selected shop platform (SHOPIFY / WOOCOMMERCE)
  - with --with-pending: 12 delayed pending-recovery jobs for pending pagination
  - with --with-human-handover: recent inbound, initial outreach and basket
    fixtures for Grace (AI/open), Linus (HUMAN/open), Margaret (missing
    recipient), Barbara (closed/template), Donald (follow-up already used)
  - an approved WhatsApp template is NEVER fabricated; the real shop must
    already have one to test selection of an approved template
  - the recipient MUST be a number you control; sending can trigger real Meta
    traffic if Background is running, so use a disposable development database
  - writes require a database named for test/development and are refused in
    production; active merchant send commands prevent re-seeding

Important:
  - Every shop (Shopify or WooCommerce, Free or paid) MUST already have a
    real Subscription and BillingPlan. This script never changes them.
  - Free lifetime usage has no CURRENT BillingPeriod. Seeding temporarily
    commits up to four available Free credits, restored by "delete". Historical
    genuine paid periods (if any) are preserved.
  - Historical paid-period simulation is OPT-IN and permitted only in a disposable
    test/development database. It adds explicitly prefixed fixture CLOSED periods
    with planId NULL and an explicitly synthetic PAID_METERED plan snapshot.
    BillingPeriod.planId is nullable: the historical paid plan need not still be
    materialised in BillingPlan. Fixture-only historical entitlement counters are
    created and removed together with fixture reservations. No real subscription,
    current entitlement, charge, invoice, provider history or current billing
    period is changed. It is NOT evidence
    that an always-Free merchant actually had a past paid subscription.
  - Past periods for a truly never-paid Free merchant are correctly empty.
  - Paid metered requires the existing subscription's real OPEN BillingPeriod;
    the script never creates an unlinked fake current billing period.
  - Existing non-fixture usage and credit balances are preserved.
  - The Shopify Usage History reader is period-based, so Free lifetime events
    are for the hosted WooCommerce reader; Shopify Free UI needs its own reader.
  - Pending jobs are scheduled seven days into the future so a live recovery
    worker should not process them during normal manual testing.
`.trim();
}

function argument(name) {
  const exact = process.argv.find((value) => value.startsWith(`${name}=`));
  if (exact) return exact.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function validateHumanScenarioOptions() {
  if (!hasFlag(WITH_HUMAN_FLAG)) {
    if (argument(TEST_RECIPIENT_FLAG) || hasFlag(CONFIRM_RECIPIENT_FLAG)) {
      throw new Error(`Use ${WITH_HUMAN_FLAG} together with recipient options.`);
    }
    return null;
  }
  const environment = (process.env.DEPLOYMENT_ENVIRONMENT_NAME || process.env.NODE_ENV || "").toLowerCase();
  if (!["local", "development", "test"].includes(environment) || process.env.NODE_ENV === "production") {
    throw new Error(`${WITH_HUMAN_FLAG} is permitted only in an explicitly configured local/development/test environment.`);
  }
  if (!hasFlag(CONFIRM_RECIPIENT_FLAG)) {
    throw new Error(`Use ${CONFIRM_RECIPIENT_FLAG} to confirm that you control the recipient and accept the risk of real sends.`);
  }
  const e164Recipient = argument(TEST_RECIPIENT_FLAG);
  if (!e164Recipient || !/^\+[1-9][0-9]{6,14}$/.test(e164Recipient)) {
    throw new Error(`${TEST_RECIPIENT_FLAG} must be a controlled E.164 WhatsApp number, e.g. +<countrycode><number>.`);
  }
  // ARCH-028 persists WhatsApp recipients as ASCII digits (no leading '+').
  // Use the same canonical value for reachability and outreach records.
  return { recipient: e164Recipient.slice(1) };
}

const handoverCases = [
  { index: 1, name: "Grace", scenario: "AI, open 24-hour window, Take over then type/send" },
  { index: 2, name: "Linus", scenario: "already HUMAN, open 24-hour window, type/send" },
  { index: 3, name: "Margaret", scenario: "open window but no sequence-one recipient; test safe send failure" },
  { index: 7, name: "Barbara", scenario: "HUMAN, closed window; template only if already approved for the shop" },
  { index: 8, name: "Donald", scenario: "HUMAN, closed window, sequence-two follow-up already consumed" },
];

function humanCase(index) { return handoverCases.some((entry) => entry.index === index); }
function recentInboundCase(index) { return index === 1 || index === 2 || index === 3; }

function basketFixture(recovery) {
  // Uses the saved recovery value and its currency; never calls a live product API.
  return [{ title: "Fixture checkout product", variantTitle: "Standard", quantity: 1,
    price: Number(recovery.totalPrice).toFixed(2), imageUrl: null }];
}

async function checkHumanScenarioReadiness(shop, options) {
  if (!options) return { approvedTemplates: 0 };
  if (shop.status !== "ACTIVE" || !["ACTIVE", "TRIALING"].includes(shop.subscription.status) ||
      !shop.subscription.plan?.active) {
    throw new Error("This shop needs an active/trial subscription on an active plan for HUMAN takeover testing.");
  }
  const entitlement = await prisma.billingPlanFeature.findFirst({
    where: { planId: shop.subscription.planId, enabled: true,
      feature: { key: "checkout_recovery", active: true } },
    select: { id: true },
  });
  if (!entitlement) {
    throw new Error("Checkout Recovery is not enabled for this BillingPlan; do not fabricate an entitlement.");
  }
  const suppressed = await prisma.whatsAppRecipientReachability.findUnique({
    where: { shopId_recipient: { shopId: shop.id, recipient: options.recipient } },
    select: { suppressUntil: true },
  });
  if (suppressed?.suppressUntil && suppressed.suppressUntil > new Date()) {
    throw new Error("The controlled test recipient is currently suppressed. Choose an eligible controlled recipient.");
  }
  const restriction = await prisma.shopHumanMessagingRestriction.findUnique({
    where: { shopId: shop.id }, select: { status: true },
  });
  if (restriction?.status === "SUSPENDED") {
    throw new Error("HUMAN messaging is suspended for this shop; use a separate shop to test active replies.");
  }
  const approvedTemplates = await prisma.whatsAppTemplateVariant.count({
    where: { shopId: shop.id, purpose: "checkout-recovery", enabled: true, status: "APPROVED" },
  });
  return { approvedTemplates };
}

function requireConfirmation() {
  if (!hasFlag(CONFIRM_FLAG)) {
    throw new Error(`Mutation refused. Re-run with ${CONFIRM_FLAG}.`);
  }
  // Mutating fixture counters and usage is only safe against a disposable
  // development/test database, never against a merchant's real ledger.
  const environment = (process.env.DEPLOYMENT_ENVIRONMENT_NAME || process.env.NODE_ENV || "").toLowerCase();
  const nodeEnvironment = (process.env.NODE_ENV || "").toLowerCase();
  if (["production", "prod"].includes(environment) || ["production", "prod"].includes(nodeEnvironment)) {
    throw new Error("Usage fixtures are forbidden in production.");
  }
  let databaseName;
  try {
    databaseName = decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.replace(/^\//, ""));
  } catch {
    throw new Error("Set DATABASE_URL to a disposable development/test PostgreSQL database.");
  }
  if (!/(?:^|[_-])(test|testing|dev|development|sandbox)(?:$|[_-])/i.test(databaseName)) {
    throw new Error("Refusing to mutate a database without test/development in its name.");
  }
}

function safe(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function prefixFor(shopId) {
  return `${PREFIX}${safe(shopId)}-`;
}

function idFor(shopId, suffix) {
  return `${prefixFor(shopId)}${suffix}`;
}
function recoveriesFixtureId(shopId, index) {
  return idFor(shopId, `recovery-${String(index + 1).padStart(2, "0")}`);
}

async function resolveShop(raw) {
  if (!raw) throw new Error("--shop <domain-or-shop-id> is required.");
  const normalized = String(raw).trim().toLowerCase();
  const shop = await prisma.shop.findFirst({
    where: {
      OR: [
        { id: raw },
        { domain: normalized },
      ],
    },
    include: {
      subscription: {
        include: {
          plan: true,
          billingPeriod: true,
        },
      },
    },
  });

  if (!shop) throw new Error(`Shop not found: ${raw}`);
  if (!shop.subscription) {
    throw new Error(
      `Shop ${shop.domain} has no Subscription. Complete real platform onboarding first; this fixture will not fabricate one.`,
    );
  }
  if (!shop.subscription.plan || !["FREE", "PAID_METERED"].includes(shop.subscription.plan.kind)) {
    throw new Error(`Shop ${shop.domain} needs an existing FREE or PAID_METERED BillingPlan.`);
  }
  if (shop.status !== "ACTIVE" || !["ACTIVE", "TRIALING"].includes(shop.subscription.status) ||
      !shop.subscription.plan.active) {
    throw new Error("The shop, its subscription and its BillingPlan must be active for usage fixtures.");
  }
  if (!["SHOPIFY", "WOOCOMMERCE"].includes(shop.platform)) {
    throw new Error(`Unsupported shop platform: ${shop.platform}`);
  }
  return shop;
}

function recoveryFixtures(shopId, now) {
  const statuses = [
    "COMPLETED",
    "ENGAGED",
    "MESSAGE_SENT",
    "DETECTED",
    "EXPIRED",
    "CANCELLED",
    "COMPLETED",
    "ENGAGED",
    "MESSAGE_SENT",
    "DETECTED",
    "EXPIRED",
    "COMPLETED",
    "CANCELLED",
  ];
  const currencies = ["GBP", "USD", "EUR"];
  const prices = [89.99, 124.5, 57.25, 38, 74.99, 44.5, 132, 65, 92.4, 51, 109.95, 149, 79.5];

  return statuses.map((status, index) => {
    const number = index + 1;
    const customerNumber = index === 12 ? null : index === 11 ? 1 : number;
    const detectedAt = new Date(now.getTime() - (number + 1) * DAY_MS);
    const lastActivity = new Date(detectedAt.getTime() + 4 * HOUR_MS);
    const completedAt = status === "COMPLETED" ? new Date(lastActivity.getTime() + HOUR_MS) : null;
    const engagedAt = ["ENGAGED", "COMPLETED"].includes(status)
      ? new Date(lastActivity.getTime() + 30 * 60 * 1000)
      : null;
    const messageSentAt = ["MESSAGE_SENT", "ENGAGED", "COMPLETED"].includes(status)
      ? new Date(lastActivity.getTime())
      : null;
    const expiredAt = status === "EXPIRED" ? new Date(lastActivity.getTime() + DAY_MS) : null;

    return {
      id: idFor(shopId, `recovery-${String(number).padStart(2, "0")}`),
      customerId: customerNumber
        ? idFor(shopId, `customer-${String(customerNumber).padStart(2, "0")}`)
        : null,
      checkoutToken: idFor(shopId, `checkout-${String(number).padStart(2, "0")}`),
      cartToken: idFor(shopId, `cart-${String(number).padStart(2, "0")}`),
      status,
      currency: currencies[index % currencies.length],
      totalPrice: prices[index],
      detectedAt,
      lastExternalActivityAt: lastActivity,
      messageSentAt,
      engagedAt,
      completedAt,
      expiredAt,
    };
  });
}

function customerFixtures(shopId, shopDomain, now) {
  const firstNames = [
    "Ada", "Grace", "Linus", "Margaret", "Alan", "Dorothy",
    "Edsger", "Barbara", "Donald", "Frances", "Ken",
  ];
  const lastNames = [
    "Lovelace", "Hopper", "Torvalds", "Hamilton", "Turing", "Vaughan",
    "Dijkstra", "Liskov", "Knuth", "Allen", "Thompson",
  ];

  return firstNames.map((firstName, index) => {
    const number = index + 1;
    return {
      id: idFor(shopId, `customer-${String(number).padStart(2, "0")}`),
      shopId,
      firstName: `${firstName} ${shopDomain}`,
      lastName: lastNames[index],
      email: `usage-fixture-${number}@example.invalid`,
      shopifyCustomerId: idFor(shopId, `shopify-customer-${String(number).padStart(2, "0")}`),
      createdAt: new Date(now.getTime() - (number + 20) * DAY_MS),
      updatedAt: now,
    };
  });
}

function conversationOutcome(status) {
  if (status === "COMPLETED") return "RECOVERED";
  if (status === "EXPIRED") return "EXPIRED";
  if (status === "CANCELLED") return "DECLINED";
  return "IN_PROGRESS";
}

function conversationFixtures(shopId, recoveries, now, withHuman) {
  return recoveries.map((recovery, index) => ({
    id: idFor(shopId, `conversation-${String(index + 1).padStart(2, "0")}`),
    shopId,
    type: "RECOVERY",
    customerId: recovery.customerId,
    checkoutRecoveryId: recovery.id,
    outcome: conversationOutcome(recovery.status),
    languageTag: index % 3 === 0 ? "fr" : "en",
    languageSource: "MERCHANT_DEFAULT",
    countryCode: index % 3 === 0 ? "FR" : "GB",
    currencyCode: recovery.currency,
    timeZone: "Europe/London",
    summary: `Manual Usage Overview fixture conversation ${index + 1}`,
    lastInboundAt: withHuman && recentInboundCase(index)
      ? new Date(now.getTime() - RECENT_INBOUND_AGE_MS)
      : new Date(recovery.lastExternalActivityAt.getTime() + 20 * 60 * 1000),
    lastMessageAt: withHuman && recentInboundCase(index)
      ? new Date(now.getTime() - RECENT_INBOUND_AGE_MS)
      : new Date(recovery.lastExternalActivityAt.getTime() + 40 * 60 * 1000),
    ...(withHuman && [2, 7, 8].includes(index)
      ? { controlMode: "HUMAN", controlRevision: 1, controlChangedAt: now }
      : {}),
    createdAt: recovery.detectedAt,
    updatedAt: recovery.lastExternalActivityAt,
  }));
}

function messageFixtures(shopId, conversations, withHuman) {
  const rows = [];
  conversations.forEach((conversation, index) => {
    const base = conversation.createdAt.getTime() + HOUR_MS;
    const n = String(index + 1).padStart(2, "0");
    rows.push(
      {
        id: idFor(shopId, `message-${n}-01`),
        conversationId: conversation.id,
        direction: "OUTBOUND",
        senderType: "AGENT",
        status: "DELIVERED",
        content: "Hi — you left some items in your checkout. Can I help?",
        createdAt: new Date(base),
        sentAt: new Date(base),
        deliveredAt: new Date(base + 60_000),
      },
      {
        id: idFor(shopId, `message-${n}-02`),
        conversationId: conversation.id,
        direction: "INBOUND",
        senderType: "CUSTOMER",
        status: "DELIVERED",
        content: index % 2 === 0 ? "Yes please — I had a question about delivery." : "Thanks, I am still deciding.",
        createdAt: new Date(base + 10 * 60_000),
        sentAt: new Date(base + 10 * 60_000),
        deliveredAt: new Date(base + 10 * 60_000),
      },
      {
        id: idFor(shopId, `message-${n}-03`),
        conversationId: conversation.id,
        direction: "OUTBOUND",
        senderType: "AGENT",
        status: index === 4 ? "FAILED" : "SENT",
        content: index === 4 ? "This fixture message deliberately failed." : "Of course — here is the information you need.",
        createdAt: new Date(base + 20 * 60_000),
        sentAt: index === 4 ? null : new Date(base + 20 * 60_000),
      },
    );
    if (withHuman && recentInboundCase(index)) {
      const recentAt = conversation.lastInboundAt;
      rows.push({
        id: idFor(shopId, `message-${n}-04`), conversationId: conversation.id,
        direction: "INBOUND", senderType: "CUSTOMER", status: "DELIVERED",
        providerMessageId: idFor(shopId, `provider-inbound-${n}`),
        content: "Hello — can you help me with my recovery?",
        createdAt: recentAt, sentAt: recentAt, deliveredAt: recentAt,
      });
    }
    if (withHuman && index === 8) {
      const followUpAt = new Date(base + 25 * HOUR_MS);
      rows.push({ id: idFor(shopId, "message-09-follow-up"), conversationId: conversation.id,
        direction: "OUTBOUND", senderType: "AGENT", status: "SENT",
        content: "Fixture: historical recovery follow-up already used.",
        createdAt: followUpAt, sentAt: followUpAt, deliveredAt: null,
      });
    }
  });
  return rows;
}

function closedPeriodDefinitions(shop, currentPeriod) {
  const subscription = shop.subscription;
  const currentStart = currentPeriod.periodStart;
  const plan = subscription.plan;

  return [1, 2, 3].map((number) => {
    const periodEnd = new Date(currentStart.getTime() - (number - 1) * 30 * DAY_MS - number * 1000);
    const periodStart = new Date(periodEnd.getTime() - 30 * DAY_MS);
    return {
      id: idFor(shop.id, `billing-period-past-${number}`),
      shopId: shop.id,
      subscriptionId: subscription.id,
      planId: subscription.planId,
      shopifyPlanHandleSnapshot: subscription.observedShopifyPlanHandle ?? plan?.shopifyPlanHandle ?? null,
      planNameSnapshot: plan?.name ?? subscription.observedShopifyPlanHandle ?? "Test plan",
      planKindSnapshot: "PAID_METERED",
      includedRecoveryCreditsGranted: plan?.includedRecoveryConversationAllowance ?? null,
      periodStart,
      periodEnd,
      status: "CLOSED",
      closedAt: periodEnd,
      closeReason: "RENEWED_SAME_PLAN",
    };
  });
}

/** Do not manufacture a paid current period disconnected from Subscription. */
async function requireCurrentPaidPeriod(transaction, shop, now) {
  const subscription = shop.subscription;
  if (!subscription.billingPeriodId || !subscription.currentPeriodStart || !subscription.currentPeriodEnd) {
    throw new Error("Paid usage fixtures require Subscription.billingPeriodId and currentPeriodStart/currentPeriodEnd. Reconcile the real subscription first.");
  }
  const period = await transaction.billingPeriod.findFirst({
    where: { id: subscription.billingPeriodId, shopId: shop.id, subscriptionId: subscription.id },
  });
  if (!period || period.status !== "OPEN" || period.planKindSnapshot !== "PAID_METERED" ||
      period.periodStart.getTime() !== subscription.currentPeriodStart.getTime() ||
      period.periodEnd.getTime() !== subscription.currentPeriodEnd.getTime() ||
      period.periodStart >= period.periodEnd || period.periodStart > now || period.periodEnd <= now) {
    throw new Error("Paid current BillingPeriod must be OPEN, PAID_METERED, in-window, and match the existing Subscription. Reconcile billing first.");
  }
  if (period.id.startsWith(prefixFor(shop.id))) {
    throw new Error("Paid current billing period cannot be a synthetic usage-overview fixture period.");
  }
  return period;
}

/** Generate the same ledger shape as a committed Free reservation, not a fake bill. */
function freeUsageFixtures(shopId, count, now, provider) {
  return Array.from({ length: count }, (_, index) => {
    const ordinal = String(index + 1).padStart(3, "0");
    const eventId = idFor(shopId, `usage-free-${ordinal}`);
    const reservationId = idFor(shopId, `reservation-free-${ordinal}`);
    const occurredAt = new Date(now.getTime() - (count - index) * DAY_MS);
    return {
      event: {
        id: eventId, shopId, billingPeriodId: null,
        metric: "RECOVERY_CONVERSATION", quantity: 1,
        idempotencyKey: idFor(shopId, `usage-key-free-${ordinal}`),
        sourceType: "FREE_RECOVERY_RESERVATION", sourceId: reservationId,
        occurredAt, shopifyReportState: "NOT_APPLICABLE", provider,
      },
      reservation: {
        id: reservationId, shopId,
        // Match Background's canonical recovery lineage for test-only debits.
        sourceKey: createRecoveryIdempotencyKey(shopId, recoveriesFixtureId(shopId, index)),
        quantity: 1, status: "COMMITTED", committedUsageEventId: eventId,
        createdAt: occurredAt,
      },
    };
  });
}

async function seedFreeUsage(transaction, shop, now) {
  const subscription = shop.subscription;
  if (shop.platform === "SHOPIFY") {
    await requireCurrentFreePeriod(transaction, shop, now);
  } else if (subscription.billingPeriodId !== null || subscription.currentPeriodStart !== null ||
             subscription.currentPeriodEnd !== null) {
    throw new Error("Free lifetime subscription cannot have a current BillingPeriod or period dates. Reconcile billing first.");
  }
  const counter = await transaction.shopEntitlementCounter.findUnique({
    where: { shopId_counter: { shopId: shop.id, counter: FREE_COUNTER } },
  });
  if (!counter) throw new Error("The shop has no lifetime Free recovery counter. Reconcile Free onboarding first.");
  const { grantedQuantity, committedQuantity, reservedQuantity } = counter;
  if (![grantedQuantity, committedQuantity, reservedQuantity].every((value) => Number.isSafeInteger(value) && value >= 0) ||
      grantedQuantity < committedQuantity + reservedQuantity) {
    throw new Error("Inconsistent lifetime Free counter; refusing fixture mutation.");
  }
  const available = grantedQuantity - committedQuantity - reservedQuantity;
  const count = Math.min(FREE_USAGE_EVENTS, available);
  if (count < 1) {
    throw new Error("No Free lifetime credits remain for fixture usage. Use a disposable shop with available Free credits.");
  }
  const fixtures = freeUsageFixtures(shop.id, count, now, shop.platform);
  await transaction.usageEvent.createMany({ data: fixtures.map(({ event }) => event) });
  await transaction.usageReservation.createMany({
    data: fixtures.map(({ reservation }) => ({ ...reservation, counterId: counter.id })),
  });
  const updated = await transaction.shopEntitlementCounter.updateMany({
    where: { id: counter.id, shopId: shop.id, version: counter.version,
      grantedQuantity, committedQuantity, reservedQuantity },
    data: { committedQuantity: { increment: count }, version: { increment: 1 } },
  });
  if (updated.count !== 1) throw new Error("Free counter changed concurrently; transaction aborted.");
  return { usageEvents: count, currentUsageEvents: count, pastUsageEvents: 0,
    pastBillingPeriods: 0, currentBillingPeriodId: null, createdCurrentPeriod: false,
    usageMode: "FREE_LIFETIME", freeCreditsCommitted: count };
}

async function requireCurrentFreePeriod(transaction, shop, now) {
  const subscription = shop.subscription;
  if (!subscription.billingPeriodId || !subscription.currentPeriodStart || !subscription.currentPeriodEnd) {
    throw new Error("Shopify Free usage fixtures require Subscription.billingPeriodId and current period dates.");
  }
  const period = await transaction.billingPeriod.findFirst({
    where: { id: subscription.billingPeriodId, shopId: shop.id, subscriptionId: subscription.id },
  });
  if (!period || period.status !== "OPEN" || period.planKindSnapshot !== "FREE" ||
      period.periodStart.getTime() !== subscription.currentPeriodStart.getTime() ||
      period.periodEnd.getTime() !== subscription.currentPeriodEnd.getTime() ||
      period.periodStart >= period.periodEnd || period.periodStart > now || period.periodEnd <= now) {
    throw new Error("Shopify Free current BillingPeriod must be OPEN, FREE, in-window, and match the existing Subscription. Reconcile billing first.");
  }
  if (period.id.startsWith(prefixFor(shop.id))) {
    throw new Error("Shopify Free current billing period cannot be a synthetic usage-overview fixture period.");
  }
  return period;
}

/**
 * An opt-in Free-now/Paid-before UI fixture. BillingPeriod.planId is nullable
 * because historical plan snapshots survive deletion/unmaterialisation of plans.
 * Do not create BillingPlan or change the merchant's current Free subscription.
 * These synthetic CLOSED periods prove only the historical usage UI behaviour.
 */
function validatePastPaidHistoryOption(shop, enabled) {
  if (enabled && shop.subscription.plan?.kind !== "FREE") {
    throw new Error(`${WITH_PAST_PAID_HISTORY_FLAG} is only supported for a currently Free shop. Paid shops already seed past periods.`);
  }
}

async function seedHistoricalPaidUsage(transaction, shop, now, recoveries) {
  validatePastPaidHistoryOption(shop, true);
  // All synthetic paid periods end before the earliest synthetic Free usage.
  // This preserves an unambiguous paid-before-Free test scenario.
  const firstFreeEvent = new Date(now.getTime() - FREE_USAGE_EVENTS * DAY_MS);
  const historicalStart = new Date(firstFreeEvent.getTime() - 2 * DAY_MS);
  const periods = closedPeriodDefinitions(shop, { periodStart: historicalStart })
    .map((period, index) => ({
      ...period,
      planId: null,
      shopifyPlanHandleSnapshot: null,
      planNameSnapshot: "TEST FIXTURE - historical paid plan",
      planKindSnapshot: "PAID_METERED",
      includedRecoveryCreditsGranted: null,
      // The final historical paid period ends before the present Free state.
      closeReason: index === 0 ? "PLAN_CHANGED" : "RENEWED_SAME_PLAN",
    }));
  if (periods.some((period) => period.planKindSnapshot !== "PAID_METERED" ||
      period.planId !== null || period.periodEnd >= firstFreeEvent ||
      period.subscriptionId !== shop.subscription.id || period.shopId !== shop.id)) {
    throw new Error("Historical paid usage fixture crosses the Free lifetime window or subscription scope.");
  }
  const paid = await seedFixturePaidPeriods(transaction, shop, now, recoveries, periods);
  return { periodCount: periods.length, eventCount: paid.eventCount };
}

/** Persist the complete synthetic paid allocation ledger in the caller's
 * transaction. No genuine paid counter or provider billing state is touched. */
async function seedFixturePaidPeriods(transaction, shop, now, recoveries, periods) {
  const batches = periods.map((period, index) => {
    const label = `past-${index + 1}`;
    const count = [16, 11, 7][index];
    const events = usageRows(shop.id, period, label, count, recoveries, now, shop.platform);
    return { events, allocation: buildPaidAllowanceFixtures(shop.id, period, label, events, idFor) };
  });
  await transaction.billingPeriod.createMany({ data: periods.map((period, index) => ({
    ...period, includedRecoveryCreditsGranted: batches[index].allocation.counter.grantedQuantity,
  })) });
  await transaction.billingPeriodEntitlementCounter.createMany({
    data: batches.map((batch) => batch.allocation.counter),
  });
  const usageEvents = batches.flatMap((batch) => batch.events);
  await transaction.usageEvent.createMany({ data: usageEvents });
  await transaction.usageReservation.createMany({
    data: batches.flatMap((batch) => batch.allocation.reservations),
  });
  return { eventCount: usageEvents.length };
}

function occurredAtWithin(period, index, count, now) {
  const start = period.periodStart.getTime() + HOUR_MS;
  const endBoundary = Math.min(period.periodEnd.getTime() - HOUR_MS, now.getTime());
  const end = Math.max(start, endBoundary);
  const ratio = (index + 1) / (count + 1);
  return new Date(start + Math.floor((end - start) * ratio));
}

function usageRows(shopId, period, label, count, recoveries, now, provider) {
  return Array.from({ length: count }, (_, index) => ({
    id: idFor(shopId, `usage-${label}-${String(index + 1).padStart(3, "0")}`),
    shopId,
    billingPeriodId: period.id,
    metric: "RECOVERY_CONVERSATION",
    quantity: index % 7 === 0 ? 2 : 1,
    idempotencyKey: idFor(shopId, `usage-key-${label}-${String(index + 1).padStart(3, "0")}`),
    sourceType: "CHECKOUT_RECOVERY",
    sourceId: recoveries[index % recoveries.length].id,
    occurredAt: occurredAtWithin(period, index, count, now),
    shopifyReportState: "NOT_APPLICABLE",
    provider,
  }));
}

async function cleanupDatabase(transaction, shopId, { purgeHumanSendAudit = false } = {}) {
  const prefix = prefixFor(shopId);

  // Both Free and paid fixture reservations must be inspected before any
  // deletion. Fixture cleanup runs atomically in the calling transaction.
  const fixtureReservations = await transaction.usageReservation.findMany({
    where: { shopId, id: { startsWith: prefix } },
    select: { id: true, shopId: true, sourceKey: true, counterId: true,
      billingPeriodEntitlementCounterId: true, purchasedCreditPurchaseId: true,
      promotionalCreditGrantId: true, quantity: true, status: true,
      committedUsageEventId: true, compensationUsageEventId: true },
  });
  const freeReservations = fixtureReservations.filter((row) => row.id.startsWith(`${prefix}reservation-free-`));
  const paidReservations = fixtureReservations.filter((row) => row.id.startsWith(`${prefix}reservation-paid-`));
  if (freeReservations.length + paidReservations.length !== fixtureReservations.length) {
    throw new Error("Unknown fixture reservation type; refusing cleanup.");
  }
  const eventIds = fixtureReservations.map(({ committedUsageEventId }) => committedUsageEventId).filter(Boolean);
  const events = eventIds.length ? await transaction.usageEvent.findMany({
    where: { shopId, id: { in: eventIds } },
    select: { id: true, shopId: true, billingPeriodId: true, quantity: true, metric: true,
      sourceType: true, sourceId: true, correctionOfUsageEventId: true },
  }) : [];
  const byId = new Map(events.map((event) => [event.id, event]));

  // Synthetic historical counters are fixture owned, unlike the real Free
  // counter. Never let deletion cascade onto unrecognised reservations/events.
  const fixturePeriods = await transaction.billingPeriod.findMany({
    where: { shopId, id: { startsWith: prefix } },
    select: { id: true, shopId: true, status: true, planKindSnapshot: true },
  });
  const periodIds = fixturePeriods.map((period) => period.id);
  const paidCounters = periodIds.length ? await transaction.billingPeriodEntitlementCounter.findMany({
    where: { shopId, billingPeriodId: { in: periodIds } },
    select: { id: true, shopId: true, billingPeriodId: true, counter: true,
      grantedQuantity: true, committedQuantity: true, reservedQuantity: true,
      forfeitedQuantity: true, currentAllowanceQuantity: true },
  }) : [];
  const paidCounterIds = verifyPaidFixtureCleanup(
    shopId, paidReservations, events, paidCounters, fixturePeriods, idFor);
  if (paidCounterIds.length) {
    const unexpectedReservations = await transaction.usageReservation.count({
      where: { billingPeriodEntitlementCounterId: { in: paidCounterIds },
        id: { not: { startsWith: prefix } } },
    });
    if (unexpectedReservations) throw new Error("Non-fixture reservation uses a fixture paid counter.");
  }
  if (periodIds.length) {
    const unexpectedEvents = await transaction.usageEvent.count({
      where: { billingPeriodId: { in: periodIds }, id: { not: { startsWith: prefix } } },
    });
    if (unexpectedEvents) throw new Error("Non-fixture usage uses a fixture paid period.");
  }

  if (freeReservations.length) {
    const counter = await transaction.shopEntitlementCounter.findUnique({
      where: { shopId_counter: { shopId, counter: FREE_COUNTER } },
    });
    if (!counter) throw new Error("Cannot reverse fixture usage: lifetime Free counter is missing.");
    for (const reservation of freeReservations) {
      const event = byId.get(reservation.committedUsageEventId);
      const ordinal = reservation.id.slice(`${prefix}reservation-free-`.length);
      const canonicalSource = /^\d{3}$/.test(ordinal) && Number(ordinal) > 0 && Number(ordinal) <= FREE_USAGE_EVENTS
        ? createRecoveryIdempotencyKey(shopId, recoveriesFixtureId(shopId, Number(ordinal) - 1))
        : null;
      const legacySource = idFor(shopId, `free-source-${ordinal}`);
      if (reservation.status !== "COMMITTED" || reservation.compensationUsageEventId !== null ||
          (reservation.sourceKey !== canonicalSource && reservation.sourceKey !== legacySource) ||
          reservation.counterId !== counter.id || reservation.billingPeriodEntitlementCounterId !== null ||
          reservation.purchasedCreditPurchaseId !== null || reservation.promotionalCreditGrantId !== null ||
          !Number.isSafeInteger(reservation.quantity) || reservation.quantity <= 0 ||
          typeof reservation.committedUsageEventId !== "string" ||
          !reservation.committedUsageEventId.startsWith(prefix) || !event ||
          event.shopId !== shopId || event.billingPeriodId !== null ||
          event.metric !== "RECOVERY_CONVERSATION" || event.sourceType !== "FREE_RECOVERY_RESERVATION" ||
          event.sourceId !== reservation.id || Number(event.quantity) !== reservation.quantity) {
        throw new Error("Fixture Free reservation has changed; refusing to rewrite billing history.");
      }
    }
    const committed = freeReservations.reduce((sum, reservation) => sum + reservation.quantity, 0);
    const adjusted = await transaction.shopEntitlementCounter.updateMany({
      where: { id: counter.id, shopId, version: counter.version, committedQuantity: { gte: committed } },
      data: { committedQuantity: { decrement: committed }, version: { increment: 1 } },
    });
    if (adjusted.count !== 1) throw new Error("Free counter changed concurrently; cleanup aborted.");
  }
  if (fixtureReservations.length) {
    const removed = await transaction.usageReservation.deleteMany({
      where: { shopId, id: { in: fixtureReservations.map((row) => row.id) } },
    });
    if (removed.count !== fixtureReservations.length) {
      throw new Error("Fixture reservations changed during cleanup; transaction aborted.");
    }
  }
  // A genuine subscription may never depend on a fixture period we are deleting.
  const subscription = await transaction.subscription.findUnique({
    where: { shopId }, select: { billingPeriodId: true },
  });
  if (subscription?.billingPeriodId?.startsWith(prefix)) {
    throw new Error("Subscription refers to a fixture billing period; refusing cleanup.");
  }
  const fixtureEventIds = (await transaction.usageEvent.findMany({
    where: { shopId, id: { startsWith: prefix } }, select: { id: true },
  })).map((row) => row.id);
  if (fixtureEventIds.length) {
    const externalCorrections = await transaction.usageEvent.count({
      where: { correctionOfUsageEventId: { in: fixtureEventIds }, id: { not: { startsWith: prefix } } },
    });
    if (externalCorrections) {
      throw new Error("Non-fixture corrections reference seeded usage; refusing destructive cleanup.");
    }
  }
  const usage = await transaction.usageEvent.deleteMany({
    where: { shopId, id: { startsWith: prefix } },
  });
  if (paidCounterIds.length) {
    const removed = await transaction.billingPeriodEntitlementCounter.deleteMany({
      where: { shopId, id: { in: paidCounterIds } },
    });
    if (removed.count !== paidCounterIds.length) {
      throw new Error("Fixture paid counters changed during cleanup; transaction aborted.");
    }
  }

  const conversations = await transaction.conversation.findMany({
    where: { id: { startsWith: prefix } },
    select: { id: true },
  });
  const conversationIds = conversations.map((row) => row.id);
  if (conversationIds.length) {
    const commandWhere = { shopId, conversationId: { in: conversationIds } };
    const commands = await transaction.merchantConversationSendCommand.count({ where: commandWhere });
    if (commands && !purgeHumanSendAudit) {
      throw new Error(`Refusing to erase ${commands} durable HUMAN send command(s). ` +
        `Re-run with ${PURGE_HUMAN_AUDIT_FLAG} only to purge commands attached to these deterministic test fixtures.`);
    }
    if (commands) {
      const removedCommands = await transaction.merchantConversationSendCommand.deleteMany({ where: commandWhere });
      if (removedCommands.count !== commands) {
        throw new Error("HUMAN send-command rows changed during fixture cleanup; transaction aborted.");
      }
    }
  }

  // Delete fixture outreach before fixture messages. The ARCH-040 immutable
  // outboundMessageId guard rejects ON DELETE SET NULL on a used attempt.
  const recoveryIds = (await transaction.checkoutRecovery.findMany({
    where: { id: { startsWith: prefix } }, select: { id: true },
  })).map((row) => row.id);
  const outreach = recoveryIds.length ? await transaction.recoveryOutreachAttempt.deleteMany({
    where: { checkoutRecoveryId: { in: recoveryIds } },
  }) : { count: 0 };

  const messages = conversationIds.length
    ? await transaction.conversationMessage.deleteMany({
        where: { conversationId: { in: conversationIds } },
      })
    : { count: 0 };

  const supportMessages = await transaction.merchantSupportMessage.deleteMany({
    where: { id: idFor(shopId, "support-recovery-message") },
  });
  const supportThreads = await transaction.merchantSupportThread.deleteMany({
    where: {
      id: idFor(shopId, "support-thread"),
      shopId,
      messages: { none: {} },
    },
  });

  const conversationDelete = await transaction.conversation.deleteMany({
    where: { id: { startsWith: prefix } },
  });


  const recoveries = await transaction.checkoutRecovery.deleteMany({
    where: { id: { startsWith: prefix } },
  });
  const customers = await transaction.customer.deleteMany({
    where: { id: { startsWith: prefix } },
  });
  const periods = await transaction.billingPeriod.deleteMany({
    where: { id: { startsWith: prefix } },
  });

  return {
    usageEvents: usage.count,
    messages: messages.count,
    supportMessages: supportMessages.count,
    supportThreads: supportThreads.count,
    conversations: conversationDelete.count,
    outreachAttempts: outreach.count,
    recoveries: recoveries.count,
    customers: customers.count,
    billingPeriods: periods.count,
  };
}

async function seedDatabase(shop, humanOptions = null, withPastPaidHistory = false) {
  const now = new Date();

  return prisma.$transaction(async (transaction) => {
    await cleanupDatabase(transaction, shop.id);

    let domain = "woocommerce";
    if (shop.domain.includes("shopify")) {
      domain = "shopify";
    }
    const customers = customerFixtures(shop.id, domain, now);
    await transaction.customer.createMany({ data: customers });

    const recoveries = recoveryFixtures(shop.id, now).map((row, index) => ({
      ...row,
      shopId: shop.id,
      ...(humanOptions && humanCase(index) ? { lineItems: basketFixture(row) } : {}),
    }));
    await transaction.checkoutRecovery.createMany({ data: recoveries });

    const supportThread = await transaction.merchantSupportThread.upsert({
      where: { shopId: shop.id },
      create: {
        id: idFor(shop.id, "support-thread"),
        shopId: shop.id,
        lastMessageAt: now,
        updatedAt: now,
      },
      update: {},
      select: { id: true },
    });
    const linkedRecovery = recoveries[2];
    await transaction.merchantSupportMessage.createMany({
      data: [{
        id: idFor(shop.id, "support-recovery-message"),
        threadId: supportThread.id,
        kind: "SYSTEM",
        state: "AVAILABLE",
        originalBody: "Your initial recovery message was sent.",
        sourceLanguageTag: "en",
        displayLanguageTag: "en",
        systemCode: "RECOVERY_INITIAL_OUTREACH_SENT",
        systemVersion: "1",
        sourceKey: idFor(shop.id, "support-recovery-notice"),
        checkoutRecoveryId: linkedRecovery.id,
        availableAt: now,
        createdAt: now,
        updatedAt: now,
      }],
    });

    const conversations = conversationFixtures(shop.id, recoveries, now, Boolean(humanOptions));
    await transaction.conversation.createMany({ data: conversations });

    const messages = messageFixtures(shop.id, conversations, Boolean(humanOptions));
    await transaction.conversationMessage.createMany({ data: messages });

    if (humanOptions) {
      const handovers = conversations.filter((_, index) => [2, 7, 8].includes(index));
      await transaction.conversationControlEvent.createMany({
        data: handovers.map((conversation) => ({
          conversationId: conversation.id, fromMode: "AI", toMode: "HUMAN",
          fromRevision: 0, toRevision: 1, occurredAt: now,
        })),
      });
      // Never change subscription/plan entitlements or fabricate provider approvals.
      // A real initial outreach with a controlled recipient is needed by Send.
      const initial = [1, 2, 7, 8].map((index) => {
        const messageId = idFor(shop.id, `message-${String(index + 1).padStart(2, "0")}-01`);
        const outbound = messages.find((message) => message.id === messageId);
        if (!outbound || outbound.conversationId !== conversations[index].id ||
            outbound.direction !== "OUTBOUND" || !(outbound.sentAt instanceof Date)) {
          throw new Error(`Initial outreach fixture is missing its sent outbound message for recovery ${index + 1}.`);
        }
        return {
          id: idFor(shop.id, `outreach-${String(index + 1).padStart(2, "0")}-01`),
          checkoutRecoveryId: recoveries[index].id,
          sequence: 1, trigger: "INITIAL", status: index === 8 || index === 2 ? "WAITING_FOR_RESPONSE" : "ENGAGED",
          // ARCH-016: WAITING_FOR_RESPONSE requires sentAt and outboundMessageId.
          // Link the genuine saved fixture message rather than inventing dispatch evidence.
          outboundMessageId: outbound.id, sentAt: outbound.sentAt,
          // Initial attempts cannot have a partial claim tuple under ARCH-040.
          recipient: humanOptions.recipient,
          configuredOfferMode: "NONE",
        };
      });
      await transaction.recoveryOutreachAttempt.createMany({ data: initial });

      // An explicitly synthetic already-used follow-up, with a persisted outbound
      // fixture message: no provider call or new credit is made by this script.
      const usedAt = new Date(recoveries[8].detectedAt.getTime() + 27 * HOUR_MS);
      await transaction.recoveryOutreachAttempt.create({ data: {
        id: idFor(shop.id, "outreach-09-02"),
        checkoutRecoveryId: recoveries[8].id,
        recipient: humanOptions.recipient, sequence: 2,
        trigger: "POST_WINDOW_FOLLOW_UP", status: "NO_RESPONSE",
        initiatedBy: "AUTOMATION", initiationKey: idFor(shop.id, "used-follow-up-09"),
        claimedAt: usedAt, sentAt: usedAt, closedAt: usedAt,
        configuredOfferMode: "NONE",
        outboundMessageId: idFor(shop.id, "message-09-follow-up"),
      } });
    }

    let billingFixture;
    if (shop.subscription.plan.kind === "FREE") {
      billingFixture = await seedFreeUsage(transaction, shop, now);
      if (withPastPaidHistory) {
        const past = await seedHistoricalPaidUsage(transaction, shop, now, recoveries);
        billingFixture = { ...billingFixture,
          usageEvents: billingFixture.usageEvents + past.eventCount,
          pastUsageEvents: past.eventCount, pastBillingPeriods: past.periodCount,
          usageMode: "FREE_NOW_PREVIOUSLY_PAID" };
      }
    } else {
      validatePastPaidHistoryOption(shop, withPastPaidHistory);
      const currentPeriod = await requireCurrentPaidPeriod(transaction, shop, now);
      const pastPeriods = closedPeriodDefinitions(shop, currentPeriod);
      const currentEvents = usageRows(shop.id, currentPeriod, "current", 27, recoveries, now, shop.platform);
      const past = await seedFixturePaidPeriods(transaction, shop, now, recoveries, pastPeriods);
      // Current paid usage is deliberately not allocated against real live
      // subscription credits by this UI fixture. Its source remains UNATTRIBUTED.
      await transaction.usageEvent.createMany({ data: currentEvents });
      billingFixture = { usageEvents: currentEvents.length + past.eventCount, currentUsageEvents: 27,
        pastUsageEvents: past.eventCount, pastBillingPeriods: pastPeriods.length,
        currentBillingPeriodId: currentPeriod.id, createdCurrentPeriod: false,
        usageMode: "PAID_METERED", freeCreditsCommitted: 0 };
    }

    return {
      customers: customers.length,
      recoveries: recoveries.length,
      conversations: conversations.length,
      messages: messages.length,
      ...billingFixture,
      usageProvider: shop.platform,
      supportNotifications: 1,
      humanHandoverScenarios: humanOptions ? handoverCases.length : 0,
    };
  }, TRANSACTION_OPTIONS);
}

function pendingJobId(shopId, index) {
  return idFor(shopId, `pending-${String(index).padStart(2, "0")}`);
}

function redisConnection(redisUrl) {
  return {
    url: redisUrl,
    enableOfflineQueue: false,
    maxRetriesPerRequest: null,
  };
}

async function cleanupPending(shop) {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return { skipped: true, reason: "REDIS_URL is not configured" };

  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  const queue = new Queue(PENDING_QUEUE, { connection: redisConnection(redisUrl) });

  let removed = 0;
  try {
    await redis.connect();
    const shopIndex = `pending-recovery:index:shop:${shop.id}`;

    for (let index = 1; index <= PENDING_COUNT; index += 1) {
      const jobId = pendingJobId(shop.id, index);
      const job = await queue.getJob(jobId);
      if (job) {
        const state = await job.getState();
        if (state === "active") {
          throw new Error(`Refusing to remove active fixture pending job ${jobId}.`);
        }
        await job.remove();
        removed += 1;
      }
      await redis.zrem(shopIndex, jobId);
      await redis.del(
        `pending-recovery:index:checkout:${shop.id}:${idFor(shop.id, `pending-checkout-${String(index).padStart(2, "0")}`)}`,
        `pending-recovery:index:cart:${shop.id}:${idFor(shop.id, `pending-cart-${String(index).padStart(2, "0")}`)}`,
      );
    }

    return { skipped: false, removed };
  } finally {
    await queue.close().catch(() => {});
    redis.disconnect();
  }
}

async function seedPending(shop) {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error("--with-pending requires REDIS_URL.");
  }

  await cleanupPending(shop);

  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  const queue = new Queue(PENDING_QUEUE, { connection: redisConnection(redisUrl) });

  try {
    await redis.connect();
    const shopIndex = `pending-recovery:index:shop:${shop.id}`;
    const now = Date.now();

    for (let index = 1; index <= PENDING_COUNT; index += 1) {
      const suffix = String(index).padStart(2, "0");
      const jobId = pendingJobId(shop.id, index);
      const checkoutToken = idFor(shop.id, `pending-checkout-${suffix}`);
      const cartToken = idFor(shop.id, `pending-cart-${suffix}`);
      // Seven days plus a small stagger keeps these safely in BullMQ's delayed
      // state while still producing distinct scheduled timestamps in the UI.
      const delayMs = 7 * DAY_MS + index * 10 * 60 * 1000;
      const dueAt = now + delayMs;
      const checkoutCreatedAt = new Date(now - index * HOUR_MS).toISOString();
      const lastActivityAt = new Date(now - index * 30 * 60 * 1000).toISOString();
      const data = {
        shopId: shop.id,
        shopDomain: shop.domain,
        checkoutToken,
        cartToken,
        abandonedCheckoutUrl: null,
        checkoutCreatedAt,
        lastActivityAt,
      };

      await queue.add(PENDING_JOB, data, {
        jobId,
        delay: delayMs,
        removeOnComplete: true,
        removeOnFail: false,
      });

      const ttlMs = delayMs + HOUR_MS;
      await redis.zadd(shopIndex, dueAt, jobId);
      await redis.set(
        `pending-recovery:index:checkout:${shop.id}:${checkoutToken}`,
        jobId,
        "PX",
        ttlMs,
      );
      await redis.set(
        `pending-recovery:index:cart:${shop.id}:${cartToken}`,
        jobId,
        "PX",
        ttlMs,
      );
    }

    return { seeded: PENDING_COUNT, scheduledAboutDaysFromNow: 7 };
  } finally {
    await queue.close().catch(() => {});
    redis.disconnect();
  }
}

async function databaseStatus(shop) {
  const prefix = prefixFor(shop.id);
  const [customers, recoveries, conversations, messages, usageEvents, billingPeriods, fixtureReservations, fixturePaidCounters] = await Promise.all([
    prisma.customer.count({ where: { id: { startsWith: prefix } } }),
    prisma.checkoutRecovery.count({ where: { id: { startsWith: prefix } } }),
    prisma.conversation.count({ where: { id: { startsWith: prefix } } }),
    prisma.conversationMessage.count({ where: { id: { startsWith: prefix } } }),
    prisma.usageEvent.count({ where: { shopId: shop.id, id: { startsWith: prefix } } }),
    prisma.billingPeriod.findMany({
      where: { id: { startsWith: prefix } },
      orderBy: { periodStart: "desc" },
      select: { id: true, status: true, periodStart: true, periodEnd: true },
    }),
    prisma.usageReservation.count({ where: { shopId: shop.id, id: { startsWith: prefix } } }),
    prisma.billingPeriodEntitlementCounter.count({ where: { shopId: shop.id,
      id: { startsWith: `${prefix}counter-paid-` } } }),
  ]);

  return { customers, recoveries, conversations, messages, usageEvents, billingPeriods,
    fixtureReservations, fixturePaidCounters };
}

async function pendingStatus(shop) {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return { available: false, reason: "REDIS_URL is not configured" };

  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  const queue = new Queue(PENDING_QUEUE, { connection: redisConnection(redisUrl) });
  try {
    await redis.connect();
    const rows = [];
    for (let index = 1; index <= PENDING_COUNT; index += 1) {
      const jobId = pendingJobId(shop.id, index);
      const job = await queue.getJob(jobId);
      if (!job) continue;
      rows.push({ jobId, state: await job.getState(), delay: job.opts.delay ?? 0 });
    }
    return { available: true, jobs: rows };
  } finally {
    await queue.close().catch(() => {});
    redis.disconnect();
  }
}

async function printStatus(shop) {
  const db = await databaseStatus(shop);
  const pending = await pendingStatus(shop);

  console.log("");
  console.log("Usage Overview fixture status");
  console.log("=============================");
  console.log(`Shop: ${shop.domain}`);
  console.log(`Shop ID: ${shop.id}`);
  console.log(`Usage provider: ${shop.platform}`);
  console.log(`Subscription: ${shop.subscription.status}`);
  console.log(`Plan: ${shop.subscription.plan?.name ?? shop.subscription.observedShopifyPlanHandle ?? "(unmapped)"}`);
  console.log("");
  console.table([{
    customers: db.customers,
    recoveries: db.recoveries,
    conversations: db.conversations,
    messages: db.messages,
    usageEvents: db.usageEvents,
    fixtureBillingPeriods: db.billingPeriods.length,
    fixtureReservations: db.fixtureReservations,
    fixturePaidCounters: db.fixturePaidCounters,
    pendingJobs: pending.available ? pending.jobs.length : "unavailable",
  }]);

  if (db.billingPeriods.length) {
    console.log("\nFixture billing periods:");
    console.table(db.billingPeriods.map((period) => ({
      id: period.id,
      status: period.status,
      start: period.periodStart.toISOString(),
      end: period.periodEnd.toISOString(),
    })));
  }

  if (pending.available && pending.jobs.length) {
    console.log("\nFixture pending jobs:");
    console.table(pending.jobs);
  } else if (!pending.available) {
    console.log(`\nPending status unavailable: ${pending.reason}`);
  }
}

async function main() {
  const [command] = process.argv.slice(2);
  if (!command || command === "--help" || command === "-h") {
    console.log(usage());
    return;
  }

  const shop = await resolveShop(argument("--shop"));

  if (command === "status") {
    await printStatus(shop);
    return;
  }

  if (command === "seed") {
    requireConfirmation();
    const humanOptions = validateHumanScenarioOptions();
    // Fail explicitly for the old flag rather than silently ignoring a paid-plan
    // identifier. Materialised BillingPlan rows are not required for snapshots.
    if (hasFlag(LEGACY_HISTORICAL_PAID_PLAN_FLAG) ||
        argument(LEGACY_HISTORICAL_PAID_PLAN_FLAG) !== undefined) {
      throw new Error(`${LEGACY_HISTORICAL_PAID_PLAN_FLAG} is obsolete; use ${WITH_PAST_PAID_HISTORY_FLAG} instead.`);
    }
    const withPastPaidHistory = hasFlag(WITH_PAST_PAID_HISTORY_FLAG);
    // Validate before pending-job cleanup to keep rejected options side-effect free.
    validatePastPaidHistoryOption(shop, withPastPaidHistory);
    const humanReadiness = await checkHumanScenarioReadiness(shop, humanOptions);
    // Clean any older fixture queue state first. This prevents a previous
    // --with-pending run from surviving a later database-only re-seed.
    let pendingResult = await cleanupPending(shop);
    const dbResult = await seedDatabase(shop, humanOptions, withPastPaidHistory);
    if (hasFlag(WITH_PENDING_FLAG)) pendingResult = await seedPending(shop);
    else if (!pendingResult.skipped) pendingResult = { skipped: true, reason: `${WITH_PENDING_FLAG} not supplied; previous fixture pending jobs were removed` };

    console.log("");
    console.log("Usage Overview test data seeded");
    console.log("===============================");
    console.log(`Shop: ${shop.domain}`);
    console.log(`Usage provider: ${shop.platform}`);
    console.table([dbResult]);
    console.log("Pending recoveries:", pendingResult);
    if (humanOptions) {
      console.log("\nHUMAN handover scenarios (test data only; do not send to uncontrolled recipients):");
      console.table(handoverCases.map(({ index, name, scenario }) => ({
        recoveryId: recoveriesFixtureId(shop.id, index), customer: name, expected: scenario,
      })));
      console.log(`Approved checkout-recovery templates already in this shop: ${humanReadiness.approvedTemplates}`);
      console.log("No Meta template approvals were created or modified by this script.");
      console.log("To test shop-wide suspension, use the dedicated UI fixture; this script never suspends a real shop.");
    }
    console.log("");
    console.log("Manual checks:");
    if (shop.subscription.plan.kind === "FREE") {
      console.log("1. WooCommerce: Current usage shows lifetime Free records without a BillingPeriod.");
      console.log("2. Verify Free credits remaining decreased by the fixture amount.");
      console.log("3. Run delete and verify the original Free credit balance is restored.");
      if (withPastPaidHistory) {
        console.log("4. Past periods contains 3 CLOSED, synthetically historical PAID_METERED periods (no paid BillingPlan required).");
        console.log("5. Historical rows should show Included plan allowance, not Unattributed.");
        console.log("6. Check period selection and event pagination without changing current Free subscription.");
      } else {
        console.log("4. Past periods is correctly empty for a never-paid Free merchant.");
        console.log(`   To simulate past PAID history, pass ${WITH_PAST_PAID_HISTORY_FLAG}.`);
      }
      console.log("6. Shopify's existing period-based Usage History does not display Free lifetime events.");
    } else {
      console.log("1. Current usage shows 27 events linked to the existing OPEN paid BillingPeriod.");
      console.log("2. Verify 3 closed fixture periods with Included plan allowance attribution.");
      console.log("3. Exercise paid usage pagination and rows-per-page (10/25/50/100).");
    }
    if (hasFlag(WITH_PENDING_FLAG)) {
      console.log("6. Verify Pending recoveries shows 12 Scheduled rows across two pages and Refresh works.");
    }
    return;
  }

  if (command === "delete") {
    requireConfirmation();
    // Queue cleanup is performed first so an unexpectedly active fixture job
    // cannot leave us with a half-cleaned database/Redis test state.
    const pendingResult = await cleanupPending(shop);
    const dbResult = await prisma.$transaction(
      (transaction) => cleanupDatabase(transaction, shop.id, {
        purgeHumanSendAudit: hasFlag(PURGE_HUMAN_AUDIT_FLAG),
      }),
      TRANSACTION_OPTIONS,
    );
    console.log("");
    console.log("Usage Overview test data deleted");
    console.log("================================");
    console.log(`Shop: ${shop.domain}`);
    console.table([dbResult]);
    console.log("Pending recoveries:", pendingResult);
    return;
  }

  throw new Error(`Unknown command: ${command}\n\n${usage()}`);
}

main()
  .catch((error) => {
    console.error(`seed-usage-overview-test-data: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
