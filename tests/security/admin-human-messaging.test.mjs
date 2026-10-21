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
  assert.doesNotMatch(projection, /categoryScores: true|content: true/);
  assert.match(ui, /ModerationReviewControl/);
  assert.match(controls, /data\.submitting|dataset\.submitting/);
  assert.match(controls, /disabled=\{pending\}/);
});

// Only the SUPER_ADMIN selected-merchant dashboard may read and render the audit note.
test('restriction history includes privileged notes while incidents stay content-free', () => {
  assert.match(page, /principal\.role === "SUPER_ADMIN"/);
  assert.match(projection, /requirePlatformAdminRead/);
  assert.match(projection, /principal\.role !== 'SUPER_ADMIN'/);
  const historyQuery = projection.split('database.shopHumanMessagingRestrictionEvent.findMany(')[1]?.split('database.conversationModerationAssessment.findMany(')[0];
  assert.ok(historyQuery, 'restriction event query must remain distinct');
  assert.match(historyQuery, /reasonCode:\s*true,\s*reasonNote:\s*true/);
  assert.match(projection, /reasonNote: event\.reasonNote/);
  assert.match(ui, /Internal note \(SUPER_ADMIN only\)/);
  assert.match(ui, /item\.reasonNote \?\? '—'/);
  const incidentQuery = projection.split('database.conversationModerationAssessment.findMany(')[1]?.split('const history:')[0];
  assert.ok(incidentQuery, 'incident query must remain distinct');
  assert.doesNotMatch(incidentQuery, /\b(?:content|categoryScores|reasonNote): true/);
  assert.doesNotMatch(ui.split('human-moderation-incidents')[1] ?? '', /reasonNote|content|categoryScores/);
});
