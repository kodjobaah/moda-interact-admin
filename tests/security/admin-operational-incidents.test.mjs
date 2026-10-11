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
test('incident list is internal and read-only, preserves MCP panel', () => {
  const page = read('src/app/(protected)/operational-incidents/page.tsx');
  assert.match(page, /requirePlatformAdminPage\(\)/);
  assert.match(page, /getOperationalIncidentDetail/);
  assert.doesNotMatch(page, /resolveOperationalIncident|claimOperationalIncident/);
  assert.match(read('src/app/(protected)/merchant-support/page.tsx'), /McpOperationalIssues/);
});
