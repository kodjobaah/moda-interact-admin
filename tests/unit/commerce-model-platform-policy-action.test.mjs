import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPolicyModule } from './helpers/commerce-model-policy-module-harness.mjs';

const fields = loadPolicyModule('src/lib/admin/commerce-model-policy-fields.ts', {});
const authDenied = class PlatformAdminUnauthorizedError extends Error {};

function fixture(role = 'SUPER_ADMIN') {
  let transactionCount = 0;
  let commitCount = 0;
  let revalidated = 0;
  let auditFails = false;
  let casLost = false;
  const stored = { budget: { deadlineMs: 60000, outputTokens: 800 }, editVersion: 3 };
  const events = [];
  const readQueries = [];
  let stage;
  const prisma = {
    commerceModelPolicy: { findMany: async (query) => {
      readQueries.push({ kind: "policy", query });
      return [{ id: "live-platform", environment: "DEVELOPMENT", context: "LIVE", scope: "PLATFORM",
        budget: stored.budget, budgetSchemaVersion: 1, editVersion: stored.editVersion, updatedAt: new Date("2026-10-13") }];
    } },
    commerceAuditEvent: { findMany: async (query) => { readQueries.push({ kind: "history", query }); return []; } },
    async $transaction(callback, options) {
      transactionCount++;
      assert.equal(options.isolationLevel, 'Serializable');
      stage = { ...stored, budget: { ...stored.budget }, events: [] };
      const tx = {
        commerceModelPolicy: {
          findMany: async ({ where }) => {
            assert.deepEqual(where, { environment: 'DEVELOPMENT', context: 'LIVE', scope: 'PLATFORM' });
            return [{ id: 'live-platform', environment: 'DEVELOPMENT', context: 'LIVE', scope: 'PLATFORM',
              budget: stage.budget, budgetSchemaVersion: 1, editVersion: stage.editVersion, updatedAt: new Date('2026-10-13') }];
          },
          updateMany: async ({ where, data }) => {
            if (casLost) return { count: 0 };
            assert.equal(where.editVersion, stage.editVersion);
            assert.equal(where.context, 'LIVE');
            assert.equal(where.scope, 'PLATFORM');
            stage.budget = data.budget;
            stage.editVersion += data.editVersion.increment;
            return { count: 1 };
          },
        },
        commerceAuditEvent: {
          create: async ({ data }) => {
            if (auditFails) throw Error('database audit insert failed');
            stage.events.push(data);
          },
        },
      };
      const result = await callback(tx);
      // Mimics commit/rollback: only publish changes if the entire callback succeeds.
      stored.budget = stage.budget;
      stored.editVersion = stage.editVersion;
      events.push(...stage.events);
      commitCount++;
      return result;
    },
  };
  const service = loadPolicyModule('src/lib/admin/commerce-model-platform-policy.ts', {
    './commerce-environment.ts': { resolveAdminCommerceEnvironment: () => 'DEVELOPMENT' },
    './commerce-model-policy-fields.ts': fields,
    '@/lib/auth/platform-admin': {
      requirePlatformAdminRead: async () => {
        if (!role) throw new authDenied();
        return { id: 'admin-1', role };
      },
      PlatformAdminUnauthorizedError: authDenied,
    },
    '@/lib/prisma': { prisma },
  });
  const action = loadPolicyModule('src/app/actions/commerce-model-platform-policy.ts', {
    'next/cache': { revalidatePath: (path) => { assert.equal(path, '/system-controls/platform-policy'); revalidated++; } },
    '@/lib/auth/platform-admin': { requirePlatformAdminMutation: async () => ({ id: 'admin-1', role }) },
    '@/lib/auth/development-platform-admin': { ensureDevelopmentPlatformAdmin: async () => {} },
    '@/lib/admin/commerce-environment': { resolveAdminCommerceEnvironment: () => 'DEVELOPMENT' },
    '@/lib/admin/commerce-model-policy-fields': fields,
    '@/lib/admin/commerce-model-platform-policy': service,
    '@/lib/prisma': { prisma },
  });
  const form = (overrides = {}) => {
    const entries = { deadlineMs: '70000', outputTokens: '1200', expectedEditVersion: '3', reason: 'Increase budget for testing', ...overrides };
    const data = new FormData();
    for (const [key, value] of Object.entries(entries)) data.set(key, value);
    return data;
  };
  return {
    action, service, form, stored, events, readQueries,
    failAudit: () => { auditFails = true; },
    loseCas: () => { casLost = true; },
    counts: () => ({ transactionCount, commitCount, revalidated }),
  };
}

test('non-SUPER_ADMIN cannot read LIVE policy or audit history', async () => {
  for (const role of ['ADMIN', 'SUPPORT']) {
    const f = fixture(role);
    await assert.rejects(f.service.getLivePlatformPolicyDashboard(0), authDenied);
    assert.equal(f.readQueries.length, 0);
    assert.equal(f.counts().transactionCount, 0);
  }
});

test('SUPER_ADMIN can load LIVE policy; read uses resolved environment', async () => {
  const f = fixture();
  const result = await f.service.getLivePlatformPolicyDashboard(0);
  assert.equal(result.policy.id, "live-platform");
  assert.equal(result.history.length, 0);
  assert.deepEqual(f.readQueries[0].query.where, { environment: "DEVELOPMENT", context: "LIVE", scope: "PLATFORM" });
  assert.deepEqual(f.readQueries[1].query.where, {
    modelPolicyId: "live-platform", environment: "DEVELOPMENT", action: "SET_LIVE_PLATFORM_BUDGET", actorType: "PLATFORM_ADMIN",
  });
});

test('save action rejects unauthorized role before transaction', async () => {
  for (const role of ['ADMIN', 'SUPPORT']) {
    const f = fixture(role);
    const result = await f.action.saveLivePlatformBudgetAction(f.form());
    assert.equal(result.ok, false);
    assert.match(result.message, /SUPER_ADMIN/);
    assert.equal(f.counts().transactionCount, 0);
  }
});

test('save action returns field errors without executing a transaction', async () => {
  const f = fixture();
  const result = await f.action.saveLivePlatformBudgetAction(f.form({ deadlineMs: '-1', reason: '' }));
  assert.equal(result.ok, false);
  assert.ok(result.fieldErrors.deadlineMs);
  assert.ok(result.fieldErrors.reason);
  assert.equal(f.counts().transactionCount, 0);
});

test('save action commits updated LIVE policy and audit together', async () => {
  const f = fixture();
  const result = await f.action.saveLivePlatformBudgetAction(f.form());
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(f.stored.budget, { deadlineMs: 70000, outputTokens: 1200 });
  assert.equal(f.stored.editVersion, 4);
  assert.equal(f.events.length, 1);
  assert.equal(f.events[0].action, 'SET_LIVE_PLATFORM_BUDGET');
  assert.equal(f.events[0].metadata.previousEditVersion, 3);
  assert.equal(f.events[0].metadata.nextEditVersion, 4);
  assert.deepEqual(f.counts(), { transactionCount: 1, commitCount: 1, revalidated: 1 });
});

test('stale version and concurrent CAS loss return recoverable conflicts without writes', async () => {
  const stale = fixture();
  assert.equal((await stale.action.saveLivePlatformBudgetAction(stale.form({ expectedEditVersion: '2' }))).conflict, true);
  assert.equal(stale.counts().commitCount, 0);
  const concurrent = fixture();
  concurrent.loseCas();
  assert.equal((await concurrent.action.saveLivePlatformBudgetAction(concurrent.form())).conflict, true);
  assert.deepEqual(concurrent.stored.budget, { deadlineMs: 60000, outputTokens: 800 });
  assert.equal(concurrent.events.length, 0);
});

test('audit insertion failure rolls back action transaction and avoids revalidation', async () => {
  const f = fixture();
  f.failAudit();
  const result = await f.action.saveLivePlatformBudgetAction(f.form());
  assert.equal(result.ok, false);
  assert.deepEqual(f.stored.budget, { deadlineMs: 60000, outputTokens: 800 });
  assert.equal(f.stored.editVersion, 3);
  assert.equal(f.events.length, 0);
  assert.deepEqual(f.counts(), { transactionCount: 1, commitCount: 0, revalidated: 0 });
});
