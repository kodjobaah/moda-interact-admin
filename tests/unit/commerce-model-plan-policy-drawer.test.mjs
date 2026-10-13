import assert from 'node:assert/strict';
import test from 'node:test';
import { createComponentHarness, findElement, elementText, loadPolicyModule } from './helpers/commerce-model-policy-module-harness.mjs';

function setup() {
  const h = createComponentHarness();
  const planBuilderProps = [];
  const moduleRecord = loadPolicyModule('src/components/admin/billing-drawers.tsx', {
    'react/jsx-runtime': h.jsxRuntime,
    '@/i18n': { adminBillingReportStateLabel: value => value, adminI18n: { t: value => value } },
    '@/lib/admin/query': { withParamUpdates: (path, params, updates) => {
      const selected = { ...params, ...updates };
      return `${path}?${Object.entries(selected).filter(([, v]) => v !== null).map(([k, v]) => `${k}=${v}`).join('&')}`;
    } },
    './admin-detail-drawer': { AdminDetailDrawer: ({ children }) => h.jsxRuntime.jsx('admin-drawer', { children }) },
    './billing-event-retry-control': { BillingEventRetryControl: () => null },
    './merchant/merchant-pricing-plan-builder': { MerchantPricingPlanBuilder: (props) => {
      planBuilderProps.push(props);
      return h.jsxRuntime.jsx('pricing-builder', { 'data-testid': 'pricing-builder' });
    } },
  });
  return { h, Drawer: moduleRecord.MerchantPricingPlanDrawer, planBuilderProps };
}

test('editing an existing plan passes policy into the wizard instead of rendering it above the tabs', () => {
  const f = setup();
  const plan = { id: 'plan-1', displayName: 'Growth', commerceModelId: 'model-1',
    translations: [{ locale: 'fr', description: 'Croissance' }], recurringAmountMinor: 2500 };
  const cataloguePlans = [plan];
  const featureCatalogue = [{ id: 'feature-1' }];
  const merchantKnowledgeSourceTypes = [{ value: 'URL', label: 'URL' }];
  const commerceModelOptions = [{ id: 'model-1', displayName: 'Model' }];
  const policy = { planId: 'plan-1', environment: 'DEVELOPMENT', editVersion: 3,
    budget: { deadlineMs: 70000 }, effective: { deadlineMs: 70000, outputTokens: 800 } };
  const props = { plan, cataloguePlans, featureCatalogue, merchantKnowledgeSourceTypes,
    commerceModelOptions, minimumUpgradePremiumBps: 2400, planPolicy: policy,
    planPolicyHistory: [], planPolicyHistoryPage: 1, planPolicyHasMore: true,
    canEditPlanPolicy: true,
    params: { view: 'plans', section: 'pricing', planId: 'plan-1' } };
  const tree = f.h.render(f.Drawer, props);
  assert.equal(findElement(tree, n => n.type === 'commerceagent-policy'), undefined);
  assert.ok(findElement(tree, n => n.type === 'pricing-builder'));
  assert.equal(f.planBuilderProps.length, 1);
  assert.equal(f.planBuilderProps[0].planPolicy, policy);
  assert.equal(f.planBuilderProps[0].plan, plan);
  assert.equal(f.planBuilderProps[0].canEditPlanPolicy, true);
  assert.equal(f.planBuilderProps[0].planPolicyHistoryPage, 1);
  assert.match(f.planBuilderProps[0].policyHistoryBaseHref, /planId=plan-1/);
  assert.deepEqual(f.planBuilderProps[0].cataloguePlans, cataloguePlans);
  assert.deepEqual(f.planBuilderProps[0].featureCatalogue, featureCatalogue);
});

test('registering a new plan passes Platform defaults into the wizard without a separate policy form', () => {
  const f = setup();
  const tree = f.h.render(f.Drawer, { register: true, params: { view: 'plans', section: 'pricing' },
    commerceModelOptions: [{ id: 'model-1' }], createPlanPlatformPolicy: { deadlineMs: 60000, outputTokens: 800 } });
  assert.ok(findElement(tree, n => n.type === 'pricing-builder'));
  assert.equal(findElement(tree, n => n.type === 'commerceagent-policy'), undefined);
  assert.deepEqual(f.planBuilderProps[0].createPlanPlatformPolicy, { deadlineMs: 60000, outputTokens: 800 });
  assert.deepEqual(f.planBuilderProps[0].commerceModelOptions, [{ id: 'model-1' }]);
});
