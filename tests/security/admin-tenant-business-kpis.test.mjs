import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(dirname, '..', '..');
const sourcePath = (...parts) => path.join(repositoryRoot, ...parts);

test('Tenant Directory KPIs are derived from durable business state', async () => {
  const dataSource = await readFile(sourcePath('src/lib/admin/data.ts'), 'utf8');
  const pageSource = await readFile(sourcePath('src/app/(protected)/page.tsx'), 'utf8');
  const typesSource = await readFile(sourcePath('src/lib/admin/types.ts'), 'utf8');

  assert.match(dataSource, /prisma\.checkoutRecovery\.groupBy/);
  assert.match(dataSource, /CheckoutRecoveryStatus\.DETECTED/);
  assert.match(dataSource, /CheckoutRecoveryStatus\.MESSAGE_SENT/);
  assert.match(dataSource, /CheckoutRecoveryStatus\.COMPLETED/);
  assert.match(dataSource, /prisma\.conversation\.count/);
  assert.match(dataSource, /prisma\.conversationMessage\.count/);
  assert.match(dataSource, /type:\s*["']RECOVERY["']/);

  for (const key of [
    'activeRecoveries',
    'pendingRecoveries',
    'recoveredCheckouts',
    'recoveryConversations',
    'recoveryMessages',
  ]) {
    assert.match(typesSource, new RegExp(`${key}: number`));
    assert.match(pageSource, new RegExp(`directory\\.kpis\\.${key}`));
  }

  assert.doesNotMatch(pageSource, /queue\.active/);
  assert.doesNotMatch(pageSource, /queue\.checkoutEvents/);
  assert.doesNotMatch(pageSource, /queue\.orderEvents/);
});

test('Tenant Directory explains that queue runtime activity belongs to Observability', async () => {
  const localeSource = await readFile(sourcePath('src/i18n/locales/en.json'), 'utf8');

  assert.match(localeSource, /"tenant\.platformSummary": "Recovery business state"/);
  assert.match(localeSource, /Pending means detected or message sent; active also includes engaged recoveries\. Runtime queue activity is monitored separately under Observability/);
  assert.match(localeSource, /"tenant\.pendingRecoveries": "Pending Recoveries"/);
  assert.match(localeSource, /"tenant\.recoveredCheckouts": "Recovered Checkouts"/);
  assert.match(localeSource, /"tenant\.recoveryConversations": "Recovery Conversations"/);
  assert.match(localeSource, /"tenant\.recoveryMessages": "Recovery Messages"/);
});
