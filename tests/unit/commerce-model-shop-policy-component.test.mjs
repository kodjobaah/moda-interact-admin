import assert from 'node:assert/strict';
import test from 'node:test';
import { createComponentHarness, findElement, elementText, loadPolicyModule } from './helpers/commerce-model-policy-module-harness.mjs';

const fields = loadPolicyModule('src/lib/admin/commerce-model-policy-fields.ts', {});
const policy = {
  shopId: 'shop-1', environment: 'DEVELOPMENT', editVersion: 2,
  budget: { outputTokens: 1500 }, platformBudget: { deadlineMs: 60000, outputTokens: 800 },
  planBudget: { deadlineMs: 80000 }, effective: { deadlineMs: 80000, outputTokens: 1500 },
  sources: { deadlineMs: 'PRICE_PLAN', outputTokens: 'MERCHANT' },
  currentPlan: { state: 'RESOLVED', message: 'Matched.', plan: { id: 'plan-1', handle: 'growth', name: 'Growth' } },
};
const history = [{ id: 'audit-1', createdAt: '2026-10-13T12:00:00Z', actor: 'Administrator',
  reason: 'Override changed', previousBudget: { outputTokens: 1000 }, nextBudget: { outputTokens: 1500 },
  previousEditVersion: 1, nextEditVersion: 2 }];
function setup(overrides = {}) {
  const h = createComponentHarness();
  const called = [], refreshed = [];
  let complete;
  const component = loadPolicyModule('src/components/admin/commerce-model-policy/live-shop-policy.tsx', {
    'react': h.react,
    'react/jsx-runtime': h.jsxRuntime,
    'next/link': { __esModule: true, default: (props) => h.jsxRuntime.jsx('a', props) },
    'next/navigation': { useRouter: () => ({ refresh: () => refreshed.push('refresh') }) },
    '@/app/actions/commerce-model-shop-policy': { saveLiveShopBudgetAction: (form) => {
      called.push(form);
      return new Promise(resolve => { complete = resolve; });
    } },
    './budget-policy-fields': { BudgetPolicyFields: loadPolicyModule('src/components/admin/commerce-model-policy/budget-policy-fields.tsx', {
      'react/jsx-runtime': h.jsxRuntime,
      '@/lib/admin/commerce-model-policy-fields': fields,
    }).BudgetPolicyFields },
  }, { FormData: class { constructor(form) { this.form = form; } } });
  const props = { policy, history: [], page: 0, hasMore: false, historyBaseHref: '/?tenant=shop-1&tab=commerce', shopPolicyScope: 'signed-shop-1', ...overrides };
  return { called, refreshed, complete: (result) => complete(result), render: () => h.render(component.LiveShopPolicyControls, props) };
}
const find = (node, predicate) => findElement(node, predicate);

test('displays Platform/Plan/Merchant/Effective per-field comparison and verified plan link', () => {
  const root = setup().render();
  assert.match(elementText(root), /80000|80,000/);
  assert.match(elementText(root), /PRICE_PLAN/);
  assert.match(elementText(root), /MERCHANT/);
  assert.equal(find(root, n => n.type === 'a' && /Growth/.test(elementText(n)))?.props.href,
    '/billing?view=plans&planId=plan-1');
  const tokenField = find(root, n => n.type === 'input' && n.props.name === 'outputTokens');
  assert.equal(tokenField?.props.value, '1500');
  const deadlineField = find(root, n => n.type === 'input' && n.props.id === 'commerce-budget-deadlineMs');
  assert.equal(deadlineField?.props.disabled, true);
});
test('unresolved plan explicitly shows no matching plan and Platform fallback without a fabricated link', () => {
  const root = setup({ policy: {
    ...policy, currentPlan: { state: 'UNMATCHED_PLAN', message: 'Missing matching plan', plan: null },
    planBudget: {}, sources: { deadlineMs: 'PLATFORM', outputTokens: 'MERCHANT' },
    effective: { deadlineMs: 60000, outputTokens: 1500 },
  } }).render();
  assert.match(elementText(root), /Unmatched current plan/);
  assert.equal(find(root, n => n.type === 'a' && /Growth/.test(elementText(n))), undefined);
});
test('history is scoped and paginates within the CommerceAgent tab', () => {
  const root = setup({ history, page: 1, hasMore: true }).render();
  assert.match(elementText(root), /Override changed/);
  assert.match(elementText(root), /Administrator/);
  assert.equal(find(root, n => n.type === 'a' && elementText(n) === 'Next')?.props.href,
    '/?tenant=shop-1&tab=commerce&commerceShopHistoryPage=3');
});
test('two concurrent submit attempts invoke the action only once', async () => {
  const fixture = setup();
  const form = find(fixture.render(), n => n.type === 'form');
  const event = { preventDefault() {}, currentTarget: {} };
  const first = form.props.onSubmit(event);
  await form.props.onSubmit(event);
  assert.equal(fixture.called.length, 1);
  assert.equal(find(fixture.render(), n => n.type === 'button' && n.props.type === 'submit').props.disabled, true);
  fixture.complete({ ok: true });
  await first;
  assert.equal(fixture.refreshed.length, 1);
});
test('inline errors and stale policy conflict offer recoverable UI', async () => {
  const f = setup();
  const form = find(f.render(), n => n.type === 'form');
  const first = form.props.onSubmit({ preventDefault() {}, currentTarget: {} });
  f.complete({ ok: false, message: 'Bad input', fieldErrors: { outputTokens: 'Invalid token budget', reason: 'Reason missing' } });
  await first;
  assert.match(elementText(f.render()), /Invalid token budget/);
  assert.match(elementText(f.render()), /Reason missing/);
  const second = form.props.onSubmit({ preventDefault() {}, currentTarget: {} });
  f.complete({ ok: false, conflict: true, message: 'Policy changed' });
  await second;
  const reload = find(f.render(), n => n.type === 'button' && /Reload current policy/.test(elementText(n)));
  assert.ok(reload);
  reload.props.onClick();
  assert.equal(f.refreshed.length, 1);
});

test('submit form carries server-issued Shop scope, never derives it from editable values', () => {
  const root = setup().render();
  assert.equal(find(root, n => n.type === 'input' && n.props.name === 'shopPolicyScope')?.props.value, 'signed-shop-1');
  assert.equal(find(root, n => n.type === 'input' && n.props.name === 'shopId')?.props.value, 'shop-1');
});
