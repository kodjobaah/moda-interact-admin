import assert from "node:assert/strict";
import test from "node:test";
import { mutatePromotionCampaignLifecycle } from "../../src/lib/admin/promotion-campaign-lifecycle.ts";

type TestTransaction = {
  events: Array<Record<string, unknown>>;
  promotionCampaign: {
    findUnique: () => Promise<Record<string, unknown>>;
    updateMany: () => Promise<{ count: number }>;
  };
  promotionCampaignEvent: {
    create: (input: { data: Record<string, unknown> }) => Promise<void>;
  };
};

function transactionFor(campaign: Record<string, unknown>, updateCount = 1): TestTransaction {
  const events: Array<Record<string, unknown>> = [];
  return {
    events,
    promotionCampaign: {
      findUnique: async () => campaign,
      updateMany: async () => ({ count: updateCount }),
    },
    promotionCampaignEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => { events.push(data); },
    },
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
  assert.deepEqual(transaction.events, [{ campaignId: base.id, kind: "CLOSED", platformAdminId: "admin-1" }]);
});

test("rejects an unexpired ACTIVE reopen and allows an expired ACTIVE reopen", async () => {
  const transaction = transactionFor({ ...base, expiresAt: new Date("2026-09-20T00:00:00.000Z") });
  await assert.rejects(
    mutatePromotionCampaignLifecycle(transaction as never, { id: base.id, intent: "reopen", adminId: "admin-1", expiresAt: new Date("2026-09-21T00:00:00.000Z") }, now),
    /expired active or closed/,
  );
  const expiredTransaction = transactionFor(base);
  await mutatePromotionCampaignLifecycle(expiredTransaction as never, { id: base.id, intent: "reopen", adminId: "admin-1", expiresAt: new Date("2026-09-21T00:00:00.000Z") }, now);
  assert.deepEqual(expiredTransaction.events, [{
    campaignId: base.id,
    kind: "EXPIRY_CHANGED",
    oldExpiresAt: base.expiresAt,
    newExpiresAt: new Date("2026-09-21T00:00:00.000Z"),
    platformAdminId: "admin-1",
  }]);
});

test("reopening CLOSED appends REOPENED before EXPIRY_CHANGED", async () => {
  const transaction = transactionFor({ ...base, status: "CLOSED" as const });
  await mutatePromotionCampaignLifecycle(transaction as never, { id: base.id, intent: "reopen", adminId: "admin-1", expiresAt: new Date("2026-09-21T00:00:00.000Z") }, now);
  assert.deepEqual(transaction.events.map((event) => event.kind), ["REOPENED", "EXPIRY_CHANGED"]);
});

test("stale compare-and-set writes no lifecycle audit event", async () => {
  const transaction = transactionFor(base, 0);
  await assert.rejects(
    mutatePromotionCampaignLifecycle(transaction as never, { id: base.id, intent: "close", adminId: "admin-1" }, now),
    /changed; reload and retry/,
  );
  assert.equal(transaction.events.length, 0);
});