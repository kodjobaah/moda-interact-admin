import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCreatePlanPolicyDraft } from '../../src/lib/admin/commerce-model-plan-create-policy.ts';
import { CommerceBudgetValidationError } from '../../src/lib/admin/commerce-model-policy-fields.ts';

test('a new plan with both fields inheriting persists no policy override', () => {
  assert.equal(parseCreatePlanPolicyDraft(JSON.stringify({ budget: {}, reason: '' })), null);
});
test('a new plan can override only deadline without copying inherited tokens', () => {
  assert.deepEqual(parseCreatePlanPolicyDraft(JSON.stringify({ budget: { deadlineMs: '70000' }, reason: 'Capacity experiment' })),
    { budget: { deadlineMs: 70000 }, reason: 'Capacity experiment' });
});
test('a new plan can override only output tokens without copying deadline', () => {
  assert.deepEqual(parseCreatePlanPolicyDraft(JSON.stringify({ budget: { outputTokens: '1400' }, reason: 'Increase answer depth' })),
    { budget: { outputTokens: 1400 }, reason: 'Increase answer depth' });
});
test('an override requires an audit reason', () => {
  assert.throws(() => parseCreatePlanPolicyDraft(JSON.stringify({ budget: { outputTokens: '2000' }, reason: '' })),
    (error: unknown) => error instanceof CommerceBudgetValidationError && Boolean(error.fieldErrors.reason));
});
test('invalid deadlines are rejected within the LIVE worker envelope', () => {
  for (const value of ['0', '-1', '1.5', '90001', '9007199254740992', 'NaN', '']) {
    assert.throws(() => parseCreatePlanPolicyDraft(JSON.stringify({ budget: { deadlineMs: value }, reason: 'reason' })));
  }
});
test('unknown fields and structural tampering are rejected', () => {
  for (const raw of [
    'invalid json',
    '{}',
    JSON.stringify({ budget: { remoteCalls: '10' }, reason: 'reason' }),
    JSON.stringify({ budget: { deadlineMs: null }, reason: 'reason' }),
    JSON.stringify({ budget: { deadlineMs: 30000 }, reason: 'reason' }),
    JSON.stringify({ budget: {}, reason: '', permission: 'admin' }),
  ]) assert.throws(() => parseCreatePlanPolicyDraft(raw));
});
