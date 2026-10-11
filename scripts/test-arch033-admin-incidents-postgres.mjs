import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

const container = `moda-arch033-admin-${randomUUID()}`;
const dbName = 'arch033_admin_fixture';
const database = new URL('../../moda-interact-database/prisma/migrations/', import.meta.url);
let started=false;
const docker=(args,opts={})=>execFileSync('docker',args,{encoding:'utf8',maxBuffer:32*1024*1024,...opts});
const psql=(sql)=>docker(['exec','-i',container,'psql','-X','-q','-v','ON_ERROR_STOP=1','-U','postgres','-d',dbName],{input:sql});
try {
  assert.ok(!process.env.ARCH033_ALLOW_EXTERNAL_DATABASE,'Refusing external database test mode');
  docker(['run','--detach','--name',container,'--publish','127.0.0.1::5432','--env','POSTGRES_PASSWORD=fixture-only','--env',`POSTGRES_DB=${dbName}`,'pgvector/pgvector:pg17']);
  started=true;
  for (let i=0;i<90;i++) { try { docker(['exec',container,'pg_isready','-U','postgres','-d',dbName],{stdio:'pipe'});break; } catch {if(i===89) throw new Error('Postgres startup timeout');await delay(500);} }
  const migrations=readdirSync(database).filter(x=>/^\d{14}_/.test(x)).sort();
  assert.ok(migrations.includes('20261011160000_arch033_generic_operational_incidents'),'ARCH-033 migration missing');
  for (const migration of migrations) { psql(readFileSync(new URL(`${migration}/migration.sql`,database),'utf8')); }
  const port=docker(['port',container,'5432/tcp']).trim().match(/:(\d+)$/)?.[1];
  assert.ok(port,'Could not determine Docker mapped port');
  const url=`postgresql://postgres:fixture-only@127.0.0.1:${port}/${dbName}?schema=public`;
  execFileSync('npx',['tsx','--test','tests/integration/operational-incident-actions.postgres.test.ts'],{stdio:'inherit',env:{...process.env,DATABASE_URL:url}});
  console.log('PASS ARCH-033 ADMIN-002 disposable PostgreSQL');
} finally { if(started) { try {docker(['rm','--force',container]);} catch(e) {console.error('CLEANUP FAILED',container,e);process.exitCode=1;} } }
