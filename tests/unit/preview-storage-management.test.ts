import assert from 'node:assert/strict';
import test from 'node:test';
import { managePreviewStorageWithDependencies } from '../../src/lib/admin/platform-configuration/preview-storage-core';
function dependencies() {
  const calls: unknown[][] = []; const audit: Record<string, unknown>[] = [];
  return { calls, audit, deps: { principal: { id: 'admin-1', role: 'SUPER_ADMIN' }, environment: 'test',
    eval: async (...args: unknown[]) => { calls.push(args); return JSON.stringify({ conversations: 2, runs: 3, bytes: 100, active: 0, purged: true }); },
    audit: (value: Record<string, unknown>) => { audit.push(value); }, now: () => 123,
  } };
}
test('purge validates role and confirmation before touching Redis', async () => {
  const { deps, calls } = dependencies();
  await assert.rejects(managePreviewStorageWithDependencies('purge', {}, { ...deps, principal: { id: 'admin-1', role: 'ADMIN' } }));
  for (const value of [{ confirmation: 'PURGE production', reason: 'test' }, { confirmation: 'PURGE test', reason: '' }, { confirmation: 'PURGE test', reason: 'reset', environment: 'production' }]) await assert.rejects(managePreviewStorageWithDependencies('purge', value, deps));
  assert.equal(calls.length, 0);
});
test('purge uses server deployment key and records intent and outcome', async () => {
  const { deps, calls, audit } = dependencies();
  await managePreviewStorageWithDependencies('purge', { confirmation: 'PURGE test', reason: 'Reset test previews' }, deps);
  assert.deepEqual(calls[0]?.slice(1), ['commerce:preview:test:state', 'purge', 123]);
  assert.deepEqual(audit.map((value) => value.outcome), ['REQUESTED', 'PURGED']);
  assert.equal(audit[1]?.reason, 'Reset test previews');
});
test('active previews block purge and a failed intent audit prevents Redis access', async () => {
  const { deps, calls } = dependencies();
  await assert.rejects(managePreviewStorageWithDependencies('purge', { confirmation: 'PURGE test', reason: 'reset' }, { ...deps, audit: () => { throw new Error('audit unavailable'); } }));
  assert.equal(calls.length, 0);
  await assert.rejects(managePreviewStorageWithDependencies('purge', { confirmation: 'PURGE test', reason: 'reset' }, { ...deps,
    eval: async () => JSON.stringify({ conversations: 2, runs: 3, bytes: 100, active: 1, purged: false }),
  }), /preview is running/);
});

test('real Redis purge refuses active leases and deletes only the exact preview namespace', async (t) => {
  const { existsSync, mkdtempSync, rmSync } = await import('node:fs');
  if (!existsSync('/usr/local/bin/redis-server')) { t.skip('Local Redis unavailable'); return; }
  const { spawn } = await import('node:child_process');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { default: Redis } = await import('ioredis');
  const { PREVIEW_STORAGE_MANAGEMENT_SCRIPT } = await import('../../src/lib/admin/platform-configuration/preview-storage-core');
  const directory = mkdtempSync(join(tmpdir(), 'admin-preview-purge-'));
  const socket = join(directory, 'redis.sock');
  const server = spawn('/usr/local/bin/redis-server', ['--port', '0', '--unixsocket', socket, '--save', '', '--appendonly', 'no'], { stdio: 'ignore' });
  let client: InstanceType<typeof Redis> | undefined;
  try {
    for (let n = 0; n < 100 && !existsSync(socket); n++) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.ok(existsSync(socket));
    client = new Redis(socket, { maxRetriesPerRequest: 0 });
    const key = 'commerce:preview:test:state';
    const state = { schemaVersion: 2, conversations: { 'admin:c1': { createdAt: 1 } }, runs: { 'admin:r1': { createdAt: 1, reservedAt: 1, status: 'RUNNING' } }, toolTests: {}, runKinds: {}, modelStarts: {}, modelSlots: {} };
    await client.set(key, JSON.stringify(state));
    await client.set(`${key}:conversations:admin:c1`, '{"snapshot":"test"}');
    await client.set(`${key}:runs:admin:r1`, '{"status":"RUNNING"}');
    await client.set('commerce:preview:production:state', 'untouched');
    await client.set('background:queue', 'untouched');
    const busy = JSON.parse(await client.eval(PREVIEW_STORAGE_MANAGEMENT_SCRIPT, 1, key, 'purge', 2) as string);
    assert.equal(busy.active, 1); assert.equal(busy.purged, false); assert.equal(await client.exists(key), 1);
    state.runs['admin:r1'].status = 'COMPLETED';
    await client.set(key, JSON.stringify(state));
    const result = JSON.parse(await client.eval(PREVIEW_STORAGE_MANAGEMENT_SCRIPT, 1, key, 'purge', 3) as string);
    assert.equal(result.purged, true); assert.equal(result.conversations, 1); assert.equal(result.runs, 1);
    assert.deepEqual(await client.keys(`${key}*`), []);
    assert.equal(await client.get('commerce:preview:production:state'), 'untouched');
    assert.equal(await client.get('background:queue'), 'untouched');
    await client.set(key, JSON.stringify({ ...state, modelStarts: { 'test:admin': [1] } }));
    await client.eval(PREVIEW_STORAGE_MANAGEMENT_SCRIPT, 1, key, 'purge', 4);
    assert.deepEqual(JSON.parse((await client.get(key))!).modelStarts, { 'test:admin': [1] });
    assert.deepEqual(JSON.parse((await client.get(key))!).conversations, {});
    await client.set(key, JSON.stringify({ ...state, schemaVersion: undefined }));
    assert.equal(JSON.parse(await client.eval(PREVIEW_STORAGE_MANAGEMENT_SCRIPT, 1, key, 'purge', 4) as string).purged, true);
  } finally { client?.disconnect(); server.kill('SIGTERM'); rmSync(directory, { recursive: true, force: true }); }
});
