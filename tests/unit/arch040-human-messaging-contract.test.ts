import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseRestrictionForm, parseModerationReviewForm, safeModerationCategories,
  HumanMessagingInputError,
} from '../../src/lib/admin/human-messaging-contract.ts';

const restriction = (overrides: Record<string, string> = {}) => {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    shopId: 'merchant-shop-1', intent: 'SUSPEND', expectedRevision: '0',
    reasonCode: 'SPAM', reasonNote: 'Repeated merchant harassment', ...overrides,
  })) data.set(key, value);
  return data;
};
const invalid = (form: FormData) => assert.throws(() => parseRestrictionForm(form), (e: unknown) =>
  e instanceof HumanMessagingInputError && e.code === 'INVALID');

test('valid suspend and restore require machine reasons, notes and revision', () => {
  assert.deepEqual(parseRestrictionForm(restriction()), {
    shopId: 'merchant-shop-1', intent: 'SUSPEND', expectedRevision: 0,
    reasonCode: 'SPAM', reasonNote: 'Repeated merchant harassment',
  });
  assert.equal(parseRestrictionForm(restriction({ intent: 'RESTORE', expectedRevision: '2', reasonNote: 'Appeal approved' })).expectedRevision, 2);
});
test('rejects missing, malicious or excessive form fields', () => {
  invalid(restriction({ shopId: 'wrong/value' }));
  invalid(restriction({ intent: 'RESET' }));
  invalid(restriction({ expectedRevision: '-1' }));
  invalid(restriction({ expectedRevision: '1.5' }));
  invalid(restriction({ expectedRevision: '1abc' }));
  invalid(restriction({ reasonCode: 'ANYTHING' }));
  invalid(restriction({ reasonNote: '    ' }));
  invalid(restriction({ reasonNote: 'x'.repeat(1001) }));
});
test('moderation review accepts only bounded IDs and an explicit annotation', () => {
  const data = new FormData();
  data.set('shopId', 'merchant-shop-1');
  data.set('assessmentId', 'assessment-1');
  data.set('disposition', 'ACKNOWLEDGED');
  assert.deepEqual(parseModerationReviewForm(data), {
    shopId: 'merchant-shop-1', assessmentId: 'assessment-1', disposition: 'ACKNOWLEDGED',
  });
  data.set('disposition', 'ALLOW_SEND');
  assert.throws(() => parseModerationReviewForm(data), HumanMessagingInputError);
});
test('incident category projection never exports scores, content, or malformed keys', () => {
  assert.deepEqual(safeModerationCategories({ violence: true, 'self-harm': true, sexual: false, '__proto__': true, badCategory: { score: 1 } }), ['self-harm', 'violence']);
  assert.deepEqual(safeModerationCategories([{ danger: true }]), []);
  assert.deepEqual(safeModerationCategories(null), []);
});
