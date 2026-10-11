import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = file => readFileSync(join(root, file), 'utf8');

test('MCP operational dashboard uses existing Admin auth and distinct incident state', () => {
  const server = read('src/lib/admin/mcp-operational-issues.ts');
  const action = read('src/app/actions/mcp-operational.ts');
  const page = read('src/app/(protected)/merchant-support/page.tsx');
  assert.match(server, /await requirePlatformAdminRead\(\)/);
  assert.match(server, /await requirePlatformAdminMutation\(\)/);
  assert.match(server, /status: 'OPEN'/);
  assert.match(server, /MCP_TOOL_EXECUTION_RESOLVED/);
  assert.match(action, /'use server'/);
  assert.match(page, /McpOperationalIssues/);
});
