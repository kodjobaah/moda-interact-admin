#!/usr/bin/env node
"use strict";

import process from "node:process";
import { Queue } from "bullmq";
import Redis from "ioredis";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CONFIRM_FLAG = "--confirm-test-data";
const WITH_PENDING_FLAG = "--with-pending";
const WITH_HUMAN_FLAG = "--with-human-handover";
const TEST_RECIPIENT_FLAG = "--test-recipient";
const CONFIRM_RECIPIENT_FLAG = "--confirm-test-recipient";
const PREFIX = "manual-usage-overview-";
const PENDING_QUEUE = "pending-recovery-candidates";
const PENDING_JOB = "evaluate-pending-recovery";
const PENDING_COUNT = 12;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 20_000 };

function usage() {
  return `
Usage Overview manual test-data seeder

Usage:
  node scripts/seed-usage-overview-test-data.mjs status --shop <domain-or-id>

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

What seed creates:
  - 12 customer groups (11 named customers + 1 guest)
  - 13 checkout recoveries covering every recovery status
  - conversations and messages (SENT / DELIVERED / FAILED)
  - usage events linked to recoveries
  - current bill usage (27 events)
  - three closed past bills (16 / 11 / 7 events)
  - enough customer and usage rows to exercise pagination
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
  - production use is refused; active merchant send commands prevent re-seeding

Important:
  - The script never creates or changes a Shopify subscription.
  - It uses the merchant's existing Subscription and BillingPlan.
  - It reuses an existing OPEN BillingPeriod when present. If none exists, it
    creates a fixture OPEN period without changing Subscription.billingPeriodId.
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
  if (!raw) throw new Error("--shop <myshopify-domain-or-shop-id> is required.");
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
      `Shop ${shop.domain} has no Subscription. Reconcile the real Shopify subscription first; this fixture will not fabricate one.`,
    );
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
      firstName: `${firstName}--${shopDomain}`,
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
      ? new Date(now.getTime() - 5 * 60_000)
      : new Date(recovery.lastExternalActivityAt.getTime() + 20 * 60 * 1000),
    lastMessageAt: withHuman && recentInboundCase(index)
      ? new Date(now.getTime() - 5 * 60_000)
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

function closedPeriodDefinitions(shop, now) {
  const subscription = shop.subscription;
  const currentStart = subscription.billingPeriod?.periodStart
    ?? subscription.currentPeriodStart
    ?? new Date(now.getTime() - 5 * DAY_MS);
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
      planKindSnapshot: plan?.kind ?? null,
      includedRecoveryCreditsGranted: plan?.includedRecoveryConversationAllowance ?? null,
      periodStart,
      periodEnd,
      status: "CLOSED",
      closedAt: periodEnd,
      closeReason: "RENEWED_SAME_PLAN",
    };
  });
}

async function ensureCurrentPeriod(transaction, shop, now) {
  const existing = await transaction.billingPeriod.findFirst({
    where: { shopId: shop.id, status: "OPEN" },
    orderBy: { periodStart: "desc" },
  });
  if (existing) return { period: existing, created: false };

  const subscription = shop.subscription;
  const plan = subscription.plan;
  const periodStart = subscription.currentPeriodStart ?? new Date(now.getTime() - 5 * DAY_MS);
  const periodEnd = subscription.currentPeriodEnd ?? new Date(periodStart.getTime() + 30 * DAY_MS);

  const created = await transaction.billingPeriod.create({
    data: {
      id: idFor(shop.id, "billing-period-current"),
      shopId: shop.id,
      subscriptionId: subscription.id,
      planId: subscription.planId,
      shopifyPlanHandleSnapshot: subscription.observedShopifyPlanHandle ?? plan?.shopifyPlanHandle ?? null,
      planNameSnapshot: plan?.name ?? subscription.observedShopifyPlanHandle ?? "Test plan",
      planKindSnapshot: plan?.kind ?? null,
      includedRecoveryCreditsGranted: plan?.includedRecoveryConversationAllowance ?? null,
      periodStart,
      periodEnd,
      status: "OPEN",
    },
  });
  return { period: created, created: true };
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

async function cleanupDatabase(transaction, shopId) {
  const prefix = prefixFor(shopId);

  const usage = await transaction.usageEvent.deleteMany({
    where: { id: { startsWith: prefix } },
  });

  const conversations = await transaction.conversation.findMany({
    where: { id: { startsWith: prefix } },
    select: { id: true },
  });
  const conversationIds = conversations.map((row) => row.id);
  if (conversationIds.length) {
    const commands = await transaction.merchantConversationSendCommand.count({
      where: { conversationId: { in: conversationIds } },
    });
    if (commands) {
      throw new Error(`Refusing to erase ${commands} durable HUMAN send command(s). ` +
        "Use a new disposable development database/shop for further send tests; do not delete send audit history.");
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
    conversations: conversationDelete.count,
    outreachAttempts: outreach.count,
    recoveries: recoveries.count,
    customers: customers.count,
    billingPeriods: periods.count,
  };
}

async function seedDatabase(shop, humanOptions = null) {
  const now = new Date();

  return prisma.$transaction(async (transaction) => {
    await cleanupDatabase(transaction, shop.id);

    const customers = customerFixtures(shop.id, shop.domain, now);
    await transaction.customer.createMany({ data: customers });

    const recoveries = recoveryFixtures(shop.id, now).map((row, index) => ({
      ...row,
      shopId: shop.id,
      ...(humanOptions && humanCase(index) ? { lineItems: basketFixture(row) } : {}),
    }));
    await transaction.checkoutRecovery.createMany({ data: recoveries });

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

    const { period: currentPeriod, created: createdCurrentPeriod } =
      await ensureCurrentPeriod(transaction, shop, now);

    const pastPeriods = closedPeriodDefinitions(shop, now);
    await transaction.billingPeriod.createMany({ data: pastPeriods });

    const usageEvents = [
      ...usageRows(shop.id, currentPeriod, "current", 27, recoveries, now, shop.platform),
      ...usageRows(shop.id, pastPeriods[0], "past-1", 16, recoveries, now, shop.platform),
      ...usageRows(shop.id, pastPeriods[1], "past-2", 11, recoveries, now, shop.platform),
      ...usageRows(shop.id, pastPeriods[2], "past-3", 7, recoveries, now, shop.platform),
    ];
    await transaction.usageEvent.createMany({ data: usageEvents });

    return {
      customers: customers.length,
      recoveries: recoveries.length,
      conversations: conversations.length,
      messages: messages.length,
      usageEvents: usageEvents.length,
      usageProvider: shop.platform,
      currentUsageEvents: 27,
      pastUsageEvents: 34,
      pastBillingPeriods: pastPeriods.length,
      currentBillingPeriodId: currentPeriod.id,
      createdCurrentPeriod,
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
  const [customers, recoveries, conversations, messages, usageEvents, billingPeriods] = await Promise.all([
    prisma.customer.count({ where: { id: { startsWith: prefix } } }),
    prisma.checkoutRecovery.count({ where: { id: { startsWith: prefix } } }),
    prisma.conversation.count({ where: { id: { startsWith: prefix } } }),
    prisma.conversationMessage.count({ where: { id: { startsWith: prefix } } }),
    prisma.usageEvent.count({ where: { id: { startsWith: prefix } } }),
    prisma.billingPeriod.findMany({
      where: { id: { startsWith: prefix } },
      orderBy: { periodStart: "desc" },
      select: { id: true, status: true, periodStart: true, periodEnd: true },
    }),
  ]);

  return { customers, recoveries, conversations, messages, usageEvents, billingPeriods };
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
    const humanReadiness = await checkHumanScenarioReadiness(shop, humanOptions);
    // Clean any older fixture queue state first. This prevents a previous
    // --with-pending run from surviving a later database-only re-seed.
    let pendingResult = await cleanupPending(shop);
    const dbResult = await seedDatabase(shop, humanOptions);
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
    console.log("1. Open /app and verify Current usage and Past paid usage are non-zero.");
    console.log("2. Click View current bill; verify performance/recovery data, then View all usage for this bill.");
    console.log("3. Exercise usage pagination and rows-per-page (10/25/50/100).");
    console.log("4. Return to /app and select each of the three seeded past bills.");
    console.log("5. On a past bill, use the bill selector and usage pagination.");
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
      (transaction) => cleanupDatabase(transaction, shop.id),
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
