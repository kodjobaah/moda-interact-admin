import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const repositoryRoot = new URL('../../', import.meta.url);

async function sourcePath(relativePath) {
  return readFile(new URL(relativePath, repositoryRoot), 'utf8');
}

test('health is dependency-free and operational routes do not require auth', async () => {
  const healthSource = await sourcePath('src/app/health/route.ts');
  const readySource = await sourcePath('src/app/ready/route.ts');

  assert.match(healthSource, /Response\.json\(\{ status: 'ok' \}\)/);
  assert.doesNotMatch(healthSource, /prisma|auth|requirePlatformAdmin|fetch/);
  assert.doesNotMatch(healthSource, /password|token|secret|tenant|admin/i);
  assert.doesNotMatch(readySource, /requirePlatformAdmin|auth\(/);
});

test('readiness source uses a bounded non-mutating PostgreSQL probe', async () => {
  const readySource = await sourcePath('src/app/ready/route.ts');
  const readinessSource = await sourcePath('src/lib/health/readiness.ts');

  assert.match(readySource, /prisma\.\$queryRaw`SELECT 1`/);
  assert.match(readinessSource, /withTimeout\(databasePing\(\), timeoutMs\)/);
  assert.match(readinessSource, /DatabasePing = \(\) => Promise<unknown>/);
  assert.match(readinessSource, /status: 'ready'/);
  assert.match(readinessSource, /status: 'unavailable'/);
  assert.doesNotMatch(readinessSource, /prisma\.[a-z]+\.(findUnique|findMany|update|delete|create)/);
  assert.doesNotMatch(readySource, /DATABASE_URL|postgresql:\/\//);
});

test('operational response sources expose no sensitive values', async () => {
  const healthSource = await sourcePath('src/app/health/route.ts');
  const readinessSource = await sourcePath('src/lib/health/readiness.ts');

  for (const source of [healthSource, readinessSource]) {
    assert.doesNotMatch(source, /DATABASE_URL|password|credential|connection|string|tenant|customer/i);
  }
});

async function runNodeModuleScript(script) {
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--input-type=module', '--eval', script],
    {
      encoding: 'utf8',
      env: process.env,
    },
  );

  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim());
}

test('health route executes as dependency-free liveness', async () => {
  const healthPath = new URL('../../src/app/health/route.ts', import.meta.url);
  const result = await runNodeModuleScript(`
    import { GET } from ${JSON.stringify(healthPath.pathname)};
    const response = GET();
    console.log(JSON.stringify({
      status: response.status,
      body: await response.json(),
    }));
  `);

  assert.deepEqual(result, {
    status: 200,
    body: { status: 'ok' },
  });
});

test('readiness executes success, failure, and bounded timeout behavior', async () => {
  const readinessPath = new URL(
    '../../src/lib/health/readiness.ts',
    import.meta.url,
  );

  async function run(mode, timeoutMs = 25) {
    return runNodeModuleScript(`
      import { createReadinessResponse } from ${JSON.stringify(readinessPath.pathname)};

      let calls = 0;
      const mode = ${JSON.stringify(mode)};
      const probe = () => {
        calls += 1;

        if (mode === 'success') {
          return Promise.resolve('ok');
        }

        if (mode === 'failure') {
          return Promise.reject(new Error('database unavailable'));
        }

        if (mode === 'timeout') {
          return new Promise(() => {});
        }

        throw new Error('unknown mode');
      };

      const startedAt = Date.now();
      const response = await createReadinessResponse(
        probe,
        ${timeoutMs},
      );

      console.log(JSON.stringify({
        status: response.status,
        body: await response.json(),
        calls,
        elapsedMs: Date.now() - startedAt,
      }));
    `);
  }

  const success = await run('success');
  assert.equal(success.status, 200);
  assert.deepEqual(success.body, { status: 'ready' });
  assert.equal(success.calls, 1);

  const failure = await run('failure');
  assert.equal(failure.status, 503);
  assert.deepEqual(failure.body, { status: 'unavailable' });
  assert.equal(failure.calls, 1);

  const timeout = await run('timeout', 25);
  assert.equal(timeout.status, 503);
  assert.deepEqual(timeout.body, { status: 'unavailable' });
  assert.equal(timeout.calls, 1);

  // The exact scheduler delay is environment-dependent. This upper bound only
  // proves that the readiness contract does not wait indefinitely.
  assert.ok(
    timeout.elapsedMs < 1_000,
    `readiness timeout should be bounded, got ${timeout.elapsedMs}ms`,
  );
});

