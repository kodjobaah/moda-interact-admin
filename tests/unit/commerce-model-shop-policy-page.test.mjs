import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPolicyModule, createComponentHarness, findElement } from './helpers/commerce-model-policy-module-harness.mjs';

function setup(role) {
  const h = createComponentHarness();
  const calls = [];
  const pageModule = loadPolicyModule('src/app/(protected)/page.tsx', {
    'react/jsx-runtime': h.jsxRuntime,
    '@/components/admin/admin-shell': { AdminShell: ({ children }) => h.jsxRuntime.jsx('main', { children }) },
    '@/components/admin/search-input': { SearchInput: () => null },
    '@/components/admin/kpi-card': { KpiCard: () => null },
    '@/components/admin/recovery-drawer': { RecoveryDrawer: () => null },
    '@/components/admin/tenant-table': { TenantTable: (p) => h.jsxRuntime.jsx('section', { ...p, 'data-testid': 'table' }) },
    '@/lib/auth/platform-admin': { requirePlatformAdminPage: async () => ({ id: 'admin', role }) },
    '@/lib/admin/data': {
      getTenantDirectory: async () => ({ kpis: { activeTenants: 1, activeRecoveries: 0, pendingRecoveries: 0, recoveredCheckouts: 0, recoveryConversations: 0, recoveryMessages: 0 }, tenants: { items: [] } }),
      getTenantDetail: async (id) => ({ id }),
    },
    '@/lib/admin/billing': {},
    '@/lib/admin/commerce-model-policy-fields': { canEditLiveCommerceBudget: (role) => role === 'SUPER_ADMIN' },
    '@/lib/admin/commerce-model-shop-policy-scope': { issueLiveShopPolicyScope: (shopId, adminId) => `scope:${shopId}:${adminId}` },
    '@/lib/admin/commerce-model-shop-policy': { getLiveShopPolicyDashboard: async (id, page) => {
      calls.push([id, page]);
      return { policy: { shopId: id }, history: [], hasMore: false };
    } },
    '@/i18n': { adminI18n: { t: (key) => key, formatNumber: String } },
    '@/lib/admin/query': {
      cleanSearch: (v) => v ?? '', firstParam: (v) => v,
      paramsToRecord: (v) => v, positiveInt: (v) => Math.max(1, Number(v) || 1), withParamUpdates: () => '/',
    },
  });
  return { calls, async render() {
    const result = await pageModule.default({ searchParams: Promise.resolve({ tenant: 'shop-1', tab: 'commerce', commerceShopHistoryPage: '2' }) });
    return findElement(h.render(() => result, {}), (n) => n.props['data-testid'] === 'table');
  } };
}
for (const role of ['ADMIN', 'SUPPORT']) {
  test(`${role} can open Tenant Directory without a privileged LIVE policy read`, async () => {
    const f = setup(role), table = await f.render();
    assert.equal(table.props.tab, 'admin');
    assert.deepEqual(f.calls, []);
  });
}
test('SUPER_ADMIN CommerceAgent tab requests selected Shop LIVE dashboard only', async () => {
  const f = setup('SUPER_ADMIN'), table = await f.render();
  assert.equal(table.props.tab, 'commerce');
  assert.deepEqual(f.calls, [['shop-1', 1]]);
});

test('page issues Shop scope from the server-resolved Tenant and current Admin', async () => {
  const f = setup('SUPER_ADMIN'), table = await f.render();
  assert.equal(table.props.shopPolicyScope, 'scope:shop-1:admin');
});
