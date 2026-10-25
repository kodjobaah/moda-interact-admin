import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (file) => readFileSync(resolve(process.cwd(), file), 'utf8');
test('Meta approval UI remains decomposed and does not perform provider network requests', () => {
  const components = ['meta-submission-review', 'meta-submission-confirmation', 'meta-approval-summary',
    'meta-locale-status-table', 'meta-drift-notice', 'meta-template-dashboard', 'use-meta-template-status'];
  for (const component of components) assert.ok(source(`src/components/admin/whatsapp-templates/meta/${component}.tsx`.replace('use-meta-template-status.tsx', 'use-meta-template-status.ts')));
  const control = source('src/app/actions/whatsapp-template-meta-control.ts');
  for (const forbidden of ['fetch(', 'graph.facebook.com', 'ShopBrand', 'WHATSAPP_ACCESS_TOKEN']) assert.ok(!control.includes(forbidden));
  const submission = source('src/lib/admin/whatsapp-templates/meta/submission.ts');
  assert.match(submission, /Serializable/);
  assert.ok(!submission.includes('fetch('));
  const reconcile = source('src/lib/admin/whatsapp-templates/meta/reconcile.ts');
  assert.match(reconcile, /RECONCILE_REQUESTED/);
  assert.ok(!reconcile.includes('fetch('));
});
