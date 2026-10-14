import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPolicyModule } from './helpers/commerce-model-policy-module-harness.mjs';

const fields = loadPolicyModule('src/lib/admin/commerce-model-policy-fields.ts', {});
const shopFields = loadPolicyModule('src/lib/admin/commerce-model-shop-policy-fields.ts', {
  './commerce-model-policy-fields.ts': fields,
});
const conflict = class CommerceModelPolicyConflict extends Error {};
const denied = class PlatformAdminUnauthorizedError extends Error {};
process.env.DEPLOYMENT_ENVIRONMENT_NAME ||= 'development';
const scope = loadPolicyModule('src/lib/admin/commerce-model-shop-policy-scope.ts', { 'node:crypto': await import('node:crypto') });
function fixture(role = 'SUPER_ADMIN', { emptyShopPolicy = false } = {}) {
  let transactions = 0, commits = 0, reloads = 0, auditFails = false, casFails = false;
  const stored = { budget: { deadlineMs: 80000 }, editVersion: 2, exists: !emptyShopPolicy };
  const events = [];
  const reads = [];
  const db = {
    shop: { findUnique: async ({ where }) => ({ id: where.id }) },
    subscription: { findUnique: async () => ({ status: 'ACTIVE', planId: 'billing-1', plan: { shopifyPlanHandle: 'growth' } }) },
    merchantPricingPlan: { findUnique: async () => ({ id: 'plan-1', displayName: 'Growth', shopifyPlanHandle: 'growth' }) },
    commerceModelPolicy: { findMany: async (args) => {
      reads.push(args);
      return args.where.scope === 'PLATFORM' ? [{ budget: { deadlineMs: 60000, outputTokens: 800 }, budgetSchemaVersion: 1 }]
        : args.where.scope === 'PRICE_PLAN' ? []
        : stored.exists ? [{ id: 'shop-policy', budget: stored.budget, budgetSchemaVersion: 1, editVersion: stored.editVersion }] : [];
    } },
    commerceAuditEvent: {
      findMany: async () => [],
      count: async () => events.length,
      findFirst: async () => events.length ? { metadata: events.at(-1).metadata } : null,
    },
    async $transaction(callback, { isolationLevel }) {
      assert.equal(isolationLevel, 'Serializable');
      transactions++;
      const staged = { budget: { ...stored.budget }, editVersion: stored.editVersion, exists: stored.exists, events: [] };
      const tx = {
        shop: db.shop,
        commerceModelPolicy: {
          findMany: db.commerceModelPolicy.findMany,
          updateMany: async ({ where, data }) => {
            assert.equal(where.shopId, 'shop-1');
            assert.equal(where.scope, 'SHOP');
            assert.equal(where.context, 'LIVE');
            if (casFails || !stored.exists || where.editVersion !== stored.editVersion) return { count: 0 };
            staged.budget = data.budget;
            staged.editVersion++;
            return { count: 1 };
          },
          create: async ({ data }) => {
            assert.equal(staged.exists, false);
            staged.budget = data.budget;
            staged.editVersion = data.editVersion;
            staged.exists = true;
          },
          deleteMany: async ({ where }) => {
            if (casFails || !stored.exists || where.editVersion !== stored.editVersion) return { count: 0 };
            staged.exists = false;
            return { count: 1 };
          },
        },
        commerceAuditEvent: {
          count: async () => events.length,
          findFirst: async () => events.length ? { metadata: events.at(-1).metadata } : null,
          create: async ({ data }) => {
          if (auditFails) throw Error('audit failed');
          staged.events.push(data);
          },
        },
      };
      await callback(tx);
      stored.budget = staged.budget;
      stored.editVersion = staged.editVersion;
      stored.exists = staged.exists;
      events.push(...staged.events);
      commits++;
    },
  };
  const service = loadPolicyModule('src/lib/admin/commerce-model-shop-policy.ts', {
    './commerce-model-policy-fields.ts': fields,
    './commerce-model-shop-policy-fields.ts': shopFields,
    './commerce-model-platform-policy.ts': { CommerceModelPolicyConflict: conflict },
    './commerce-environment.ts': { resolveAdminCommerceEnvironment: () => 'DEVELOPMENT' },
    '@/lib/auth/platform-admin': { requirePlatformAdminRead: async () => ({ id: 'admin-1', role }), PlatformAdminUnauthorizedError: denied },
    '@/lib/prisma': { prisma: db },
  });
  const action = loadPolicyModule('src/app/actions/commerce-model-shop-policy.ts', {
    'next/cache': { revalidatePath: (path) => { assert.equal(path, '/'); reloads++; } },
    '@/lib/auth/platform-admin': { requirePlatformAdminMutation: async () => ({ id: 'admin-1', role }) },
    '@/lib/auth/development-platform-admin': { ensureDevelopmentPlatformAdmin: async () => {} },
    '@/lib/admin/commerce-environment': { resolveAdminCommerceEnvironment: () => 'DEVELOPMENT' },
    '@/lib/admin/commerce-model-policy-fields': fields,
    '@/lib/admin/commerce-model-shop-policy-fields': shopFields,
    '@/lib/admin/commerce-model-shop-policy-scope': scope,
    '@/lib/admin/commerce-model-shop-policy': service,
    '@/lib/admin/commerce-model-platform-policy': { CommerceModelPolicyConflict: conflict },
    '@/lib/prisma': { prisma: db },
  });
  function form(overrides = {}) {
    const result = new FormData();
    for (const [key, value] of Object.entries({
      shopId: 'shop-1', shopPolicyScope: scope.issueLiveShopPolicyScope('shop-1', 'admin-1'),
      expectedEditVersion: '2', reason: 'Tenant-specific exception',
      override_deadlineMs: 'on', deadlineMs: '70000', ...overrides,
    })) result.set(key, value);
    return result;
  }
  return { service, action, form, stored, events, reads,
    failAudit: () => { auditFails = true; }, failCas: () => { casFails = true; },
    counts: () => ({ transactions, commits, reloads }), };
}

test('ADMIN/SUPPORT cannot execute policy mutation and cannot query LIVE Shop dashboard', async () => {
  for (const role of ['ADMIN', 'SUPPORT']) {
    const f = fixture(role);
    assert.equal((await f.action.saveLiveShopBudgetAction(f.form())).ok, false);
    await assert.rejects(f.service.getLiveShopPolicyDashboard('shop-1', 0), denied);
    assert.equal(f.counts().transactions, 0);
    assert.equal(f.reads.length, 0);
  }
});
test('SUPER_ADMIN dashboard reads tenant-filtered LIVE rows only', async () => {
  const f = fixture();
  const result = await f.service.getLiveShopPolicyDashboard('shop-1', 0);
  assert.equal(result.policy.shopId, 'shop-1');
  assert.equal(f.reads.find(x => x.where.scope === 'SHOP').where.shopId, 'shop-1');
  assert.ok(f.reads.every(x => x.where.context === 'LIVE'));
});
test('invalid form is rejected without opening a transaction', async () => {
  const f = fixture();
  const result = await f.action.saveLiveShopBudgetAction(f.form({ deadlineMs: '90001', reason: '' }));
  assert.equal(result.ok, false);
  assert.ok(result.fieldErrors.deadlineMs);
  assert.equal(f.counts().transactions, 0);
});
test('successful mutation commits policy and audit, then revalidates Tenant Directory', async () => {
  const f = fixture();
  assert.deepEqual(await f.action.saveLiveShopBudgetAction(f.form()), { ok: true });
  assert.deepEqual(f.stored.budget, { deadlineMs: 70000 });
  assert.equal(f.events[0].action, 'SET_LIVE_SHOP_BUDGET_OVERRIDE');
  assert.deepEqual(f.counts(), { transactions: 1, commits: 1, reloads: 1 });
});
test('stale edits, concurrent CAS loss, and failed audits do not commit or refresh', async () => {
  const stale = fixture();
  assert.equal((await stale.action.saveLiveShopBudgetAction(stale.form({ expectedEditVersion: '1' }))).conflict, true);
  assert.equal(stale.counts().commits, 0);
  const lost = fixture();
  lost.failCas();
  assert.equal((await lost.action.saveLiveShopBudgetAction(lost.form())).conflict, true);
  assert.equal(lost.events.length, 0);
  const failure = fixture();
  failure.failAudit();
  assert.equal((await failure.action.saveLiveShopBudgetAction(failure.form())).ok, false);
  assert.equal(failure.stored.editVersion, 2);
  assert.equal(failure.counts().reloads, 0);
});

test('posted different existing Shop id cannot mutate or audit the selected Tenant', async () => {
  const f = fixture();
  const result = await f.action.saveLiveShopBudgetAction(f.form({ shopId: 'shop-2' }));
  assert.equal(result.ok, false);
  assert.match(result.message, /scope does not match/);
  assert.deepEqual(f.counts(), { transactions: 0, commits: 0, reloads: 0 });
  assert.equal(f.events.length, 0);
  assert.deepEqual(f.stored.budget, { deadlineMs: 80000 });
});
test('tampered, missing, expired, and other-admin scopes fail before transaction', async () => {
  const f = fixture();
  for (const token of [
    '', 'invalid',
    scope.issueLiveShopPolicyScope('shop-2', 'admin-1'),
    scope.issueLiveShopPolicyScope('shop-1', 'other-admin'),
    scope.issueLiveShopPolicyScope('shop-1', 'admin-1', Date.now() - 9 * 60 * 60 * 1000),
  ]) {
    const result = await f.action.saveLiveShopBudgetAction(f.form({ shopPolicyScope: token }));
    assert.equal(result.ok, false);
  }
  assert.deepEqual(f.counts(), { transactions: 0, commits: 0, reloads: 0 });
  assert.equal(f.events.length, 0);
});


test('server action rejects a still-signed version-0 form after create and clear, without a new write or audit', async () => {
  const f = fixture('SUPER_ADMIN', { emptyShopPolicy: true });
  const original = { expectedEditVersion: '0', reason: 'Initial policy', deadlineMs: '70000' };
  assert.deepEqual(await f.action.saveLiveShopBudgetAction(f.form(original)), { ok: true });
  assert.equal(f.stored.exists, true);
  assert.equal(f.stored.editVersion, 1);
  assert.deepEqual(await f.action.saveLiveShopBudgetAction(f.form({
    expectedEditVersion: '1', override_deadlineMs: 'off', reason: 'Restore inherited defaults',
  })), { ok: true });
  assert.equal(f.stored.exists, false);
  assert.equal(f.events.at(-1).metadata.nextEditVersion, 2);
  const before = { commits: f.counts().commits, audits: f.events.length, reloads: f.counts().reloads };
  const replay = await f.action.saveLiveShopBudgetAction(f.form(original));
  assert.equal(replay.conflict, true);
  assert.equal(f.stored.exists, false);
  assert.deepEqual({ commits: f.counts().commits, audits: f.events.length, reloads: f.counts().reloads }, before);
});
