import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPolicyModule } from './helpers/commerce-model-policy-module-harness.mjs';

const baseFields = loadPolicyModule('src/lib/admin/commerce-model-policy-fields.ts', {});
const planFields = loadPolicyModule('src/lib/admin/commerce-model-plan-policy-fields.ts', {
  './commerce-model-policy-fields.ts': baseFields,
});
const PolicyConflict = class CommerceModelPolicyConflict extends Error {};

function fixture({ role = 'SUPER_ADMIN', existing = { id: 'arch038-live-plan-development-plan-1',
  editVersion: 2, budget: { deadlineMs: 70000, outputTokens: 1200 }, budgetSchemaVersion: 1 },
  planFound = true } = {}) {
  const stored = { policy: existing && structuredClone(existing) };
  const audits = [];
  const calls = [];
  const state = { commitCount: 0, revalidateCount: 0, failAudit: false, loseCas: false };
  const prisma = {
    async $transaction(callback, options) {
      calls.push({ method: 'transaction', options });
      assert.equal(options.isolationLevel, 'Serializable');
      const staged = structuredClone(stored.policy);
      let next = staged;
      const stagedAudits = [];
      const tx = {
        merchantPricingPlan: { async findUnique(params) {
          calls.push({ method: 'findPlan', params });
          return planFound ? { id: 'plan-1' } : null;
        } },
        commerceModelPolicy: {
          async findMany(params) {
            calls.push({ method: 'findPolicy', params });
            return next ? [next] : [];
          },
          async create({ data }) {
            calls.push({ method: 'create', data });
            next = { ...data, editVersion: 1 };
          },
          async updateMany({ where, data }) {
            calls.push({ method: 'update', where, data });
            if (state.loseCas || !next || next.editVersion !== where.editVersion) return { count: 0 };
            next = { ...next, budget: structuredClone(data.budget), editVersion: next.editVersion + data.editVersion.increment };
            return { count: 1 };
          },
          async deleteMany({ where }) {
            calls.push({ method: 'delete', where });
            if (state.loseCas || !next || next.editVersion !== where.editVersion) return { count: 0 };
            next = null;
            return { count: 1 };
          },
        },
        commerceAuditEvent: { async create({ data }) {
          calls.push({ method: 'audit', data });
          if (state.failAudit) throw Error('audit write failed');
          stagedAudits.push(data);
        } },
      };
      const outcome = await callback(tx);
      stored.policy = next;
      audits.push(...stagedAudits);
      state.commitCount++;
      return outcome;
    },
  };
  const service = loadPolicyModule('src/lib/admin/commerce-model-plan-policy.ts', {
    './commerce-model-policy-fields.ts': baseFields,
    './commerce-model-plan-policy-fields.ts': planFields,
    './commerce-model-platform-policy.ts': { CommerceModelPolicyConflict: PolicyConflict },
    './commerce-environment.ts': { resolveAdminCommerceEnvironment: () => 'DEVELOPMENT' },
  });
  const action = loadPolicyModule('src/app/actions/commerce-model-plan-policy.ts', {
    'next/cache': { revalidatePath: (path) => {
      assert.equal(path, '/billing');
      state.revalidateCount++;
    } },
    '@/lib/auth/platform-admin': { requirePlatformAdminMutation: async () => ({ role, id: 'admin-1' }) },
    '@/lib/auth/development-platform-admin': { ensureDevelopmentPlatformAdmin: async (_tx, principal) => {
      assert.equal(principal.id, 'admin-1');
      calls.push({ method: 'ensureAdmin' });
    } },
    '@/lib/admin/commerce-environment': { resolveAdminCommerceEnvironment: () => 'DEVELOPMENT' },
    '@/lib/admin/commerce-model-policy-fields': baseFields,
    '@/lib/admin/commerce-model-plan-policy-fields': planFields,
    '@/lib/admin/commerce-model-plan-policy': service,
    '@/lib/admin/commerce-model-platform-policy': { CommerceModelPolicyConflict: PolicyConflict },
    '@/lib/prisma': { prisma },
  });
  function form(extra = {}) {
    const data = new FormData();
    for (const [key, value] of Object.entries({
      planId: 'plan-1', expectedEditVersion: existing ? String(existing.editVersion) : '0',
      reason: 'Change plan execution limits', override_deadlineMs: 'on', deadlineMs: '75000',
      override_outputTokens: 'on', outputTokens: '1300', ...extra,
    })) {
      if (value !== null) data.set(key, value);
    }
    return data;
  }
  return { action, service, form, stored, audits, calls, state };
}

test('save action rejects ADMIN and SUPPORT before transaction or audit', async () => {
  for (const role of ['ADMIN', 'SUPPORT']) {
    const f = fixture({ role });
    const result = await f.action.saveLivePlanBudgetAction(f.form());
    assert.equal(result.ok, false);
    assert.match(result.message, /SUPER_ADMIN/);
    assert.equal(f.calls.length, 0);
  }
});

test('form validation reports field errors without opening a transaction', async () => {
  const f = fixture();
  const outcome = await f.action.saveLivePlanBudgetAction(f.form({ deadlineMs: '-1', reason: '', expectedEditVersion: '-2' }));
  assert.equal(outcome.ok, false);
  assert.ok(outcome.fieldErrors.deadlineMs);
  assert.ok(outcome.fieldErrors.reason);
  assert.ok(outcome.fieldErrors.expectedEditVersion);
  assert.equal(f.calls.length, 0);
});

test('save action scopes a successful update to LIVE plan and commits one audit atomically', async () => {
  const f = fixture();
  assert.deepEqual(await f.action.saveLivePlanBudgetAction(f.form()), { ok: true });
  assert.deepEqual(f.stored.policy.budget, { deadlineMs: 75000, outputTokens: 1300 });
  assert.equal(f.stored.policy.editVersion, 3);
  assert.equal(f.state.commitCount, 1);
  assert.equal(f.state.revalidateCount, 1);
  assert.equal(f.audits.length, 1);
  const update = f.calls.find(c => c.method === 'update');
  assert.equal(update.where.merchantPricingPlanId, 'plan-1');
  assert.equal(update.where.context, 'LIVE');
  assert.equal(update.where.scope, 'PRICE_PLAN');
  assert.equal(update.where.environment, 'DEVELOPMENT');
  const audit = f.audits[0];
  assert.equal(audit.actorAdminId, 'admin-1');
  assert.equal(audit.action, 'SET_LIVE_PLAN_BUDGET_OVERRIDE');
  assert.equal(audit.metadata.planId, 'plan-1');
  assert.deepEqual(audit.metadata.previousBudget, { deadlineMs: 70000, outputTokens: 1200 });
  assert.deepEqual(audit.metadata.nextBudget, { deadlineMs: 75000, outputTokens: 1300 });
});

test('omitting one override clears only that key and retains the other', async () => {
  const f = fixture();
  const result = await f.action.saveLivePlanBudgetAction(f.form({ override_deadlineMs: null, deadlineMs: null }));
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(f.stored.policy.budget, { outputTokens: 1300 });
  assert.deepEqual(f.audits[0].metadata.nextBudget, { outputTokens: 1300 });
  assert.equal(f.calls.filter(c => c.method === 'delete').length, 0);
});

test('explicitly clearing all keys deletes only plan override and retains audit identity', async () => {
  const f = fixture();
  assert.deepEqual(await f.action.saveLivePlanBudgetAction(f.form({
    override_deadlineMs: null, deadlineMs: null, override_outputTokens: null, outputTokens: null,
  })), { ok: true });
  assert.equal(f.stored.policy, null);
  assert.equal(f.audits.length, 1);
  assert.equal(f.audits[0].metadata.operation, 'CLEAR');
  assert.equal(f.audits[0].modelPolicyId, 'arch038-live-plan-development-plan-1');
});

test('initial sparse plan override creates in the selected scope with an audit event', async () => {
  const f = fixture({ existing: null });
  assert.deepEqual(await f.action.saveLivePlanBudgetAction(f.form({
    override_deadlineMs: null, deadlineMs: null,
  })), { ok: true });
  assert.equal(f.stored.policy.editVersion, 1);
  assert.deepEqual(f.stored.policy.budget, { outputTokens: 1300 });
  assert.equal(f.stored.policy.merchantPricingPlanId, 'plan-1');
  assert.equal(f.audits[0].metadata.operation, 'CREATE');
});

test('stale version and lost CAS respond with conflict and never commit', async () => {
  const f = fixture();
  const stale = await f.action.saveLivePlanBudgetAction(f.form({ expectedEditVersion: '1' }));
  assert.equal(stale.conflict, true);
  assert.equal(f.state.commitCount, 0);
  const concurrent = fixture();
  concurrent.state.loseCas = true;
  const result = await concurrent.action.saveLivePlanBudgetAction(concurrent.form());
  assert.equal(result.conflict, true);
  assert.equal(concurrent.state.commitCount, 0);
  assert.equal(concurrent.audits.length, 0);
});

test('failed audit write rolls back updated policy, edit version and revalidation', async () => {
  const f = fixture();
  f.state.failAudit = true;
  const result = await f.action.saveLivePlanBudgetAction(f.form());
  assert.equal(result.ok, false);
  assert.deepEqual(f.stored.policy.budget, { deadlineMs: 70000, outputTokens: 1200 });
  assert.equal(f.stored.policy.editVersion, 2);
  assert.equal(f.audits.length, 0);
  assert.equal(f.state.commitCount, 0);
  assert.equal(f.state.revalidateCount, 0);
});

test('unsupported policy schema and absent plan cannot silently overwrite budgets', async () => {
  const invalidSchema = fixture({ existing: { id: 'policy', budgetSchemaVersion: 2, budget: { outputTokens: 1200 }, editVersion: 2 } });
  const response = await invalidSchema.action.saveLivePlanBudgetAction(invalidSchema.form());
  assert.equal(response.ok, false);
  assert.match(response.message, /schema is unsupported/);
  assert.equal(invalidSchema.state.commitCount, 0);
  const missingPlan = fixture({ planFound: false });
  assert.match((await missingPlan.action.saveLivePlanBudgetAction(missingPlan.form())).message, /no longer exists/);
  assert.equal(missingPlan.state.commitCount, 0);
});
