import assert from "node:assert/strict";
import { test } from "node:test";
import { executeOperationalIncidentTransition } from "../../src/lib/admin/operational-incident-actions.ts";

const key = "a".repeat(64);
const principal = { id: "admin-1", role: "ADMIN" };

function harness(
  subscription: {
    shopId: string;
    status: string;
    lastSyncErrorCode: string | null;
  } | null,
) {
  const calls = { updates: 0, events: 0, subscriptionReads: 0 };
  const tx = {
    operationalIncident: {
      findUnique: async () => ({
        id: "incident-1",
        status: "OPEN",
        revision: 0,
        ownerPlatformAdminId: "admin-1",
        category: "SHOPIFY_SUBSCRIPTION_BILLING",
        resourceKey: "subscription-1",
        shopId: "shop-1",
      }),
      updateMany: async () => {
        calls.updates++;
        return { count: 1 };
      },
    },
    subscription: {
      findUnique: async () => {
        calls.subscriptionReads++;
        return subscription;
      },
    },
    operationalIncidentEvent: {
      create: async () => {
        calls.events++;
      },
    },
  };
  const db = {
    $transaction: async (fn: (value: typeof tx) => Promise<unknown>) => fn(tx),
  };
  return { db, calls };
}

test("billing incident cannot resolve before a verified subscription recovery", async () => {
  for (const row of [
    null,
    { shopId: "other", status: "ACTIVE", lastSyncErrorCode: null },
    { shopId: "shop-1", status: "UNMAPPED", lastSyncErrorCode: null },
    {
      shopId: "shop-1",
      status: "SYNC_ERROR",
      lastSyncErrorCode: "BILLING_PERIOD_PLAN_CONFLICT",
    },
    {
      shopId: "shop-1",
      status: "ACTIVE",
      lastSyncErrorCode: "PRE_CLOSE_USAGE_FLUSH_FAILED",
    },
  ]) {
    const { db, calls } = harness(row);
    await assert.rejects(
      executeOperationalIncidentTransition(db as never, principal, {
        incidentKey: key,
        action: "RESOLVE",
        resolutionNote: "Reviewed",
      }),
      /not yet verified as repaired/,
    );
    assert.equal(calls.subscriptionReads, 1);
    assert.equal(calls.updates, 0);
    assert.equal(calls.events, 0);
  }
});

test("verified Shopify billing recovery retains audited Admin resolution", async () => {
  const { db, calls } = harness({
    shopId: "shop-1",
    status: "ACTIVE",
    lastSyncErrorCode: null,
  });
  await executeOperationalIncidentTransition(db as never, principal, {
    incidentKey: key,
    action: "RESOLVE",
    resolutionNote: "Reconciled and provider evidence verified",
  });
  assert.equal(calls.subscriptionReads, 1);
  assert.equal(calls.updates, 1);
  assert.equal(calls.events, 1);
});
