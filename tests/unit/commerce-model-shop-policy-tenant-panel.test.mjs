import assert from 'node:assert/strict';
import test from 'node:test';
import { createComponentHarness, findElement, elementText, loadPolicyModule } from './helpers/commerce-model-policy-module-harness.mjs';

function setup(canEditCommercePolicy, tab = 'admin') {
  const h = createComponentHarness();
  const panel = loadPolicyModule('src/components/admin/tenant-detail-panel.tsx', {
    'react/jsx-runtime': h.jsxRuntime,
    'next/link': { __esModule: true, default: (props) => h.jsxRuntime.jsx('a', props) },
    '@/lib/admin/query': { withParamUpdates: (pathname, params, diff) => `${pathname}?tenant=shop-1&tab=${diff.tab ?? 'admin'}` },
    './recovery-logs': { RecoveryLogs: () => h.jsxRuntime.jsx('div', { children: 'Existing recovery logs' }) },
    './tenant-administration': { TenantAdministration: () => h.jsxRuntime.jsx('div', { children: 'Existing tenant overview' }) },
    './tenant-billing': { TenantBillingView: () => h.jsxRuntime.jsx('div', { children: 'Existing tenant billing' }) },
    './tenant-recovery-settings': { TenantRecoverySettings: () => h.jsxRuntime.jsx('div', { children: 'Existing recovery settings' }) },
    './commerce-model-policy/live-shop-policy': { LiveShopPolicyControls: (props) => h.jsxRuntime.jsx('section', { ...props, 'data-testid': 'merchant-policy' }) },
    '@/i18n': { adminI18n: { t: (key) => key } },
  });
  const props = { tenant: { id: 'shop-1' }, tab, canEditCommercePolicy,
    shopPolicyDashboard: { policy: { shopId: 'shop-1', editVersion: 1 }, history: [], hasMore: false },
    shopPolicyHistoryPage: 0, shopPolicyScope: 'server-issued-token', customers: null, customerSearch: '', selectedCustomer: null, recoveries: null,
    params: { tenant: 'shop-1', tab }, returnTo: '/', billing: null, billingView: 'overview',
    billingPacks: null, billingEvents: null, selectedPurchase: null, selectedEvent: null };
  return { render: () => h.render(panel.TenantDetailPanel, props) };
}

test('SUPER_ADMIN sees CommerceAgent tab and selected Shop-specific editor', () => {
  const root = setup(true, 'commerce').render();
  const link = findElement(root, n => n.type === 'a' && elementText(n) === 'CommerceAgent');
  assert.equal(link?.props.href, '/?tenant=shop-1&tab=commerce');
  assert.equal(findElement(root, n => n.props['data-testid'] === 'merchant-policy')?.props.policy.shopId, 'shop-1');
});
test('ADMIN/SUPPORT views have the same existing tabs and no CommerceAgent link', () => {
  const root = setup(false).render();
  assert.match(elementText(root), /tenant\.overview/);
  assert.match(elementText(root), /tenant\.recoverySettings/);
  assert.match(elementText(root), /tenant\.billing/);
  assert.equal(findElement(root, n => n.type === 'a' && elementText(n) === 'CommerceAgent'), undefined);
  assert.equal(findElement(root, n => n.props['data-testid'] === 'merchant-policy'), undefined);
});

test('selected tenant scope is forwarded to the Merchant editor, not derived from a form', () => {
  const root = setup(true, 'commerce').render();
  const editor = findElement(root, n => n.props['data-testid'] === 'merchant-policy');
  assert.equal(editor.props.shopPolicyScope, 'server-issued-token');
});
