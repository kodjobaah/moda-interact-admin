import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createComponentHarness, elementText, findElement, loadPolicyModule,
} from './helpers/commerce-model-policy-module-harness.mjs';

const fields = loadPolicyModule('src/lib/admin/commerce-model-policy-fields.ts', {});
const samplePolicy = {
  planId: 'plan-1', environment: 'DEVELOPMENT', editVersion: 2,
  budget: { deadlineMs: 70000 },
  platformBudget: { deadlineMs: 60000, outputTokens: 800 },
  effective: { deadlineMs: 70000, outputTokens: 800 },
  sources: { deadlineMs: 'PRICE_PLAN', outputTokens: 'PLATFORM' },
};
const historyEntry = {
  id: 'event-1', createdAt: '2026-10-13T12:00:00.000Z', actor: 'Super Admin',
  reason: 'Adjust plan policy', previousBudget: { deadlineMs: 65000 },
  nextBudget: { deadlineMs: 70000 }, previousEditVersion: 1, nextEditVersion: 2,
};
function setup({ policy = samplePolicy, history = [], page = 0, hasMore = false, canEdit = true } = {}) {
  const h = createComponentHarness();
  const calls = [];
  const refreshes = [];
  const pending = [];
  const baseFields = loadPolicyModule('src/components/admin/commerce-model-policy/budget-policy-fields.tsx', {
    'react/jsx-runtime': h.jsxRuntime,
    '@/lib/admin/commerce-model-policy-fields': fields,
  });
  const component = loadPolicyModule('src/components/admin/commerce-model-policy/live-plan-policy.tsx', {
    react: h.react,
    'react/jsx-runtime': h.jsxRuntime,
    'next/navigation': { useRouter: () => ({ refresh: () => refreshes.push('refresh') }) },
    '@/app/actions/commerce-model-plan-policy': { saveLivePlanBudgetAction: (form) => {
      calls.push(form);
      return new Promise(resolve => pending.push(resolve));
    } },
    './budget-policy-fields': baseFields,
  }, { FormData: class { constructor(target) { this.target = target; } } });
  const props = {
    policy, history, page, hasMore, canEdit,
    historyBaseHref: '/billing?view=plans&section=pricing&planId=plan-1',
  };
  return {
    calls, refreshes,
    render: () => h.render(component.LivePlanPolicyControls, props),
    complete: (result) => pending.shift()(result),
  };
}
const find = (node, check) => findElement(node, check);
const byInputName = (root, name) => find(root, n => n.type === 'input' && n.props.name === name);
const saveButton = root => find(root, n => n.type === 'button' && n.props.type === 'submit');
const form = root => find(root, n => n.type === 'form');

test('effective plan budget shows independent PRICE_PLAN and PLATFORM sources, with inherited field disabled', () => {
  const f = setup();
  const root = f.render();
  assert.match(elementText(root), /70,000\s+ms.*PRICE_PLAN/);
  assert.match(elementText(root), /800.*PLATFORM/);
  assert.match(elementText(root), /Inherits\s+800\s+from\s+LIVE Platform/);
  assert.equal(byInputName(root, 'planId').props.value, 'plan-1');
  assert.equal(byInputName(root, 'expectedEditVersion').props.value, 2);
  assert.ok(byInputName(root, 'override_deadlineMs'));
  assert.equal(byInputName(root, 'override_outputTokens'), undefined);
  const inherited = find(root, n => n.type === 'input' && n.props.id === 'commerce-budget-outputTokens');
  assert.equal(inherited.props.disabled, true);
  assert.equal(inherited.props.name, undefined);
});

test('independent Override/Inherit switches change sparse inputs without copying Platform values', () => {
  const f = setup();
  let root = f.render();
  const toggles = () => {
    const all = [];
    const walk = node => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== 'object' || !('type' in node)) return;
      if (node.type === 'input' && node.props.type === 'checkbox') all.push(node);
      walk(node.props.children);
    };
    walk(root);
    return all;
  };
  assert.deepEqual(toggles().map(n => n.props.checked), [true, false]);
  toggles()[0].props.onChange({ target: { checked: false } });
  toggles()[1].props.onChange({ target: { checked: true } });
  root = f.render();
  assert.deepEqual(toggles().map(n => n.props.checked), [false, true]);
  assert.equal(byInputName(root, 'override_deadlineMs'), undefined);
  assert.equal(byInputName(root, 'override_outputTokens').props.value, 'on');
  assert.equal(byInputName(root, 'deadlineMs'), undefined);
  assert.equal(byInputName(root, 'outputTokens').props.value, '800');
  assert.match(elementText(root), /Inherits\s+60000\s+from\s+LIVE Platform/);
});

test('non-SUPER_ADMIN cannot edit or submit plan policy', async () => {
  const f = setup({ canEdit: false });
  const root = f.render();
  assert.equal(saveButton(root).props.disabled, true);
  assert.equal(find(root, n => n.type === 'fieldset').props.disabled, true);
  await form(root).props.onSubmit({ preventDefault() {}, currentTarget: {} });
  assert.equal(f.calls.length, 0);
});

test('in-flight save disables inputs and synchronously prevents a double submission', async () => {
  const f = setup();
  const onSubmit = form(f.render()).props.onSubmit;
  const event = { preventDefault() {}, currentTarget: {} };
  const first = onSubmit(event);
  await onSubmit(event);
  assert.equal(f.calls.length, 1);
  assert.equal(saveButton(f.render()).props.disabled, true);
  assert.match(elementText(saveButton(f.render())), /Saving policy/);
  assert.equal(find(f.render(), n => n.type === 'fieldset').props.disabled, true);
  f.complete({ ok: true });
  await first;
  assert.equal(f.refreshes.length, 1);
  assert.equal(saveButton(f.render()).props.disabled, false);
});

test('action validation errors render inline next to plan fields and audit reason', async () => {
  const f = setup();
  const running = form(f.render()).props.onSubmit({ preventDefault() {}, currentTarget: {} });
  f.complete({ ok: false, message: 'Please correct the errors', fieldErrors: {
    deadlineMs: 'Deadline is invalid', outputTokens: 'Output tokens invalid', reason: 'Audit reason required',
  } });
  await running;
  const root = f.render();
  assert.match(elementText(root), /Deadline is invalid/);
  assert.match(elementText(root), /Output tokens invalid/);
  assert.match(elementText(root), /Audit reason required/);
  assert.equal(byInputName(root, 'deadlineMs').props['aria-invalid'], true);
});

test('CAS conflict shows actionable reload button', async () => {
  const f = setup();
  const running = form(f.render()).props.onSubmit({ preventDefault() {}, currentTarget: {} });
  f.complete({ ok: false, conflict: true, message: 'Policy changed.' });
  await running;
  const reload = find(f.render(), n => n.type === 'button' && /Reload current policy/.test(elementText(n)));
  assert.ok(reload);
  reload.props.onClick();
  assert.deepEqual(f.refreshes, ['refresh']);
});

test('empty history and scoped pagination render without a Next link', () => {
  const root = setup().render();
  assert.match(elementText(root), /No policy changes recorded/);
  assert.match(elementText(root), /Page\s+1/);
  assert.equal(find(root, n => n.type === 'a' && /Next/.test(elementText(n))), undefined);
});

test('populated history shows actor, reason, before/after and correct page links', () => {
  const root = setup({ history: [historyEntry], page: 1, hasMore: true }).render();
  assert.match(elementText(root), /Super Admin/);
  assert.match(elementText(root), /Adjust plan policy/);
  assert.match(elementText(root), /Before:\s+deadlineMs: 65000/);
  assert.match(elementText(root), /After:\s+deadlineMs: 70000/);
  const links = [];
  const walk = node => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object' || !('type' in node)) return;
    if (node.type === 'a') links.push(node.props.href);
    walk(node.props.children);
  };
  walk(root);
  assert.deepEqual(links, [
    '/billing?view=plans&section=pricing&planId=plan-1&commercePlanHistoryPage=1',
    '/billing?view=plans&section=pricing&planId=plan-1&commercePlanHistoryPage=3',
  ]);
});
