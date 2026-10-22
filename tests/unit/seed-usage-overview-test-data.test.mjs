import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import { buildPaidAllowanceFixtures, verifyPaidFixtureCleanup } from "../../scripts/usage-overview-paid-allocations.mjs";

// The executable seeder must not connect to PostgreSQL or Redis when imported
// for unit testing. Evaluate only its function definitions with stubbed imports.
const source = readFileSync(new URL("../../scripts/seed-usage-overview-test-data.mjs", import.meta.url), "utf8")
  .replace(/^import .*;\n/gm, "")
  .replace(/^const prisma = new PrismaClient\(\);/m, "const prisma = globalThis.__prisma;")
  .replace(/^main\(\)\n[\s\S]*$/m, "");

function harness() {
  const environment = { DATABASE_URL: "postgresql://localhost:5432/moda_interact_postgres_test" };
  const context = { Date, Map, Set, URL, console, buildPaidAllowanceFixtures, verifyPaidFixtureCleanup,
    createRecoveryIdempotencyKey: (shopId, recoveryId) => `recovery:${shopId}:${recoveryId}`,
    process: { argv: ["node", "seeder", "seed", "--confirm-test-data"], env: environment },
    __prisma: { shop: { findFirst: async () => null } } };
  vm.runInNewContext(source + `\n;globalThis.__seeder = {
    requireConfirmation, resolveShop, freeUsageFixtures, seedFreeUsage,
    requireCurrentPaidPeriod, closedPeriodDefinitions, cleanupDatabase, seedDatabase,
    validatePastPaidHistoryOption, seedHistoricalPaidUsage, usageRows,
  };`, context, { filename: "seed-usage-overview-test-data.mjs" });
  return { api: context.__seeder, context };
}

const NOW = new Date("2026-10-22T12:00:00.000Z");
function shop(kind = "FREE") {
  return { id: "shop-1", domain: "https://shop.example.invalid", platform: "WOOCOMMERCE", status: "ACTIVE",
    subscription: { id: "subscription-1", status: "ACTIVE", planId: "plan-1",
      plan: { name: kind === "FREE" ? "Free" : "Growth", kind, active: true },
      billingPeriodId: null, currentPeriodStart: null, currentPeriodEnd: null },
  };
}
function fakeFreeTransaction(available = 5) {
  const writes = { events: [], reservations: [], mutations: [] };
  const counter = { id: "counter-1", shopId: "shop-1", version: 3, grantedQuantity: available,
    committedQuantity: 0, reservedQuantity: 0 };
  const tx = {
    shopEntitlementCounter: {
      findUnique: async () => counter,
      updateMany: async ({ where, data }) => {
        assert.equal(where.id, counter.id);
        assert.equal(where.version, counter.version);
        writes.mutations.push(data);
        return { count: 1 };
      },
    },
    usageEvent: { createMany: async ({ data }) => { writes.events.push(...data); } },
    usageReservation: { createMany: async ({ data }) => { writes.reservations.push(...data); } },
  };
  return { tx, writes, counter };
}

test("each platform requires a real Subscription and BillingPlan, including Free", async () => {
  const { api, context } = harness();
  context.__prisma.shop.findFirst = async () => ({ id: "shop-1", domain: "https://shop.example.invalid",
    platform: "WOOCOMMERCE", status: "ACTIVE", subscription: null });
  await assert.rejects(() => api.resolveShop("shop-1"), /has no Subscription/);
  context.__prisma.shop.findFirst = async () => shop("FREE");
  const result = await api.resolveShop("shop-1");
  assert.equal(result.subscription.plan.kind, "FREE");
});

test("Free usage has no billing period and matches the committed-reservation schema", async () => {
  const { api } = harness();
  const { tx, writes } = fakeFreeTransaction(5);
  const summary = await api.seedFreeUsage(tx, shop(), NOW);
  assert.equal(summary.usageMode, "FREE_LIFETIME");
  assert.equal(summary.currentUsageEvents, 4);
  assert.equal(summary.pastBillingPeriods, 0);
  assert.equal(summary.currentBillingPeriodId, null);
  assert.equal(writes.events.length, 4);
  assert.equal(writes.reservations.length, 4);
  for (let i = 0; i < 4; i++) {
    assert.equal(writes.events[i].provider, "WOOCOMMERCE");
    assert.equal(writes.events[i].billingPeriodId, null);
    assert.equal(writes.events[i].sourceType, "FREE_RECOVERY_RESERVATION");
    assert.equal(writes.events[i].sourceId, writes.reservations[i].id);
    assert.equal(writes.reservations[i].status, "COMMITTED");
    assert.equal(writes.reservations[i].committedUsageEventId, writes.events[i].id);
    assert.equal(writes.reservations[i].sourceKey,
      `recovery:shop-1:manual-usage-overview-shop-1-recovery-${String(i + 1).padStart(2, "0")}`);
  }
  assert.equal(writes.mutations[0].committedQuantity.increment, 4);
});

test("Free fixture never exceeds the real available allowance", async () => {
  const { api } = harness();
  const { tx, writes } = fakeFreeTransaction(2);
  const result = await api.seedFreeUsage(tx, shop(), NOW);
  assert.equal(result.freeCreditsCommitted, 2);
  assert.equal(writes.events.length, 2);
  const { tx: exhausted } = fakeFreeTransaction(0);
  await assert.rejects(() => api.seedFreeUsage(exhausted, shop(), NOW), /No Free lifetime credits/);
});

test("Free fixtures refuse subscriptions with synthetic current periods", async () => {
  const { api } = harness();
  const s = shop();
  s.subscription.billingPeriodId = "synthetic-period";
  const { tx } = fakeFreeTransaction();
  await assert.rejects(() => api.seedFreeUsage(tx, s, NOW), /cannot have a current BillingPeriod/);
});

test("paid usage requires an actual subscription-linked OPEN current period", async () => {
  const { api } = harness();
  const s = shop("PAID_METERED");
  s.subscription.billingPeriodId = "genuine-paid-period";
  s.subscription.currentPeriodStart = new Date("2026-10-01T00:00:00.000Z");
  s.subscription.currentPeriodEnd = new Date("2026-11-01T00:00:00.000Z");
  const period = { id: s.subscription.billingPeriodId, shopId: s.id,
    subscriptionId: s.subscription.id, status: "OPEN", planKindSnapshot: "PAID_METERED",
    periodStart: s.subscription.currentPeriodStart, periodEnd: s.subscription.currentPeriodEnd };
  const tx = { billingPeriod: { findFirst: async () => period } };
  assert.equal((await api.requireCurrentPaidPeriod(tx, s, NOW)).id, "genuine-paid-period");
  for (const invalid of [{ ...period, status: "CLOSED" }, { ...period, planKindSnapshot: "FREE" },
    { ...period, periodEnd: new Date("2026-10-02T00:00:00Z") }]) {
    await assert.rejects(() => api.requireCurrentPaidPeriod({ billingPeriod: { findFirst: async () => invalid } }, s, NOW),
      /must be OPEN/);
  }
  const past = api.closedPeriodDefinitions(s, period);
  assert.equal(past.length, 3);
  assert.equal(past.every((item) => item.status === "CLOSED" && item.planKindSnapshot === "PAID_METERED"), true);
});

test("cleanup reverses only fixture Free reservations and their committed counter amount", async () => {
  const { api } = harness();
  const prefix = "manual-usage-overview-shop-1-";
  const reservation = { id: prefix + "reservation-free-001", shopId: "shop-1", sourceKey: prefix + "free-source-001",
    counterId: "counter-1", billingPeriodEntitlementCounterId: null,
    purchasedCreditPurchaseId: null, promotionalCreditGrantId: null,
    quantity: 1, status: "COMMITTED", compensationUsageEventId: null,
    committedUsageEventId: prefix + "usage-free-001" };
  const event = { id: reservation.committedUsageEventId, shopId: "shop-1", billingPeriodId: null,
    quantity: 1, metric: "RECOVERY_CONVERSATION", sourceType: "FREE_RECOVERY_RESERVATION", sourceId: reservation.id };
  const writes = [];
  const tx = {
    usageReservation: { findMany: async () => [reservation], deleteMany: async () => { writes.push("delete-reservation"); return { count: 1 }; } },
    usageEvent: { findMany: async ({ where }) => where?.id?.in ? [event] : [{ id: event.id }],
      count: async () => 0,
      deleteMany: async () => { writes.push("delete-event"); return { count: 1 }; } },
    shopEntitlementCounter: { findUnique: async () => ({ id: "counter-1", version: 3 }),
      updateMany: async ({ data }) => { assert.equal(data.committedQuantity.decrement, 1); writes.push("refund-counter"); return { count: 1 }; } },
    subscription: { findUnique: async () => ({ billingPeriodId: null }) },
    billingPeriodEntitlementCounter: { findMany: async () => [] },
    conversation: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) },
    checkoutRecovery: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) },
    customer: { deleteMany: async () => ({ count: 0 }) },
    billingPeriod: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) },
  };
  const result = await api.cleanupDatabase(tx, "shop-1");
  assert.equal(result.usageEvents, 1);
  assert.deepEqual(writes, ["refund-counter", "delete-reservation", "delete-event"]);
});

test("cleanup fails closed if a fixture reservation has been compensated", async () => {
  const { api } = harness();
  const prefix = "manual-usage-overview-shop-1-";
  const tx = {
    usageReservation: { findMany: async () => [{ id: prefix + "reservation-free-001", sourceKey: prefix + "free-source-001",
      counterId: "counter-1", billingPeriodEntitlementCounterId: null, purchasedCreditPurchaseId: null,
      promotionalCreditGrantId: null, quantity: 1, status: "COMPENSATED", compensationUsageEventId: "other",
      committedUsageEventId: prefix + "usage-free-001" }] },
    shopEntitlementCounter: { findUnique: async () => ({ id: "counter-1" }) },
    billingPeriod: { findMany: async () => [] },
    usageEvent: { findMany: async () => [] },
  };
  await assert.rejects(() => api.cleanupDatabase(tx, "shop-1"), /has changed/);
});

test("mutation guard rejects production and non-test databases", () => {
  const { api, context } = harness();
  assert.doesNotThrow(() => api.requireConfirmation());
  context.process.env.NODE_ENV = "production";
  assert.throws(() => api.requireConfirmation(), /forbidden in production/);
  delete context.process.env.NODE_ENV;
  context.process.env.DATABASE_URL = "postgresql://localhost:5432/moda_interact_postgres";
  assert.throws(() => api.requireConfirmation(), /without test\/development/);
});

function seedTransaction(kind) {
  const writes = { events: [], reservations: [], periods: [], paidCounters: [] };
  const store = shop(kind);
  const now = Date.now();
  const current = {
    id: "actual-paid-period", shopId: store.id, subscriptionId: store.subscription.id,
    status: "OPEN", planKindSnapshot: "PAID_METERED",
    periodStart: new Date(now - 5 * 24 * 60 * 60 * 1000),
    periodEnd: new Date(now + 25 * 24 * 60 * 60 * 1000),
  };
  if (kind === "PAID_METERED") {
    store.subscription.billingPeriodId = current.id;
    store.subscription.currentPeriodStart = current.periodStart;
    store.subscription.currentPeriodEnd = current.periodEnd;
  }
  const zero = async () => ({ count: 0 });
  const tx = {
    usageReservation: { findMany: async () => [], createMany: async ({ data }) => writes.reservations.push(...data) },
    subscription: { findUnique: async () => ({ billingPeriodId: store.subscription.billingPeriodId }) },
    shopEntitlementCounter: { findUnique: async () => ({ id: "free-counter", version: 1,
      grantedQuantity: 5, committedQuantity: 0, reservedQuantity: 0 }), updateMany: async () => ({ count: 1 }) },
    usageEvent: { findMany: async () => [], deleteMany: zero, createMany: async ({ data }) => writes.events.push(...data) },
    // There is deliberately no materialised paid BillingPlan in this test DB.
    // The historical snapshot must work without reading the billingPlan model.
    billingPeriod: { deleteMany: zero, findFirst: async () => current, findMany: async () => [],
      createMany: async ({ data }) => writes.periods.push(...data) },
    billingPeriodEntitlementCounter: { findMany: async () => [],
      createMany: async ({ data }) => writes.paidCounters.push(...data) },
    customer: { createMany: async () => {}, deleteMany: zero },
    checkoutRecovery: { createMany: async () => {}, findMany: async () => [], deleteMany: zero },
    conversation: { createMany: async () => {}, findMany: async () => [], deleteMany: zero },
    conversationMessage: { createMany: async () => {}, deleteMany: zero },
  };
  return { store, tx, writes };
}

test("full Free seed generates lifetime events and no artificial periods", async () => {
  const { api, context } = harness();
  const { store, tx, writes } = seedTransaction("FREE");
  context.__prisma.$transaction = async (fn) => fn(tx);
  const result = await api.seedDatabase(store);
  assert.equal(result.usageEvents, 4);
  assert.equal(result.currentBillingPeriodId, null);
  assert.equal(writes.periods.length, 0);
  assert.equal(writes.reservations.length, 4);
  assert.equal(writes.events.length, 4);
});

test("full paid seed reuses the real current period and creates three closed past periods", async () => {
  const { api, context } = harness();
  const { store, tx, writes } = seedTransaction("PAID_METERED");
  context.__prisma.$transaction = async (fn) => fn(tx);
  const result = await api.seedDatabase(store);
  assert.equal(result.usageEvents, 61);
  assert.equal(result.currentUsageEvents, 27);
  assert.equal(result.pastUsageEvents, 34);
  assert.equal(result.currentBillingPeriodId, "actual-paid-period");
  assert.equal(writes.periods.length, 3);
  assert.equal(writes.reservations.length, 34);
  assert.equal(writes.paidCounters.length, 3);
  assert.equal(writes.events.length, 61);
});


test("opt-in Free-now/Paid-before fixture creates three CLOSED historical paid periods", async () => {
  const { api, context } = harness();
  const { store, tx, writes } = seedTransaction("FREE");
  context.__prisma.$transaction = async (fn) => fn(tx);
  const result = await api.seedDatabase(store, null, true);
  assert.equal(result.usageMode, "FREE_NOW_PREVIOUSLY_PAID");
  assert.equal(result.currentUsageEvents, 4);
  assert.equal(result.pastUsageEvents, 34);
  assert.equal(result.pastBillingPeriods, 3);
  assert.equal(result.usageEvents, 38);
  assert.equal(Object.hasOwn(result, "historicalPaidPlanId"), false);
  assert.equal(result.currentBillingPeriodId, null);
  assert.equal(store.subscription.plan.kind, "FREE");
  assert.equal(store.subscription.planId, "plan-1");
  assert.equal(store.subscription.billingPeriodId, null);
  assert.equal(writes.periods.length, 3);
  assert.equal(writes.events.length, 38);
  assert.equal(writes.reservations.length, 38);
  assert.equal(writes.paidCounters.length, 3);
  assert.equal(writes.periods.every((period) =>
    period.status === "CLOSED" && period.planKindSnapshot === "PAID_METERED" &&
    period.planId === null && period.subscriptionId === store.subscription.id &&
    period.planNameSnapshot === "TEST FIXTURE - historical paid plan" &&
    period.shopifyPlanHandleSnapshot === null &&
    writes.paidCounters.some((counter) => counter.billingPeriodId === period.id &&
      counter.grantedQuantity === period.includedRecoveryCreditsGranted)), true);
  const freeEvents = writes.events.filter((event) => event.sourceType === "FREE_RECOVERY_RESERVATION");
  const historicalEvents = writes.events.filter((event) => event.sourceType === "CHECKOUT_RECOVERY");
  assert.equal(freeEvents.length, 4);
  assert.equal(freeEvents.every((event) => event.billingPeriodId === null), true);
  assert.equal(historicalEvents.length, 34);
  assert.equal(writes.reservations.filter((row) => row.billingPeriodEntitlementCounterId).length, 34);
  assert.equal(writes.paidCounters.reduce((total, counter) => total + counter.committedQuantity, 0), 40);
  assert.equal(historicalEvents.every((event) =>
    writes.periods.some((period) => period.id === event.billingPeriodId &&
      event.occurredAt >= period.periodStart && event.occurredAt < period.periodEnd)), true);
  assert.equal(writes.periods.every((period) =>
    freeEvents.every((event) => period.periodEnd < event.occurredAt)), true);
});

test("historical paid option permits a Free subscription without materialised paid BillingPlan", () => {
  const { api } = harness();
  assert.doesNotThrow(() => api.validatePastPaidHistoryOption(shop("FREE"), true));
  assert.doesNotThrow(() => api.validatePastPaidHistoryOption(shop("PAID_METERED"), false));
  assert.throws(() => api.validatePastPaidHistoryOption(shop("PAID_METERED"), true),
    /only supported for a currently Free shop/);
});

test("test-only historical paid periods are snapshots, not synthetic current entitlements", async () => {
  const { api } = harness();
  const { store, tx, writes } = seedTransaction("FREE");
  const recoveries = [{ id: "fixture-recovery" }];
  const result = await api.seedHistoricalPaidUsage(tx, store, NOW, recoveries);
  assert.equal(result.eventCount, 34);
  assert.equal(result.periodCount, 3);
  assert.equal(writes.paidCounters.length, 3);
  assert.equal(writes.reservations.length, 34);
  assert.equal(writes.periods[0].closeReason, "PLAN_CHANGED");
  assert.equal(writes.periods[1].closeReason, "RENEWED_SAME_PLAN");
  assert.equal(writes.periods[2].closeReason, "RENEWED_SAME_PLAN");
  assert.equal(writes.periods.every((period) => period.planId === null &&
    period.planKindSnapshot === "PAID_METERED" && period.subscriptionId === store.subscription.id &&
    period.status === "CLOSED"), true);
  assert.equal(store.subscription.plan.kind, "FREE");
  assert.equal(store.subscription.billingPeriodId, null);
});

test("historical paid records retain the merchant provider, including Shopify", async () => {
  const { api, context } = harness();
  const { store, tx, writes } = seedTransaction("FREE");
  store.platform = "SHOPIFY";
  context.__prisma.$transaction = async (fn) => fn(tx);
  const result = await api.seedDatabase(store, null, true);
  assert.equal(result.pastUsageEvents, 34);
  assert.equal(writes.events.every((event) => event.provider === "SHOPIFY"), true);
  assert.equal(writes.events.filter((event) => event.billingPeriodId !== null).length, 34);
});

test("paid merchant cannot request historical paid-on-Free simulation", async () => {
  const { api, context } = harness();
  const { store, tx } = seedTransaction("PAID_METERED");
  context.__prisma.$transaction = async (fn) => fn(tx);
  await assert.rejects(() => api.seedDatabase(store, null, true),
    /only supported for a currently Free shop/);
});

test("CLI documents boolean past-paid fixture without paid plan ID", () => {
  assert.match(source, /--with-past-paid-history/);
  assert.match(source, /planId: null,/);
  assert.doesNotMatch(source, /await transaction\.billingPlan\.findUnique/);
  assert.doesNotMatch(source, /--historical-paid-plan-id <existing-/);
});


test("synthetic paid history has matching per-period committed allowances and reservations", async () => {
  const { api } = harness();
  const { store, tx, writes } = seedTransaction("FREE");
  await api.seedHistoricalPaidUsage(tx, store, NOW, [{ id: "fixture-recovery" }]);
  assert.deepEqual([...writes.paidCounters.map((c) => c.committedQuantity)], [19, 13, 8]);
  assert.equal(writes.paidCounters.every((c) => c.counter === "INCLUDED_RECOVERY_CREDITS" &&
    c.grantedQuantity === c.committedQuantity && c.reservedQuantity === 0), true);
  assert.equal(writes.reservations.length, 34);
  const periodIds = new Set(writes.periods.map((p) => p.id));
  for (const reservation of writes.reservations) {
    assert.equal(reservation.status, "COMMITTED");
    assert.equal(reservation.counterId, undefined);
    assert.equal(reservation.purchasedCreditPurchaseId, undefined);
    assert.equal(reservation.promotionalCreditGrantId, undefined);
    const event = writes.events.find((row) => row.id === reservation.committedUsageEventId);
    const counter = writes.paidCounters.find((row) => row.id === reservation.billingPeriodEntitlementCounterId);
    assert.ok(event);
    assert.ok(counter);
    assert.equal(counter.billingPeriodId, event.billingPeriodId);
    assert.equal(Number(event.quantity), reservation.quantity);
    assert.ok(periodIds.has(counter.billingPeriodId));
  }
  // Only fixture-owned allocations exist: current Free subscription stays unchanged.
  assert.equal(store.subscription.billingPeriodId, null);
  assert.equal(store.subscription.plan.kind, "FREE");
});

test("paid allocation builder rejects inconsistent periods, event IDs and quantities", () => {
  const idFor = (shopId, suffix) => `manual-usage-overview-${shopId}-${suffix}`;
  const period = { id: idFor("shop-1", "billing-period-past-1"),
    shopId: "shop-1", status: "CLOSED", planKindSnapshot: "PAID_METERED" };
  const event = { id: idFor("shop-1", "usage-past-1-001"), shopId: "shop-1",
    billingPeriodId: period.id, metric: "RECOVERY_CONVERSATION", sourceType: "CHECKOUT_RECOVERY",
    quantity: 2, occurredAt: NOW };
  assert.equal(buildPaidAllowanceFixtures("shop-1", period, "past-1", [event], idFor).counter.committedQuantity, 2);
  assert.throws(() => buildPaidAllowanceFixtures("shop-1", period, "current", [event], idFor), /Only synthetic/);
  assert.throws(() => buildPaidAllowanceFixtures("shop-1", { ...period, status: "OPEN" }, "past-1", [event], idFor), /Only synthetic/);
  assert.throws(() => buildPaidAllowanceFixtures("shop-1", period, "past-1", [{ ...event, quantity: -1 }], idFor), /positive integral/);
  assert.throws(() => buildPaidAllowanceFixtures("shop-1", period, "past-1", [{ ...event, id: "wrong" }], idFor), /does not match/);
});

function paidCleanupTransaction(writes) {
  const operations = [];
  const reservations = writes.reservations.map((row) => ({
    counterId: null, billingPeriodEntitlementCounterId: null,
    purchasedCreditPurchaseId: null, promotionalCreditGrantId: null,
    compensationUsageEventId: null, ...row,
  }));
  const events = writes.events.map((row) => ({ correctionOfUsageEventId: null, ...row }));
  const zero = async () => ({ count: 0 });
  return { operations, tx: {
    usageReservation: {
      findMany: async () => reservations,
      count: async () => 0,
      deleteMany: async () => { operations.push("delete-reservations"); return { count: reservations.length }; },
    },
    usageEvent: {
      findMany: async ({ where }) => where?.id?.in ? events : events.map(({ id }) => ({ id })),
      count: async () => 0,
      deleteMany: async () => { operations.push("delete-usage"); return { count: events.length }; },
    },
    billingPeriod: {
      findMany: async () => writes.periods,
      deleteMany: async () => { operations.push("delete-periods"); return { count: writes.periods.length }; },
    },
    billingPeriodEntitlementCounter: {
      findMany: async () => writes.paidCounters,
      deleteMany: async () => { operations.push("delete-counters"); return { count: writes.paidCounters.length }; },
    },
    subscription: { findUnique: async () => ({ billingPeriodId: null }) },
    conversation: { findMany: async () => [], deleteMany: zero },
    checkoutRecovery: { findMany: async () => [], deleteMany: zero },
    customer: { deleteMany: zero },
  }};
}

test("cleanup validates and removes only paid fixture reservations/counters before deleting historical periods", async () => {
  const { api } = harness();
  const { store, tx, writes } = seedTransaction("FREE");
  await api.seedHistoricalPaidUsage(tx, store, NOW, [{ id: "fixture-recovery" }]);
  const cleanup = paidCleanupTransaction(writes);
  const result = await api.cleanupDatabase(cleanup.tx, store.id);
  assert.equal(result.usageEvents, 34);
  assert.equal(result.billingPeriods, 3);
  assert.deepEqual(cleanup.operations, ["delete-reservations", "delete-usage", "delete-counters", "delete-periods"]);
});

test("cleanup fails closed on corrupted paid allowance without deleting any usage", async () => {
  const { api } = harness();
  const { store, tx, writes } = seedTransaction("FREE");
  await api.seedHistoricalPaidUsage(tx, store, NOW, [{ id: "fixture-recovery" }]);
  writes.paidCounters[0].committedQuantity -= 1;
  const cleanup = paidCleanupTransaction(writes);
  await assert.rejects(() => api.cleanupDatabase(cleanup.tx, store.id), /counter changed|counter.*cleanup|reservation.*changed/);
  assert.deepEqual(cleanup.operations, []);
});

test("cleanup refuses foreign reservations that reference fixture paid allowances", async () => {
  const { api } = harness();
  const { store, tx, writes } = seedTransaction("FREE");
  await api.seedHistoricalPaidUsage(tx, store, NOW, [{ id: "fixture-recovery" }]);
  const cleanup = paidCleanupTransaction(writes);
  cleanup.tx.usageReservation.count = async () => 1;
  await assert.rejects(() => api.cleanupDatabase(cleanup.tx, store.id), /Non-fixture reservation/);
  assert.deepEqual(cleanup.operations, []);
});

test("cleanup refuses foreign usage in synthetic periods", async () => {
  const { api } = harness();
  const { store, tx, writes } = seedTransaction("FREE");
  await api.seedHistoricalPaidUsage(tx, store, NOW, [{ id: "fixture-recovery" }]);
  const cleanup = paidCleanupTransaction(writes);
  cleanup.tx.usageEvent.count = async () => 1;
  await assert.rejects(() => api.cleanupDatabase(cleanup.tx, store.id), /Non-fixture usage/);
  assert.deepEqual(cleanup.operations, []);
});


test("Free-now/paid-before combined cleanup reverses Free counter but never mutates a genuine paid balance", async () => {
  const { api, context } = harness();
  const { store, tx, writes } = seedTransaction("FREE");
  context.__prisma.$transaction = async (fn) => fn(tx);
  await api.seedDatabase(store, null, true);
  assert.equal(writes.reservations.length, 38);
  const cleanup = paidCleanupTransaction(writes);
  cleanup.tx.shopEntitlementCounter = {
    findUnique: async () => ({ id: "free-counter", version: 1 }),
    updateMany: async ({ data }) => {
      assert.equal(data.committedQuantity.decrement, 4);
      cleanup.operations.push("refund-free");
      return { count: 1 };
    },
  };
  const result = await api.cleanupDatabase(cleanup.tx, store.id);
  assert.equal(result.usageEvents, 38);
  assert.deepEqual(cleanup.operations, [
    "refund-free", "delete-reservations", "delete-usage", "delete-counters", "delete-periods",
  ]);
});
