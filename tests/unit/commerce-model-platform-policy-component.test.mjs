import assert from 'node:assert/strict';
import test from 'node:test';
import { createComponentHarness, findElement, elementText, loadPolicyModule } from './helpers/commerce-model-policy-module-harness.mjs';

const fields = loadPolicyModule('src/lib/admin/commerce-model-policy-fields.ts', {});
const policy = {
  id: 'live-platform', environment: 'DEVELOPMENT', budget: { deadlineMs: 60000, outputTokens: 800 },
  budgetSchemaVersion: 1, editVersion: 3, updatedAt: '2026-10-13T12:00:00.000Z',
};
const record = {
  id: 'evt-1', actor: 'Platform administrator', createdAt: '2026-10-13T12:00:00.000Z',
  reason: 'Update policy', previousBudget: { deadlineMs: 60000, outputTokens: 800 },
  nextBudget: { deadlineMs: 70000, outputTokens: 1200 }, previousEditVersion: 2, nextEditVersion: 3,
};

function setup({ canEdit = true, history = [], page = 0, hasMore = false } = {}) {
  const h = createComponentHarness();
  let resolveAction;
  const calls = [];
  const refreshed = [];
  const action = () => new Promise(resolve => { resolveAction = resolve; });
  const component = loadPolicyModule('src/components/admin/commerce-model-policy/live-platform-policy.tsx', {
    'react': h.react,
    'react/jsx-runtime': h.jsxRuntime,
    'next/navigation': { useRouter: () => ({ refresh: () => refreshed.push('refresh') }) },
    '@/app/actions/commerce-model-platform-policy': {
      saveLivePlatformBudgetAction: (data) => { calls.push(data); return action(); },
    },
    './budget-policy-fields': {
      BudgetPolicyFields: loadPolicyModule('src/components/admin/commerce-model-policy/budget-policy-fields.tsx', {
        'react/jsx-runtime': h.jsxRuntime,
        '@/lib/admin/commerce-model-policy-fields': fields,
      }).BudgetPolicyFields,
    },
  }, { FormData: class { constructor(target) { this.target = target; } } });
  const props = { policy, history, page, hasMore, canEdit };
  return {
    calls, refreshed,
    render: () => h.render(component.LivePlatformPolicyControls, props),
    complete: (result) => resolveAction(result),
  };
}
const find = (node, predicate) => findElement(node, predicate);
const saveButton = (node) => find(node, n => n.type === 'button' && n.props.type === 'submit');

test('history empty state and no forward pagination are rendered', () => {
  const f = setup();
  const root = f.render();
  assert.match(elementText(root), /No policy changes have been recorded/);
  assert.match(elementText(root), /Page\s+1/);
  assert.equal(find(root, n => n.type === 'a' && /Next page/.test(elementText(n))), undefined);
});

test('populated history shows audited values and correct previous/next pagination', () => {
  const f = setup({ history: [record], page: 1, hasMore: true });
  const root = f.render();
  assert.match(elementText(root), /Update policy/);
  assert.match(elementText(root), /Platform administrator/);
  assert.match(elementText(root), /70,000 ms/);
  assert.equal(find(root, n => n.type === 'a' && /Previous page/.test(elementText(n)))?.props.href,
    '/system-controls/platform-policy?commerceHistoryPage=0');
  assert.equal(find(root, n => n.type === 'a' && /Next page/.test(elementText(n)))?.props.href,
    '/system-controls/platform-policy?commerceHistoryPage=2');
});

test('unauthorized users cannot submit or edit controls', async () => {
  const f = setup({ canEdit: false });
  const root = f.render();
  assert.equal(saveButton(root).props.disabled, true);
  const form = find(root, n => n.type === 'form');
  await form.props.onSubmit({ preventDefault() {}, currentTarget: {} });
  assert.equal(f.calls.length, 0);
});

test('in-flight save disables controls and blocks a second submission', async () => {
  const f = setup();
  const form = find(f.render(), n => n.type === 'form');
  const event = { preventDefault() {}, currentTarget: {} };
  const first = form.props.onSubmit(event);
  await form.props.onSubmit(event);
  assert.equal(f.calls.length, 1);
  assert.equal(saveButton(f.render()).props.disabled, true);
  assert.match(elementText(saveButton(f.render())), /Saving policy/);
  f.complete({ ok: true });
  await first;
  assert.equal(f.refreshed.length, 1);
  assert.equal(saveButton(f.render()).props.disabled, false);
});

test('action field errors appear next to their fields', async () => {
  const f = setup();
  const form = find(f.render(), n => n.type === 'form');
  const run = form.props.onSubmit({ preventDefault() {}, currentTarget: {} });
  f.complete({ ok: false, message: 'Correct the highlighted values.', fieldErrors: {
    deadlineMs: 'Deadline too long', outputTokens: 'Invalid tokens', reason: 'Audit reason required',
  } });
  await run;
  const root = f.render();
  assert.match(elementText(root), /Deadline too long/);
  assert.match(elementText(root), /Invalid tokens/);
  assert.match(elementText(root), /Audit reason required/);
  assert.equal(find(root, n => n.type === 'input' && n.props.name === 'deadlineMs')?.props['aria-invalid'], true);
});

test('stale CAS response provides a working reload control', async () => {
  const f = setup();
  const form = find(f.render(), n => n.type === 'form');
  const run = form.props.onSubmit({ preventDefault() {}, currentTarget: {} });
  f.complete({ ok: false, conflict: true, message: 'CommerceAgent policy changed.' });
  await run;
  const root = f.render();
  const reload = find(root, n => n.type === 'button' && /Reload current policy/.test(elementText(n)));
  assert.ok(reload);
  reload.props.onClick();
  assert.equal(f.refreshed.length, 1);
});
