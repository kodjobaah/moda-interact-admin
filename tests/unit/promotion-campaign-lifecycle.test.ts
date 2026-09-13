import assert from "node:assert/strict";
import test from "node:test";
import { mutatePromotionCampaignLifecycle } from "../../src/lib/admin/promotion-campaign-lifecycle.ts";

type TestTransaction = {
  calls: Array<
    | { kind: "findUnique"; args: unknown }
    | { kind: "updateMany"; args: unknown }
    | { kind: "eventCreate"; args: unknown }
  >;
  forbiddenMutationCalls: number;
  events: Array<Record<string, unknown>>;
  updates: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }>;
  promotionCampaign: {
    findUnique: (input: { where: Record<string, unknown> }) => Promise<Record<string, unknown>>;
    updateMany: (input: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<{ count: number }>;
    create: () => Promise<never>;
    delete: () => Promise<never>;
    deleteMany: () => Promise<never>;
  };
  promotionCampaignEvent: {
    create: (input: { data: Record<string, unknown> }) => Promise<void>;
  };
  promotionalCreditGrant: { create: () => Promise<never>; createMany: () => Promise<never> };
  merchantPromotionSelection: { create: () => Promise<never>; createMany: () => Promise<never> };
};

function transactionFor(campaign: Record<string, unknown>, updateCount = 1): TestTransaction {
  const events: Array<Record<string, unknown>> = [];
  const updates: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }> = [];
  const calls: TestTransaction["calls"] = [];
  let forbiddenMutationCalls = 0;
  const trap = async (): Promise<never> => {
    forbiddenMutationCalls += 1;
    throw new Error("unexpected lifecycle mutation");
  };
  return {
    calls,
    get forbiddenMutationCalls() { return forbiddenMutationCalls; },
    events,
    updates,
    promotionCampaign: {
      findUnique: async (input: { where: Record<string, unknown> }) => {
        calls.push({ kind: "findUnique", args: input });
        return campaign;
      },
      updateMany: async (input: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        calls.push({ kind: "updateMany", args: input });
        updates.push(input);
        return { count: updateCount };
      },
      create: trap,
      delete: trap,
      deleteMany: trap,
    },
    promotionCampaignEvent: {
      create: async (input: { data: Record<string, unknown> }) => {
        calls.push({ kind: "eventCreate", args: input });
        events.push(input.data);
      },
    },
    promotionalCreditGrant: { create: trap, createMany: trap },
    merchantPromotionSelection: { create: trap, createMany: trap },
  };
}

const base = {
  id: "campaign-1",
  startsAt: new Date("2026-09-01T00:00:00.000Z"),
  expiresAt: new Date("2026-09-10T00:00:00.000Z"),
  status: "ACTIVE" as const,
  version: 3,
};
const now = new Date("2026-09-13T00:00:00.000Z");

test("closes through version CAS before writing one CLOSED event", async () => {
  const transaction = transactionFor(base);
  await mutatePromotionCampaignLifecycle(transaction as never, { id: base.id, intent: "close", adminId: "admin-1" }, now);
  assert.deepEqual(transaction.updates, [{
    where: { id: base.id, status: "ACTIVE", version: 3 },
    data: { status: "CLOSED", version: { increment: 1 } },
  }]);
  assert.deepEqual(transaction.events, [{ campaignId: base.id, kind: "CLOSED", platformAdminId: "admin-1" }]);
  assert.deepEqual(transaction.calls.map((call) => call.kind), ["findUnique", "updateMany", "eventCreate"]);
});

test("rejects an unexpired ACTIVE reopen and allows an expired ACTIVE reopen", async () => {
  const transaction = transactionFor({ ...base, expiresAt: new Date("2026-09-20T00:00:00.000Z") });
  await assert.rejects(
    mutatePromotionCampaignLifecycle(transaction as never, { id: base.id, intent: "reopen", adminId: "admin-1", expiresAt: new Date("2026-09-21T00:00:00.000Z") }, now),
    /expired active or closed/,
  );
  const expiredTransaction = transactionFor(base);
  await mutatePromotionCampaignLifecycle(expiredTransaction as never, { id: base.id, intent: "reopen", adminId: "admin-1", expiresAt: new Date("2026-09-21T00:00:00.000Z") }, now);
  assert.deepEqual(expiredTransaction.updates[0], {
    where: { id: base.id, status: "ACTIVE", version: 3 },
    data: { expiresAt: new Date("2026-09-21T00:00:00.000Z"), version: { increment: 1 } },
  });
  assert.deepEqual(expiredTransaction.events, [{
    campaignId: base.id,
    kind: "EXPIRY_CHANGED",
    oldExpiresAt: base.expiresAt,
    newExpiresAt: new Date("2026-09-21T00:00:00.000Z"),
    platformAdminId: "admin-1",
  }]);
  assert.deepEqual(Object.keys(expiredTransaction.updates[0]!.data).sort(), ["expiresAt", "version"]);
});

test("reopening CLOSED appends REOPENED before EXPIRY_CHANGED", async () => {
  const transaction = transactionFor({ ...base, status: "CLOSED" as const });
  await mutatePromotionCampaignLifecycle(transaction as never, { id: base.id, intent: "reopen", adminId: "admin-1", expiresAt: new Date("2026-09-21T00:00:00.000Z") }, now);
  assert.deepEqual(transaction.updates[0], {
    where: { id: base.id, status: "CLOSED", version: 3 },
    data: { expiresAt: new Date("2026-09-21T00:00:00.000Z"), status: "ACTIVE", version: { increment: 1 } },
  });
  assert.deepEqual(transaction.events, [
    { campaignId: base.id, kind: "REOPENED", platformAdminId: "admin-1" },
    {
      campaignId: base.id,
      kind: "EXPIRY_CHANGED",
      oldExpiresAt: base.expiresAt,
      newExpiresAt: new Date("2026-09-21T00:00:00.000Z"),
      platformAdminId: "admin-1",
    },
  ]);
  assert.deepEqual(transaction.calls.map((call) => call.kind), ["findUnique", "updateMany", "eventCreate", "eventCreate"]);
  assert.deepEqual(Object.keys(transaction.updates[0]!.data).sort(), ["expiresAt", "status", "version"]);
});

test("stale compare-and-set writes no lifecycle audit event", async () => {
  const transaction = transactionFor(base, 0);
  await assert.rejects(
    mutatePromotionCampaignLifecycle(transaction as never, { id: base.id, intent: "close", adminId: "admin-1" }, now),
    /changed; reload and retry/,
  );
  assert.equal(transaction.updates.length, 1);
  assert.equal(transaction.events.length, 0);
});

test("stale expired ACTIVE reopen writes no lifecycle evidence", async () => {
  const transaction = transactionFor(base, 0);
  const newExpiresAt = new Date("2026-09-21T00:00:00.000Z");
  await assert.rejects(
    mutatePromotionCampaignLifecycle(transaction as never, { id: base.id, intent: "reopen", adminId: "admin-1", expiresAt: newExpiresAt }, now),
    /changed; reload and retry/,
  );
  assert.deepEqual(transaction.updates, [{
    where: { id: base.id, status: "ACTIVE", version: 3 },
    data: { expiresAt: newExpiresAt, version: { increment: 1 } },
  }]);
  assert.equal(transaction.events.length, 0);
});

test("stale CLOSED reopen writes no lifecycle evidence", async () => {
  const transaction = transactionFor({ ...base, status: "CLOSED" as const }, 0);
  const newExpiresAt = new Date("2026-09-21T00:00:00.000Z");
  await assert.rejects(
    mutatePromotionCampaignLifecycle(transaction as never, { id: base.id, intent: "reopen", adminId: "admin-1", expiresAt: newExpiresAt }, now),
    /changed; reload and retry/,
  );
  assert.deepEqual(transaction.updates, [{
    where: { id: base.id, status: "CLOSED", version: 3 },
    data: { expiresAt: newExpiresAt, status: "ACTIVE", version: { increment: 1 } },
  }]);
  assert.equal(transaction.events.length, 0);
});

test("lifecycle mutations do not clone, delete, grant, or select", async () => {
  const closeTransaction = transactionFor(base);
  await mutatePromotionCampaignLifecycle(closeTransaction as never, { id: base.id, intent: "close", adminId: "admin-1" }, now);
  const reopenTransaction = transactionFor({ ...base, status: "CLOSED" as const });
  await mutatePromotionCampaignLifecycle(reopenTransaction as never, { id: base.id, intent: "reopen", adminId: "admin-1", expiresAt: new Date("2026-09-21T00:00:00.000Z") }, now);
  assert.deepEqual(closeTransaction.calls.map((call) => call.kind), ["findUnique", "updateMany", "eventCreate"]);
  assert.deepEqual(reopenTransaction.calls.map((call) => call.kind), ["findUnique", "updateMany", "eventCreate", "eventCreate"]);
  assert.equal(closeTransaction.forbiddenMutationCalls, 0);
  assert.equal(reopenTransaction.forbiddenMutationCalls, 0);
});