import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createComponentHarness,
  findElement,
  loadPolicyModule,
} from './helpers/commerce-model-policy-module-harness.mjs';

// Exercise the real async Platform Policy page, not an extracted role predicate.
// Non-SUPER_ADMIN platform admins must retain the existing billing page without
// invoking the SUPER_ADMIN-only LIVE policy or audit-history read.
function setup(role, { billingPolicy = { id: 'billing-policy' }, commerceHistoryPage = '1', dashboardError } = {}) {
  const h = createComponentHarness();
  const calls = { billing: 0, commerce: [], recovery: [], pageAuth: 0 };
  const dashboard = {
    policy: { id: 'live-platform', editVersion: 3 },
    history: [{ id: 'change-1' }],
    hasMore: true,
  };
  const tabs = loadPolicyModule('src/components/admin/platform-policy-tabs.tsx', { react: h.react, 'react/jsx-runtime': h.jsxRuntime });
  const recoveryContract = { key: 'commerce.recoveryExecution' };
  const recovery = { snapshot: { version: 1 }, history: { entries: [] } };
  const pageModule = loadPolicyModule('src/app/(protected)/system-controls/platform-policy/page.tsx', {
    '@/components/admin/platform-policy-tabs': tabs,
    '@/components/admin/platform-configuration/configuration-editor': {
      ConfigurationEditor: (props) => h.jsxRuntime.jsx('section', { 'data-testid': 'recovery-execution-policy', ...props }),
    },
    '@/components/admin/platform-configuration/configuration-history': {
      ConfigurationHistoryPanel: (props) => h.jsxRuntime.jsx('section', { 'data-testid': 'recovery-execution-history', ...props }),
    },
    '@/lib/admin/platform-configuration/contracts': {
      PLATFORM_POLICY_REGISTRY: new Map([[recoveryContract.key, recoveryContract]]),
      publicContracts: (registry) => [...registry.values()],
    },
    '@/lib/admin/platform-configuration/service': {
      configurationPageData: async (key) => {
        calls.recovery.push(key);
        if (role !== 'SUPER_ADMIN') throw new Error('Forbidden recovery execution read');
        return recovery;
      },
    },
    'react/jsx-runtime': h.jsxRuntime,
    '@/components/admin/admin-shell': {
      AdminShell: ({ children }) => h.jsxRuntime.jsx('main', { children }),
    },
    '@/components/admin/billing-controls': {
      PlatformPolicyControls: ({ policy }) => h.jsxRuntime.jsx('section', {
        'data-testid': 'billing-policy', policy,
      }),
    },
    '@/components/admin/mcp-execution-policy/mcp-execution-policy-controls': {
      McpExecutionPolicyControls: (props) => h.jsxRuntime.jsx('section', { 'data-testid': 'mcp-platform-policy', ...props }),
    },
    '@/lib/admin/mcp-execution-policy': {
      readMcpExecutionPolicy: (value) => value ?? { schemaVersion: 1, environments: {} },
    },
    '@/components/admin/commerce-model-policy/live-platform-policy': {
      LivePlatformPolicyControls: (props) => h.jsxRuntime.jsx('section', {
        'data-testid': 'live-platform-policy', ...props,
      }),
    },
    '@/lib/admin/billing-controls': {
      getPlatformBillingPolicy: async () => { calls.billing++; return billingPolicy; },
    },
    '@/lib/admin/commerce-model-platform-policy': {
      getLivePlatformPolicyDashboard: async (page) => {
        calls.commerce.push(page);
        if (dashboardError) throw dashboardError;
        return dashboard;
      },
    },
    '@/lib/auth/platform-admin': {
      requirePlatformAdminPage: async () => { calls.pageAuth++; return { id: 'staff', role }; },
    },
  });
  return {
    calls, dashboard,
    async render() {
      const page = await pageModule.default({ searchParams: Promise.resolve({ commerceHistoryPage }) });
      return h.render(() => page, {});
    },
  };
}
const byTestId = (root, testId) => findElement(root, (node) => node.props['data-testid'] === testId);

for (const role of ['ADMIN', 'SUPPORT']) {
  test(`${role} retains Platform Billing controls without requesting LIVE policy or audit history`, async () => {
    const context = setup(role, { dashboardError: new Error('Forbidden LIVE budget read') });
    const root = await context.render();
    assert.equal(context.calls.pageAuth, 1);
    assert.equal(context.calls.billing, 1);
    assert.deepEqual(context.calls.commerce, []);
    assert.deepEqual(context.calls.recovery, []);
    assert.equal(byTestId(root, 'recovery-execution-policy'), undefined);
    assert.equal(byTestId(root, 'recovery-execution-history'), undefined);
    assert.deepEqual(byTestId(root, 'billing-policy')?.props.policy, { id: 'billing-policy' });
    assert.equal(byTestId(root, 'live-platform-policy'), undefined);
    assert.equal(byTestId(root, 'mcp-platform-policy'), undefined);
  });
}

test('SUPER_ADMIN can see billing plus LIVE policy/history, with correct pagination', async () => {
  const context = setup('SUPER_ADMIN', { commerceHistoryPage: '4' });
  const root = await context.render();
  assert.equal(context.calls.billing, 1);
  assert.deepEqual(context.calls.commerce, [4]);
  assert.deepEqual(context.calls.recovery, ['commerce.recoveryExecution']);
  assert.equal(byTestId(root, 'recovery-execution-policy')?.props.contract.key, 'commerce.recoveryExecution');
  assert.equal(byTestId(root, 'recovery-execution-history')?.props.keyName, 'commerce.recoveryExecution');
  assert.ok(byTestId(root, 'billing-policy'));
  assert.ok(byTestId(root, 'mcp-platform-policy'));
  const livePolicy = byTestId(root, 'live-platform-policy');
  assert.equal(livePolicy?.props.policy, context.dashboard.policy);
  assert.equal(livePolicy?.props.history, context.dashboard.history);
  assert.equal(livePolicy?.props.page, 4);
  assert.equal(livePolicy?.props.hasMore, true);
  assert.equal(livePolicy?.props.canEdit, true);
});

test('SUPER_ADMIN handles absent LIVE default without hiding billing controls', async () => {
  const context = setup('SUPER_ADMIN');
  context.dashboard.policy = null;
  const root = await context.render();
  assert.ok(byTestId(root, 'billing-policy'));
  assert.equal(byTestId(root, 'live-platform-policy')?.props.policy, null);
});
