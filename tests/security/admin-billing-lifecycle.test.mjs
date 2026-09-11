import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const source = readFileSync(resolve(root, 'src/lib/admin/billing-lifecycle.ts'), 'utf8');
const catalogue = JSON.parse(readFileSync(resolve(root, 'src/i18n/locales/en.json'), 'utf8'));

test('billing triage is admin-only, provider-free, and uses exact lifecycle keys', () => {
  assert.match(source, /requirePlatformAdminMutation\(\)/);
  assert.match(source, /requirePlatformAdminRead\(\)/);
  assert.match(source, /`subscription-cancel:\$\{thread\.shopId\}:\$\{context\.providerSubscriptionId\}`/);
  assert.match(source, /`recovery-credit-refund:\$\{purchase\.id\}`/);
  assert.match(source, /'END_OF_CYCLE'/);
  assert.doesNotMatch(source, /classif(?:y|ication)|natural-language|NLP/i);
  assert.doesNotMatch(source, /fetch\(|axios|admin_graphql/i);
});

test('triage catalogue contains every new visible control label', () => {
  for (const key of [
    'billingTriage.title',
    'billingTriage.availability',
    'billingTriage.action',
    'billingTriage.planChange',
    'billingTriage.cancellation',
    'billingTriage.refund',
    'billingTriage.purchase',
    'billingTriage.selectPurchase',
    'billingTriage.reason',
    'billingTriage.submit',
  ]) assert.equal(typeof catalogue[key], 'string', key);
});