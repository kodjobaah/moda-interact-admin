import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

const container = `moda-arch040-admin-${randomUUID()}`;
const dbName = 'arch040_admin_fixture';
const migrations = new URL('../database/prisma/migrations/', import.meta.url);
let started = false;
const docker = (args, options = {}) => execFileSync('docker', args, {
  encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...options,
});
const psql = (sql) => docker(['exec', '-i', container, 'psql', '-h', '127.0.0.1', '-p', '5432',
  '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', dbName], { input: sql });
try {
  assert.ok(!process.env.ARCH040_ALLOW_EXTERNAL_DATABASE, 'Refusing external database test mode');
  docker(['run', '--detach', '--name', container, '--publish', '127.0.0.1::5432',
    '--env', 'POSTGRES_PASSWORD=fixture-only', '--env', `POSTGRES_DB=${dbName}`,
    'pgvector/pgvector:pg17']);
  started = true;
  for (let i = 0; i < 90; i++) {
    try { docker(['exec', container, 'pg_isready', '-h', '127.0.0.1', '-p', '5432', '-U', 'postgres', '-d', dbName], { stdio: 'pipe' }); break; }
    catch { if (i === 89) throw new Error('PostgreSQL startup timeout'); await delay(500); }
  }
  const ordered = readdirSync(migrations).filter((entry) => /^\d{14}_/.test(entry)).sort();
  assert.ok(ordered.some((name) => name.includes('arch040_recovery_human_handover')), 'Missing DATABASE-001');
  assert.ok(ordered.some((name) => name.includes('arch040_conversation_moderation_assessments')), 'Missing DATABASE-005');
  for (const entry of ordered) psql(readFileSync(new URL(`${entry}/migration.sql`, migrations), 'utf8'));
  const port = docker(['port', container, '5432/tcp']).trim().match(/:(\d+)$/)?.[1];
  assert.ok(port, 'Disposable PostgreSQL port unavailable');
  const databaseUrl = `postgresql://postgres:fixture-only@127.0.0.1:${port}/${dbName}?schema=public`;
  execFileSync(process.execPath, ['--conditions=import', '--import', 'tsx', '--test',
    'tests/integration/arch040-human-messaging.postgres.test.ts'], {
    env: { ...process.env, DATABASE_URL: databaseUrl, ARCH040_ADMIN_DISPOSABLE_POSTGRES: '1' },
    stdio: 'inherit',
  });
  console.log('PASS ARCH-040-ADMIN-001 disposable PostgreSQL');
} finally {
  if (started) {
    try { docker(['rm', '--force', container]); }
    catch (error) { console.error('PostgreSQL cleanup failed', container, error); process.exitCode = 1; }
  }
}
