import assert from "node:assert/strict";
import test from "node:test";
import { CommerceModelPolicyConflict, loadLivePlatformPolicyDashboard, updateLivePlatformPolicy } from "../../src/lib/admin/commerce-model-platform-policy.ts";

function fakePolicy(budget = { deadlineMs: 60000, outputTokens: 800 }) {
  return { id: "live-platform", environment: "DEVELOPMENT", context: "LIVE", scope: "PLATFORM", budget, budgetSchemaVersion: 1, editVersion: 3, updatedAt: new Date("2026-10-13T12:00:00Z") };
}
function fixture({ count = 1, updated = 1, auditFails = false } = {}) {
  const calls: Array<{ kind: string; data?: unknown }> = [];
  const transaction = {
    commerceModelPolicy: {
      findMany: async (query: unknown) => { calls.push({ kind: "find", data: query }); return count === 1 ? [fakePolicy()] : []; },
      updateMany: async (query: unknown) => { calls.push({ kind: "update", data: query }); return { count: updated }; },
    },
    commerceAuditEvent: {
      create: async ({ data }: { data: unknown }) => { calls.push({ kind: "audit", data }); if (auditFails) throw Error("audit invalid"); },
      findMany: async (query: unknown) => { calls.push({ kind: "history", data: query }); return []; },
    },
  };
  return { transaction: transaction as never, calls };
}
const input = { budget: { deadlineMs: 70000, outputTokens: 1200 }, expectedEditVersion: 3, reason: "Raise Studio-independent LIVE budget" };

test("LIVE Platform update uses scoped CAS and creates an atomic audit entry", async () => {
  const f = fixture();
  await updateLivePlatformPolicy(f.transaction, input, "DEVELOPMENT", "admin-1");
  const update = f.calls.find(x => x.kind === "update")!.data as any;
  assert.deepEqual(update.where, { id: "live-platform", environment: "DEVELOPMENT", context: "LIVE", scope: "PLATFORM", editVersion: 3 });
  assert.deepEqual(update.data.budget, input.budget);
  assert.equal(update.data.updatedByAdminId, "admin-1");
  const audit = f.calls.find(x => x.kind === "audit")!.data as any;
  assert.equal(audit.action, "SET_LIVE_PLATFORM_BUDGET");
  assert.equal(audit.actorAdminId, "admin-1");
  assert.equal(audit.reason, input.reason);
  assert.deepEqual(audit.metadata.previousBudget, { deadlineMs: 60000, outputTokens: 800 });
  assert.deepEqual(audit.metadata.nextBudget, input.budget);
  assert.equal(audit.metadata.nextEditVersion, 4);
});

test("Missing default, stale version and CAS loss cannot write audit", async () => {
  for (const [opts, data] of [
    [{ count: 0 }, input],
    [{}, { ...input, expectedEditVersion: 2 }],
    [{ updated: 0 }, input],
  ] as const) {
    const f = fixture(opts);
    await assert.rejects(updateLivePlatformPolicy(f.transaction, data, "DEVELOPMENT", "admin-1"));
    assert.equal(f.calls.some(x => x.kind === "audit"), false);
  }
});

test("Update rejects unsupported schema/values; audit failure propagates for enclosing transaction rollback", async () => {
  const f = fixture({ auditFails: true });
  await assert.rejects(updateLivePlatformPolicy(f.transaction, input, "DEVELOPMENT", "admin-1"), /audit invalid/);
});

test("History is always scoped to the current LIVE Platform row and environment", async () => {
  const f = fixture();
  const data = await loadLivePlatformPolicyDashboard(f.transaction, "DEVELOPMENT", 1);
  assert.equal(data.policy?.editVersion, 3);
  const history = f.calls.find(x => x.kind === "history")!.data as any;
  assert.deepEqual(history.where, {
    modelPolicyId: "live-platform", environment: "DEVELOPMENT", action: "SET_LIVE_PLATFORM_BUDGET", actorType: "PLATFORM_ADMIN",
  });
  assert.equal(history.skip, 10);
  assert.equal(history.take, 11);
});
