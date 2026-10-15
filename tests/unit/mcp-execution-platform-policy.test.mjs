import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPolicyModule, createComponentHarness, findElement, elementText } from './helpers/commerce-model-policy-module-harness.mjs';

const prismaTypes = {
  Prisma: { DbNull: 'DbNull', TransactionIsolationLevel: { Serializable: 'Serializable' },
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {} },
};
const policy = loadPolicyModule('src/lib/admin/mcp-execution-policy.ts', { '@prisma/client': prismaTypes });
const VALID = { toolDeadlineMs: 10000, providerResponseTimeoutMs: 10000, maxProviderRequests: 12, maxResponseBytes: 262144 };
const form = (options = {}) => {
  const f = new FormData();
  for (const [key, value] of Object.entries({ expectedVersion: '4', environment: 'DEVELOPMENT', operation: 'save',
    reason: 'Change test limits', ...VALID, ...options })) f.set(key, String(value));
  return f;
};
function fixture({ role = 'SUPER_ADMIN', missing = false, environments } = {}) {
  let stored = missing ? null : { id: 'default', version: 4, mcpExecutionPolicy: { schemaVersion: 1,
    environments: environments ?? { DEVELOPMENT: { ...VALID }, PRODUCTION: { ...VALID } } } };
  const audits = [];
  let commits = 0;
  let casLoss = false;
  let auditError = false;
  const prisma = {
    platformAdmin: { findFirst: async () => ({ id: 'staff' }) },
    async $transaction(callback, options) {
      assert.equal(options.isolationLevel, 'Serializable');
      let candidate = structuredClone(stored);
      let events = [];
      const tx = {
        platformBillingPolicy: {
          findUnique: async () => candidate,
          updateMany: async ({ where, data }) => {
            if (casLoss || candidate?.version !== where.version) return { count: 0 };
            candidate = { ...candidate, version: candidate.version + 1,
              mcpExecutionPolicy: data.mcpExecutionPolicy === 'DbNull' ? null : data.mcpExecutionPolicy };
            return { count: 1 };
          },
        },
        billingAuditEvent: { create: async ({ data }) => {
          if (auditError) throw new Error('audit failed');
          events.push(data);
        } },
      };
      const result = await callback(tx);
      stored = candidate;
      audits.push(...events);
      commits++;
      return result;
    },
  };
  let refresh = 0;
  const action = loadPolicyModule('src/app/actions/mcp-execution-policy.ts', {
    '@prisma/client': prismaTypes,
    'next/cache': { revalidatePath: () => { refresh++; } },
    '@/lib/auth/platform-admin': { requirePlatformAdminMutation: async () => ({ role, id: 'staff', developmentBypass: false }) },
    '@/lib/prisma': { prisma },
    '@/lib/admin/mcp-execution-policy': policy,
  });
  return {
    policy, action, form, current: () => stored,
    audits, commits: () => commits, refresh: () => refresh,
    loseCas: () => { casLoss = true; },
    breakAudit: () => { auditError = true; },
  };
}

test('strict JSONB parsing retains each configured environment and rejects malformed entries', () => {
  assert.deepEqual(policy.readMcpExecutionPolicy(null), { schemaVersion: 1, environments: {} });
  assert.equal(policy.readMcpExecutionPolicy({ schemaVersion: 1, environments: { LOCAL: VALID } }).environments.LOCAL.maxProviderRequests, 12);
  assert.deepEqual(policy.readMcpExecutionPolicy({ schemaVersion: 1, environments: {
    DEVELOPMENT: null, PRODUCTION: VALID,
  } }).environments, { PRODUCTION: VALID });
  assert.deepEqual(policy.readMcpExecutionPolicy({ schemaVersion: 1, environments: {
    PRODUCTION: VALID,
  } }).environments, { PRODUCTION: VALID });
  assert.throws(() => policy.readMcpExecutionPolicy({ schemaVersion: 1, environments: { INVALID: null } }), /unknown environment/);
  assert.throws(() => policy.readMcpExecutionPolicy({ schemaVersion: 2, environments: {} }), /Unsupported/);
  assert.throws(() => policy.readMcpExecutionPolicy({ schemaVersion: 1, environments: { INVALID: VALID } }), /unknown environment/);
  assert.throws(() => policy.readMcpExecutionPolicy({ schemaVersion: 1, environments: { LOCAL: { ...VALID, providerResponseTimeoutMs: 20000 } } }), /must not exceed/);
});
test('null and absent entries render as unconfigured, with the clear action disabled', () => {
  const componentHarness = createComponentHarness();
  const { McpExecutionPolicyControls } = loadPolicyModule(
    'src/components/admin/mcp-execution-policy/mcp-execution-policy-controls.tsx',
    {
      react: componentHarness.react,
      'react/jsx-runtime': componentHarness.jsxRuntime,
      'next/navigation': { useRouter: () => ({ refresh() {} }) },
      '@/app/actions/mcp-execution-policy': { mutateMcpExecutionPolicyAction: async () => ({ ok: true }) },
      '@/lib/admin/mcp-execution-policy': policy,
      './mcp-execution-policy-fields': { McpExecutionPolicyFields: () => null },
    },
  );
  for (const rawEnvironments of [
    { DEVELOPMENT: null, PRODUCTION: VALID },
    { PRODUCTION: VALID },
  ]) {
    const document = policy.readMcpExecutionPolicy({ schemaVersion: 1, environments: rawEnvironments });
    const tree = componentHarness.render(McpExecutionPolicyControls, { version: 4, document, error: null });
    const status = findElement(tree, (node) => node.props?.role === 'status');
    assert.match(elementText(status), /Not configured — saving will provision this environment/);
    const clear = findElement(tree, (node) => node.type === 'button' && node.props?.value === 'clear');
    assert.equal(clear.props.disabled, true);
  }
});

test('saving a null environment provisions it without modifying other environments', async () => {
  const f = fixture({ environments: { DEVELOPMENT: null, PRODUCTION: { ...VALID }, LOCAL: null } });
  assert.deepEqual(await f.action.mutateMcpExecutionPolicyAction(form({ maxProviderRequests: 15 })), { ok: true });
  assert.equal(f.current().version, 5);
  assert.equal(f.current().mcpExecutionPolicy.environments.DEVELOPMENT.maxProviderRequests, 15);
  assert.deepEqual(f.current().mcpExecutionPolicy.environments.PRODUCTION, VALID);
  assert.equal(Object.hasOwn(f.current().mcpExecutionPolicy.environments, 'LOCAL'), false);
  assert.equal(f.audits[0].beforeValue.limits, null);
  assert.equal(f.audits[0].afterValue.limits.maxProviderRequests, 15);
});

test('bounded numeric fields, audit reason and selected environment validated before transaction', () => {
  assert.throws(() => policy.parseMcpPolicyEdit(form({ providerResponseTimeoutMs: 10001 })), /must not exceed/);
  assert.throws(() => policy.parseMcpPolicyEdit(form({ maxProviderRequests: -2 })), /whole number/);
  assert.throws(() => policy.parseMcpPolicyEdit(form({ maxResponseBytes: 999999999 })), /between 1/);
  assert.throws(() => policy.parseMcpPolicyEdit(form({ environment: 'OTHER' })), /Commerce environment/);
  assert.throws(() => policy.parseMcpPolicyEdit(form({ reason: '' })), /audit reason/);
  assert.throws(() => policy.parseMcpPolicyEdit(form({ expectedVersion: '-1' })), /version/);
});
test('save is SUPER_ADMIN only, audited, and does not affect the other environment', async () => {
  const forbidden = fixture({ role: 'ADMIN' });
  assert.equal((await forbidden.action.mutateMcpExecutionPolicyAction(form())).ok, false);
  assert.equal(forbidden.commits(), 0);
  const f = fixture();
  const updated = await f.action.mutateMcpExecutionPolicyAction(form({ maxProviderRequests: 15 }));
  assert.deepEqual(updated, { ok: true });
  assert.equal(f.current().version, 5);
  assert.equal(f.current().mcpExecutionPolicy.environments.DEVELOPMENT.maxProviderRequests, 15);
  assert.equal(f.current().mcpExecutionPolicy.environments.PRODUCTION.maxProviderRequests, 12);
  assert.equal(f.audits.length, 1);
  assert.equal(f.audits[0].action, 'PLATFORM_POLICY_CHANGED');
  assert.equal(f.audits[0].afterValue.version, 5);
  assert.equal(f.refresh(), 1);
});
test('clear increments version and stale create-clear-replay is rejected', async () => {
  const f = fixture();
  assert.deepEqual(await f.action.mutateMcpExecutionPolicyAction(form({ operation: 'clear' })), { ok: true });
  assert.equal(f.current().version, 5);
  assert.equal(f.current().mcpExecutionPolicy.environments.DEVELOPMENT, undefined);
  assert.equal(f.current().mcpExecutionPolicy.environments.PRODUCTION.maxProviderRequests, 12);
  const stale = await f.action.mutateMcpExecutionPolicyAction(form());
  assert.equal(stale.ok, false);
  assert.equal(stale.conflict, true);
  assert.equal(f.audits.length, 1);
});
test('concurrent CAS loss, missing row, and audit failure never commit a partial mutation', async () => {
  const lost = fixture(); lost.loseCas();
  const response = await lost.action.mutateMcpExecutionPolicyAction(form());
  assert.equal(response.conflict, true);
  assert.equal(lost.commits(), 0);
  const missing = fixture({ missing: true });
  assert.equal((await missing.action.mutateMcpExecutionPolicyAction(form())).ok, false);
  assert.equal(missing.commits(), 0);
  const audit = fixture(); audit.breakAudit();
  assert.equal((await audit.action.mutateMcpExecutionPolicyAction(form())).ok, false);
  assert.equal(audit.current().version, 4);
  assert.equal(audit.audits.length, 0);
});

test('concurrent billing form cannot overwrite MCP version; fresh billing edit preserves JSONB', async () => {
  const row = { id: 'default', version: 9, mcpExecutionPolicy: { schemaVersion: 1, environments: { LOCAL: VALID } } };
  const audits = [];
  let writes = 0;
  const prisma = {
    platformBillingPolicy: {},
    async $transaction(callback, options) {
      assert.equal(options.isolationLevel, 'Serializable');
      const tx = {
        platformBillingPolicy: {
          findUnique: async () => ({ ...row }),
          updateMany: async ({ where, data }) => {
            if (where.version !== row.version) return { count: 0 };
            row.version++;
            Object.assign(row, { ...data, version: row.version });
            writes++;
            return { count: 1 };
          },
          findUniqueOrThrow: async () => ({ ...row }),
        },
        billingAuditEvent: { create: async ({ data }) => { audits.push(data); } },
      };
      return callback(tx);
    },
  };
  const action = loadPolicyModule('src/app/actions/billing-controls.ts', {
    '@prisma/client': { ...prismaTypes, BillingAuditAction: { PLATFORM_POLICY_CHANGED: 'PLATFORM_POLICY_CHANGED' } },
    'next/cache': { revalidatePath: () => {} },
    '@/lib/auth/platform-admin': { requirePlatformAdminMutation: async () => ({ id: 'staff', role: 'SUPER_ADMIN', developmentBypass: false }) },
    '@/lib/prisma': { prisma },
    '@/lib/admin/billing-control-validation': {
      parsePlatformBillingPolicyForm: (f) => ({
        expectedVersion: Number(f.get('expectedVersion')), reason: 'Billing update',
        globalPauseNewRecoveries: false, globalPauseAutomatedWhatsapp: false,
        absoluteOutboundHardLimit: 2000, defaultWarningPercent: 80,
        lifetimeFreeRecoveryAllowance: 5, defaultOutboundSoftLimit: 1000,
        defaultOutboundHardLimit: 2000, terminalMessageReservedSlots: 1,
        whatsappRecipientSuppressionDays: 7, minimumUpgradePremiumBps: 2000,
      }),
      parseShopBillingOverrideForm: () => { throw Error('unexpected'); },
      shopBillingOverrideRequiresSuperAdmin: () => false,
    },
  });
  const staleForm = new FormData(); staleForm.set('expectedVersion', '8');
  assert.equal((await action.mutatePlatformBillingPolicyAction(staleForm)).ok, false);
  assert.equal(writes, 0);
  const current = new FormData(); current.set('expectedVersion', '9');
  assert.deepEqual(await action.mutatePlatformBillingPolicyAction(current), { ok: true });
  assert.equal(row.version, 10);
  assert.deepEqual(row.mcpExecutionPolicy.environments.LOCAL, VALID);
  assert.equal(audits.length, 1);
});
