import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const actions = source('src/app/actions/tenant-human-messaging.ts');
const mutations = source('src/lib/admin/human-messaging-mutations.ts');
const projection = source('src/lib/admin/human-messaging.ts');
const ui = source('src/components/admin/tenant-human-messaging.tsx');
const controls = source('src/components/admin/human-messaging-controls.tsx');
const page = source('src/app/(protected)/page.tsx');

test('mutations require authenticated SUPER_ADMIN, form validation, and audited CAS', () => {
  assert.match(actions, /runProtectedTenantAction/);
  assert.match(actions, /requirePlatformAdminMutation/);
  assert.match(mutations, /admin\?\.role !== 'SUPER_ADMIN'/);
  assert.match(mutations, /FOR UPDATE/);
  assert.match(mutations, /revision:\s*\{ increment: 1 \}/);
  assert.match(mutations, /shopHumanMessagingRestrictionEvent\.create/);
  assert.match(actions, /logAdminSecurityEvent/);
  assert.doesNotMatch(mutations, /tx\.shop\.update|shopFeaturePreference\.update|controlMode:|pauseAutomatedWhatsapp/);
});
test('moderation review sets transaction-local attribution, no decision overwrite', () => {
  assert.match(mutations, /moda\.moderation_reviewer/);
  assert.match(mutations, /reviewedAt: null/);
  assert.match(mutations, /reviewedByPlatformAdminId: principal\.id/);
  assert.doesNotMatch(mutations, /data:\s*\{[^}]*decision:\s*['"]ALLOW/s);
});
test('selected merchant displays only privileged, paginated metadata with double-submit protection', () => {
  assert.match(page, /principal\.role === "SUPER_ADMIN"/);
  assert.match(projection, /where: \{ shopId \}/);
  assert.match(projection, /take: HISTORY_PAGE_SIZE/);
  assert.match(projection, /take: INCIDENT_PAGE_SIZE/);
  assert.doesNotMatch(projection, /categoryScores: true|content: true|reasonNote: true/);
  assert.match(ui, /ModerationReviewControl/);
  assert.match(controls, /data\.submitting|dataset\.submitting/);
  assert.match(controls, /disabled=\{pending\}/);
});
