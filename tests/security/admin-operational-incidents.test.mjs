import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
test('generic incidents require platform admin authentication before Prisma queries', () => {
  const source = read('src/lib/admin/operational-incidents.ts');
  assert.match(source, /requirePlatformAdminRead\(\)/);
  assert.match(source, /operationalIncident\.findMany/);
  assert.match(source, /operationalIncident\.findUnique/);
  assert.doesNotMatch(source, /select:\s*\{[^}]*rawPayload/);
});
test('incident list is internal and Merchant Support remains independent', () => {
  const page = read('src/app/(protected)/operational-incidents/page.tsx');
  assert.match(page, /requirePlatformAdminPage\(\)/);
  assert.match(page, /getOperationalIncidentDetail/);
  assert.match(page, /operationalIncidentAction/);
  assert.doesNotMatch(read('src/app/(protected)/merchant-support/page.tsx'), /McpOperationalIssues/);
});

test('incident mutations require platform-admin auth and compare-and-swap revision', () => {
  const source = read('src/lib/admin/operational-incident-actions.ts');
  assert.match(source, /requirePlatformAdminMutation\(\)/);
  assert.match(source, /revision: current.revision/);
  assert.match(source, /ownerPlatformAdminId: current.ownerPlatformAdminId/);
  assert.match(source, /changed.count !== 1/);
  assert.match(source, /operationalIncidentEvent.create/);
  assert.match(source, /Only super administrators may reassign incidents/);
  assert.match(source, /Take ownership before changing this incident/);
  assert.match(source, /Resolution rationale is required/);
});
