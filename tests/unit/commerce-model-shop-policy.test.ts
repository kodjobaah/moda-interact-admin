import assert from "node:assert/strict";
import test from "node:test";
import { CommerceModelPolicyConflict } from "../../src/lib/admin/commerce-model-platform-policy.ts";
import { loadLiveShopPolicyDashboard, mutateLiveShopPolicy } from "../../src/lib/admin/commerce-model-shop-policy.ts";

type Call = { op: string; args: any };
function mockDb({ shopExists = true, currentStatus = "ACTIVE", handle = "growth", planExists = true,
  shopBudget = { id: "arch038-live-shop-development-shop-1", editVersion: 2, budgetSchemaVersion: 1, budget: { outputTokens: 1500 } } as any,
  planBudget = { budget: { deadlineMs: 80000 }, budgetSchemaVersion: 1 } as any,
  resultCount = 1, auditFails = false, history = [] as any[] } = {}) {
  const calls: Call[] = [];
  const tx = {
    shop: { findUnique: async (args: any) => { calls.push({ op: "shop", args }); return shopExists ? { id: args.where.id } : null; } },
    subscription: { findUnique: async (args: any) => { calls.push({ op: "subscription", args }); return currentStatus
      ? { status: currentStatus, planId: "billing-1", plan: handle ? { shopifyPlanHandle: handle } : null } : null; } },
    merchantPricingPlan: { findUnique: async (args: any) => { calls.push({ op: "current-plan", args }); return planExists
      ? { id: "plan-1", displayName: "Growth", shopifyPlanHandle: handle } : null; } },
    commerceModelPolicy: {
      findMany: async (args: any) => { calls.push({ op: "find", args }); return args.where.scope === "PLATFORM"
        ? [{ budget: { deadlineMs: 60000, outputTokens: 800 }, budgetSchemaVersion: 1 }]
        : args.where.scope === "PRICE_PLAN" ? (planBudget ? [planBudget] : []) : (shopBudget ? [shopBudget] : []); },
      updateMany: async (args: any) => { calls.push({ op: "update", args }); return { count: resultCount }; },
      deleteMany: async (args: any) => { calls.push({ op: "delete", args }); return { count: resultCount }; },
      create: async (args: any) => { calls.push({ op: "create", args }); },
    },
    commerceAuditEvent: {
      findMany: async (args: any) => { calls.push({ op: "history", args }); return history; },
      create: async (args: any) => { calls.push({ op: "audit", args }); if (auditFails) throw Error("audit insert failed"); },
    },
  };
  return { tx: tx as never, calls };
}

const input = { shopId: "shop-1", expectedEditVersion: 2, reason: "Merchant exception", budget: { deadlineMs: 70000, outputTokens: 1500 } };

test("LIVE dashboard resolves Platform, verified current Price Plan and Merchant independently", async () => {
  const { tx, calls } = mockDb();
  const result = await loadLiveShopPolicyDashboard(tx, "DEVELOPMENT", "shop-1", 0);
  assert.deepEqual(result.policy.effective, { deadlineMs: 80000, outputTokens: 1500 });
  assert.deepEqual(result.policy.sources, { deadlineMs: "PRICE_PLAN", outputTokens: "MERCHANT" });
  assert.equal(result.policy.currentPlan.plan?.id, "plan-1");
  const scopeFilters = calls.filter(({ op }) => op === "find").map(({ args }) => args.where);
  assert.ok(scopeFilters.every((q: any) => q.context === "LIVE" && q.environment === "DEVELOPMENT"));
  assert.equal(scopeFilters.find((q: any) => q.scope === "SHOP")?.shopId, "shop-1");
  assert.equal(scopeFilters.find((q: any) => q.scope === "PRICE_PLAN")?.merchantPricingPlanId, "plan-1");
});
test("no active/trialing current plan explicitly falls back to Platform, without plan query", async () => {
  const { tx, calls } = mockDb({ currentStatus: "NO_CONTRACT", shopBudget: null });
  const result = await loadLiveShopPolicyDashboard(tx, "DEVELOPMENT", "shop-1", 0);
  assert.equal(result.policy.currentPlan.state, "NO_CURRENT_PLAN");
  assert.deepEqual(result.policy.sources, { deadlineMs: "PLATFORM", outputTokens: "PLATFORM" });
  assert.equal(calls.filter(({ op }) => op === "current-plan").length, 0);
});
test("unmatched current Billing Plan handle never fabricates Price Plan override", async () => {
  const { tx, calls } = mockDb({ planExists: false, shopBudget: null });
  const result = await loadLiveShopPolicyDashboard(tx, "DEVELOPMENT", "shop-1", 0);
  assert.equal(result.policy.currentPlan.state, "UNMATCHED_PLAN");
  assert.equal(result.policy.currentPlan.plan, null);
  assert.equal(calls.filter(({ op, args }) => op === "find" && args.where.scope === "PRICE_PLAN").length, 0);
});
test("Shop history is bound to stable Shop/environment identity after override deletion", async () => {
  const { tx, calls } = mockDb({ shopBudget: null });
  await loadLiveShopPolicyDashboard(tx, "DEVELOPMENT", "shop-1", 2);
  const history = calls.find(({ op }) => op === "history")!.args;
  assert.equal(history.where.modelPolicyId, "arch038-live-shop-development-shop-1");
  assert.equal(history.where.environment, "DEVELOPMENT");
  assert.equal(history.where.action, "SET_LIVE_SHOP_BUDGET_OVERRIDE");
  assert.equal(history.skip, 20);
});
test("updates use LIVE SHOP tenant-scoped CAS and atomic audit metadata", async () => {
  const { tx, calls } = mockDb();
  await mutateLiveShopPolicy(tx, input, "DEVELOPMENT", "admin-1");
  const update = calls.find(({ op }) => op === "update")!.args;
  assert.equal(update.where.shopId, "shop-1");
  assert.equal(update.where.scope, "SHOP");
  assert.equal(update.where.context, "LIVE");
  assert.equal(update.where.editVersion, 2);
  assert.deepEqual(update.data.budget, input.budget);
  const audit = calls.find(({ op }) => op === "audit")!.args.data;
  assert.equal(audit.action, "SET_LIVE_SHOP_BUDGET_OVERRIDE");
  assert.equal(audit.actorAdminId, "admin-1");
  assert.deepEqual(audit.metadata.previousBudget, { outputTokens: 1500 });
  assert.deepEqual(audit.metadata.nextBudget, input.budget);
});
test("clearing one override preserves other explicit key and clearing all deletes only the Shop row", async () => {
  const updated = mockDb();
  await mutateLiveShopPolicy(updated.tx, { ...input, budget: { deadlineMs: 70000 } }, "DEVELOPMENT", "admin-1");
  assert.deepEqual(updated.calls.find(({ op }) => op === "update")!.args.data.budget, { deadlineMs: 70000 });
  const cleared = mockDb();
  await mutateLiveShopPolicy(cleared.tx, { ...input, budget: {} }, "DEVELOPMENT", "admin-1");
  assert.equal(cleared.calls.filter(({ op }) => op === "delete").length, 1);
  assert.equal(cleared.calls.find(({ op }) => op === "delete")!.args.where.shopId, "shop-1");
  assert.equal(cleared.calls.find(({ op }) => op === "audit")!.args.data.metadata.operation, "CLEAR");
});
test("new Shop override starts at version 1", async () => {
  const { tx, calls } = mockDb({ shopBudget: null });
  await mutateLiveShopPolicy(tx, { ...input, expectedEditVersion: 0 }, "DEVELOPMENT", "admin-1");
  assert.equal(calls.find(({ op }) => op === "create")!.args.data.shopId, "shop-1");
  assert.equal(calls.find(({ op }) => op === "audit")!.args.data.metadata.nextEditVersion, 1);
});
test("reject stale CAS, unknown Shop and audit insertion failures", async () => {
  for (const [opts, changedInput, expected] of [
    [{}, { ...input, expectedEditVersion: 1 }, CommerceModelPolicyConflict],
    [{ resultCount: 0 }, input, CommerceModelPolicyConflict],
    [{ shopExists: false }, input, /no longer exists/],
    [{ auditFails: true }, input, /audit insert failed/],
  ] as const) {
    const { tx } = mockDb(opts);
    await assert.rejects(mutateLiveShopPolicy(tx, changedInput, "DEVELOPMENT", "admin-1"), expected);
  }
});
