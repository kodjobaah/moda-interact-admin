import assert from 'node:assert/strict';
import test from 'node:test';
import { createComponentHarness, findElement, elementText, loadPolicyModule } from './helpers/commerce-model-policy-module-harness.mjs';

function setup(step, plan = undefined) {
  const h = createComponentHarness();
  const draft = {
    step, name: 'Test', handle: 'test', planKind: 'PAID_METERED', isActive: false,
    featured: false, commerceModelId: '', maxKnowledgeSources: '1', maxContentUnitsPerSource: '1000',
    allowedSourceTypeKeys: [], credits: 0, recoveryUsageEventHandle: '', currency: 'GBP', recurring: '10',
    description: 'Description', reason: 'Plan reason', economicsOverrideEnabled: false,
    economicsOverrideReason: '', events: [], highlights: [], isEditing: Boolean(plan),
  };
  const controller = {
    draft,
    actions: { setStep: (next) => { draft.step = next; } },
    selectors: {
      canNavigateTo: () => true, canSubmit: true, saveBlockers: [],
      formFields: { intent: plan ? 'update' : 'create', payload: '{}', translationRunId: '', economicsOverrideRequested: 'false', economicsOverrideReason: '' },
    },
  };
  const platform = { deadlineMs: 60000, outputTokens: 800 };
  const policyStep = loadPolicyModule('src/components/admin/merchant/merchant-pricing-plan-builder/commerce-agent-policy-step.tsx', {
    'react/jsx-runtime': h.jsxRuntime,
    '@/components/admin/commerce-model-policy/budget-policy-fields': { BudgetPolicyFields: () => h.jsxRuntime.jsx('budget-fields', {}) },
    '@/lib/admin/commerce-model-policy-fields': { LIVE_BACKGROUND_DEADLINE_ENVELOPE_MS: 90000 },
  });
  const moduleRecord = loadPolicyModule('src/components/admin/merchant/merchant-pricing-plan-builder.tsx', {
    react: h.react,
    'react/jsx-runtime': h.jsxRuntime,
    '@/app/actions/merchant-pricing-plan': { mutateMerchantPricingPlanAction: () => undefined },
    './merchant-pricing-plan-builder/use-merchant-pricing-plan-draft': { useMerchantPricingPlanDraft: () => controller },
    '@/components/admin/commerce-model-policy/live-plan-policy': { LivePlanPolicyControls: () => h.jsxRuntime.jsx('policy-form', { children: h.jsxRuntime.jsx('form', {}) }) },
    './merchant-pricing-plan-builder/commerce-agent-policy-step': policyStep,
    ...Object.fromEntries([
      './merchant-pricing-plan-builder/plan-step',
      './merchant-pricing-plan-builder/catalogue-placement-step',
      './merchant-pricing-plan-builder/shopify-pricing-step',
      './merchant-pricing-plan-builder/usage-events-step',
      './merchant-pricing-plan-builder/merchant-content-step',
      './merchant-pricing-plan-builder/portfolio-economics-step',
      './merchant-pricing-plan-builder/translations-review-step',
    ].map((name) => [name, {
      [({
        './merchant-pricing-plan-builder/plan-step': 'PlanStep',
        './merchant-pricing-plan-builder/catalogue-placement-step': 'CataloguePlacementStep',
        './merchant-pricing-plan-builder/shopify-pricing-step': 'ShopifyPricingStep',
        './merchant-pricing-plan-builder/usage-events-step': 'UsageEventsStep',
        './merchant-pricing-plan-builder/merchant-content-step': 'MerchantContentStep',
        './merchant-pricing-plan-builder/portfolio-economics-step': 'PortfolioEconomicsStep',
        './merchant-pricing-plan-builder/translations-review-step': 'TranslationsReviewStep',
      })[name]]: (props) => h.jsxRuntime.jsx('wizard-step', { step: name, ...props }),
    }])),
  });
  const props = {
    plan,
    createPlanPlatformPolicy: platform,
    planPolicy: plan ? {
      planId: plan.id, editVersion: 1, environment: 'DEVELOPMENT',
      budget: {}, effective: platform, sources: { deadlineMs: 'PLATFORM', outputTokens: 'PLATFORM' },
    } : undefined,
  };
  return { h, controller, platform, render: () => h.render(moduleRecord.MerchantPricingPlanBuilder, props) };
}

const all = (root, predicate) => {
  const result = [];
  const visit = (value) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== 'object' || !('type' in value)) return;
    if (predicate(value)) result.push(value);
    visit(value.props.children);
  };
  visit(root);
  return result;
};

test('eight wizard tabs include CommerceAgent Policy before Translations & review', () => {
  const tree = setup(0).render();
  const tabs = all(tree, node => node.type === 'nav').flatMap(nav => all(nav, node => node.type === 'button'));
  assert.equal(tabs.length, 8);
  assert.match(elementText(tabs[6]), /7\s+CommerceAgent Policy/);
  assert.match(elementText(tabs[7]), /8\s+Translations & review/);
});

test('new plan configures policy inside the wizard and retains policy draft for final submit', () => {
  const tree = setup(6).render();
  assert.ok(findElement(tree, node => node.type === 'budget-fields'));
  assert.equal(all(tree, node => node.type === 'form').length, 1);
  const hidden = findElement(tree, node => node.type === 'input' && node.props.name === 'commercePolicyDraft');
  assert.ok(hidden);
  assert.deepEqual(JSON.parse(hidden.props.value), { budget: {}, reason: '' });
  assert.equal(findElement(tree, node => node.type === 'policy-form'), undefined);
});

test('existing plan policy is its own wizard tab and never nests a policy form in plan form', () => {
  const tree = setup(6, { id: 'plan-1' }).render();
  assert.ok(findElement(tree, node => node.type === 'policy-form'));
  assert.equal(all(tree, node => node.type === 'form').length, 1);
  assert.equal(findElement(tree, node => node.type === 'input' && node.props.name === 'payload'), undefined);
});

test('Translations & review is final eighth step and includes the policy summary', () => {
  const tree = setup(7).render();
  const review = findElement(tree, node => node.type === 'wizard-step' && node.props.step === 7);
  assert.equal(review.props.step, 7); // overridden by the current step prop
  assert.match(review.props.planPolicySummary, /60000 ms \(Platform\)/);
  assert.match(review.props.planPolicySummary, /800 tokens \(Platform\)/);
  assert.equal(findElement(tree, node => node.type === 'button' && elementText(node) === 'Next'), undefined);
});
