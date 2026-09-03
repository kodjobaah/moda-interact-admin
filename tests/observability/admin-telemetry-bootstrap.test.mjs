// Focused preload/bootstrap tests for the shared observability runtime.
//
// Starts the real production Next.js server with the shared observability
// preload, points the shared OTLP trace exporter at an in-process receiver,
// exercises the health database route, and asserts on the exported telemetry:
//
//   - the shared runtime started before the Next.js framework imported its
//     server modules (inbound HTTP and Undici/fetch client spans are captured);
//   - canonical resource identity (service.name=moda-interact-admin,
//     service.namespace=moda-interact, deployment.environment.name=test);
//   - HTTP, Undici/fetch and Prisma instrumentation are enabled;
//   - Moda-owned telemetry does not explicitly capture sensitive admin/tenant/
//     credential or SQL parameter values;
//   - approved framework/OpenTelemetry telemetry passes through unchanged
//     (trusted third-party boundary) with no repository-local rewriting;
//   - exporter/backend failure does not break valid admin requests;
//   - observability activity does not change application correctness.
//
// The Undici/fetch client span is produced by a test-only preload fixture
// (`fixtures/probe-preload.mjs`) that imports the real production preload and
// fires a bounded burst of outbound fetches to the test receiver. The other
// tests spawn the exact production start command (`npm start`), optionally
// with a deliberately dead OTLP endpoint for exporter failure isolation.

import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { startOtlpReceiver } from './otlp-receiver.mjs';

const adminRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const nextBuildId = join(adminRoot, '.next', 'BUILD_ID');

const DATABASE_URL =
  process.env.ADMIN_TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/moda_interact';
const HEALTH_PATH = '/api/health/database';
const PROBE_TARGET_PATH = '/probe-target';
const SECRET_QUERY = 'token=admin-secret-value&tenant=tenant_data';
const FETCH_SECRET_QUERY = 'token=fetch-secret-value';
// Test sentinels and the local development database DSN. They are not real
// production secrets; they prove that Moda-owned telemetry never captures
// sensitive admin/tenant/credential values.
const FORBIDDEN_VALUES = [
  'admin-secret-value',
  'fetch-secret-value',
  'tenant_data',
  'postgres:postgres',
];

// Production command exercised by `npm start`. The focused tests spawn this
// exact command; the fixture preload substitutes only the preload module so
// Undici/fetch client spans can be observed end to end.
const PRELOAD_MODULE = './observability.mjs';
const FIXTURE_PRELOAD_MODULE =
  './tests/observability/fixtures/probe-preload.mjs';
const NEXT_CLI = './node_modules/next/dist/bin/next';

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function waitForServer(baseUrl, { timeoutMs = 90_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}${HEALTH_PATH}?${SECRET_QUERY}`);
      return response;
    } catch (error) {
      lastError = error;
      await new Promise((resolveWait) => setTimeout(resolveWait, 300));
    }
  }
  throw new Error(`Next server did not become ready: ${String(lastError)}`);
}

function terminate(child) {
  return new Promise((resolveExit) => {
    if (child.exitCode !== null) {
      return resolveExit();
    }
    child.once('exit', () => resolveExit());
    child.kill('SIGTERM');
    const forceKill = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        // already gone
      }
    }, 8_000);
    forceKill.unref();
  });
}

function collectOutput(child) {
  let output = '';
  const capture = (chunk) => {
    output += chunk.toString();
    if (output.length > 200_000) {
      output = output.slice(-100_000);
    }
  };
  child.stdout?.on('data', capture);
  child.stderr?.on('data', capture);
  return () => output;
}

// Spawns the production admin server with the shared observability preload and
// an in-process OTLP receiver. Returns handles plus cleanup() that terminates
// the child and closes the receiver.
async function startAdminRuntime({
  productionPreload = false,
  deadExporter = false,
} = {}) {
  const receiver = deadExporter ? null : await startOtlpReceiver();
  const appPort = await freePort();
  const baseUrl = `http://127.0.0.1:${appPort}`;

  // Never inherit the deployment OTEL environment (which may point at the
  // real Grafana gateway); the tests control every telemetry knob.
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (/^OTEL_/i.test(key)) {
      continue;
    }
    env[key] = value;
  }
  Object.assign(env, {
    NODE_ENV: 'production',
    DEPLOYMENT_ENVIRONMENT_NAME: 'test',
    DATABASE_URL,
    OTEL_TRACES_EXPORTER: 'otlp',
    OTEL_METRICS_EXPORTER: 'none',
    OTEL_BSP_SCHEDULE_DELAY: '200',
    OTEL_BSP_MAX_QUEUE_SIZE: '2048',
    OTEL_BSP_MAX_EXPORT_BATCH_SIZE: '512',
  });
  if (receiver) {
    env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = `${receiver.url}/v1/traces`;
    // The test-only fixture preload fires a bounded burst of outbound fetches
    // so Undici/fetch client spans can be observed. The other tests use the
    // exact production preload.
    if (!productionPreload) {
      env.TELEMETRY_PROBE_TARGET = `${receiver.url}${PROBE_TARGET_PATH}?${FETCH_SECRET_QUERY}`;
    }
  } else if (deadExporter) {
    // Closed port: the OTLP exporter fails and retries in the background for
    // the exporter failure isolation test.
    env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = 'http://127.0.0.1:1/v1/traces';
  }

  const preload = productionPreload ? PRELOAD_MODULE : FIXTURE_PRELOAD_MODULE;
  const child = spawn(
    process.execPath,
    [
      '--import',
      preload,
      NEXT_CLI,
      'start',
      '-p',
      String(appPort),
      '-H',
      '127.0.0.1',
    ],
    {
      cwd: adminRoot,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const getOutput = collectOutput(child);

  return {
    receiver,
    child,
    baseUrl,
    getOutput,
    async cleanup() {
      await terminate(child);
      if (receiver) {
        await receiver.close();
      }
    },
  };
}

function describeFailure(error, receiver, getOutput) {
  const output = getOutput().slice(-6_000);
  const requestLines = (receiver?.requests ?? [])
    .map(
      (request) =>
        `${request.method} ${request.url} (${request.bodyLength} bytes, ${request.contentType}, ${request.contentEncoding ?? 'no-encoding'})`,
    )
    .join('\n');
  const errorLines = (receiver?.errors ?? [])
    .map((entry) => `--- decode error ---\n${entry.error}`)
    .join('\n');
  error.message += `\n--- child output (tail) ---\n${output}\n--- receiver requests ---\n${requestLines || '(none)'}\n${errorLines}`;
  return error;
}

test(
  'production start preloads the shared runtime and exports safe telemetry',
  {
    timeout: 180_000,
    skip: existsSync(nextBuildId)
      ? false
      : 'run `npm run build` first (.next/BUILD_ID missing)',
  },
  async () => {
    const { receiver, baseUrl, getOutput, cleanup } = await startAdminRuntime();

    try {
      const healthResponse = await waitForServer(baseUrl);
      assert.ok(
        healthResponse.status === 200 || healthResponse.status === 503,
        `health route should serve 200 or 503 while telemetry is active, got ${healthResponse.status}`,
      );

      await receiver.waitFor(
        (state) =>
          state.spans.some(
            (span) => span.attributes['url.path'] === HEALTH_PATH,
          ) &&
          state.spans.some(
            (span) =>
              span.name === 'GET' &&
              span.attributes['url.path'] === PROBE_TARGET_PATH,
          ) &&
          state.spans.some((span) => String(span.name).startsWith('prisma:')),
        { message: 'HTTP, Undici and Prisma spans', timeoutMs: 45_000 },
      );

      const spans = receiver.spans;
      const resource = receiver.resource?.attributes ?? {};

      // Canonical shared-runtime resource identity.
      assert.equal(resource['service.name'], 'moda-interact-admin');
      assert.equal(resource['service.namespace'], 'moda-interact');
      assert.equal(resource['deployment.environment.name'], 'test');

      // HTTP server instrumentation captured the inbound health request.
      const healthSpans = spans.filter(
        (span) => span.attributes['url.path'] === HEALTH_PATH,
      );
      assert.ok(healthSpans.length > 0, 'expected HTTP server spans');

      // Undici/fetch instrumentation captured the outbound probe request.
      const fetchSpans = spans.filter(
        (span) =>
          span.name === 'GET' &&
          span.attributes['url.path'] === PROBE_TARGET_PATH,
      );
      assert.ok(fetchSpans.length > 0, 'expected Undici/fetch client spans');

      // Prisma instrumentation captured the database health query.
      const prismaSpans = spans.filter((span) =>
        String(span.name).startsWith('prisma:'),
      );
      assert.ok(prismaSpans.length > 0, 'expected Prisma spans');

      // Moda-owned telemetry safety. The admin repository creates no
      // Moda-owned spans or metrics (verified structurally by the ownership
      // tests: `src/` has no @opentelemetry/api/tracer/meter usage and the
      // preload only calls initNodeObservability). The only telemetry the admin
      // process contributes is the canonical resource configuration, which
      // must carry no sensitive values.
      for (const [key, value] of Object.entries(resource)) {
        const rendered = String(value);
        for (const forbidden of FORBIDDEN_VALUES) {
          assert.ok(
            !rendered.includes(forbidden),
            `resource attribute "${key}" leaked sensitive value`,
          );
        }
      }

      // Connection credentials are prohibited in all telemetry regardless of
      // ownership. The local database DSN must not appear on any exported span
      // attribute.
      for (const span of spans) {
        for (const [key, value] of Object.entries(span.attributes)) {
          assert.ok(
            !String(value).includes('postgres:postgres'),
            `span "${span.name}" attribute "${key}" leaked DB connection credentials`,
          );
        }
      }

      // The shared runtime's own requestHooks strip query strings from
      // url.* attributes (admin performs no local rewriting).
      for (const span of healthSpans) {
        assert.equal(span.attributes['url.query'], '');
        assert.ok(
          !String(span.attributes['url.full'] ?? '').includes('?'),
          `http url.full must not contain a query string: ${span.attributes['url.full']}`,
        );
        assert.ok(
          !String(span.attributes['url.path'] ?? '').includes('?'),
          'http url.path must not contain a query string',
        );
      }
      for (const span of fetchSpans) {
        assert.equal(span.attributes['url.query'], '');
        assert.equal(
          span.attributes['url.full'],
          `${receiver.url}${PROBE_TARGET_PATH}`,
          'undici url.full must be rebuilt without the query string',
        );
      }

      // If approved Prisma instrumentation includes SQL text, it must not
      // expose connection credentials or parameter values. SQL-text
      // attributes are optional and are not required for the Prisma span
      // contract.
      const statements = prismaSpans
        .flatMap((span) => [
          span.attributes['db.statement'],
          span.attributes['db.query.text'],
        ])
        .filter((value) => typeof value === 'string');
      for (const statement of statements) {
        for (const forbidden of FORBIDDEN_VALUES) {
          assert.ok(
            !statement.includes(forbidden),
            'Prisma telemetry must not contain sensitive values',
          );
        }
      }

      // Correctness: the health contract is unchanged by observability.
      const healthBody = await healthResponse.json();
      assert.ok(
        'database' in healthBody,
        'health body must report database state',
      );
    } catch (error) {
      throw describeFailure(error, receiver, getOutput);
    } finally {
      await cleanup();
    }
  },
);

test(
  'approved framework/OpenTelemetry telemetry passes through unchanged',
  {
    timeout: 180_000,
    skip: existsSync(nextBuildId)
      ? false
      : 'run `npm run build` first (.next/BUILD_ID missing)',
  },
  async () => {
    const sentinel = `admin-009-framework-${randomUUID()}`;
    const { receiver, baseUrl, child, getOutput, cleanup } =
      await startAdminRuntime({ productionPreload: true });

    try {
      const readiness = await waitForServer(baseUrl);
      assert.ok(
        readiness.status === 200 || readiness.status === 503,
        `health route should serve 200 or 503, got ${readiness.status}`,
      );

      // Send a request whose query string carries a unique sentinel.
      const sentinelResponse = await fetch(
        `${baseUrl}${HEALTH_PATH}?${SECRET_QUERY}&sentinel=${sentinel}`,
      );
      assert.ok(
        sentinelResponse.status === 200 || sentinelResponse.status === 503,
        `health route should serve 200 or 503, got ${sentinelResponse.status}`,
      );

      // The exported HTTP request-handling span carries the raw request target
      // (query string included) in the legacy `http.target` attribute. Under
      // the ARCH-002 telemetry ownership boundary this is trusted
      // framework/OpenTelemetry telemetry and is exported unchanged; the admin
      // process must not rewrite or reject it.
      await receiver.waitFor(
        (state) =>
          state.spans.some((span) =>
            String(span.attributes['http.target'] ?? '').includes(sentinel),
          ),
        {
          message: 'HTTP span carrying the sentinel in http.target',
          timeoutMs: 45_000,
        },
      );

      const leakingSpan = receiver.spans.find((span) =>
        String(span.attributes['http.target'] ?? '').includes(sentinel),
      );
      assert.ok(leakingSpan, 'expected the http.target span');
      assert.equal(leakingSpan.attributes['http.method'], 'GET');
      assert.ok(
        String(leakingSpan.attributes['http.target'] ?? '').startsWith(
          `${HEALTH_PATH}?`,
        ),
        'http.target must be the raw request target',
      );
      assert.equal(
        receiver.resource?.attributes?.['service.name'],
        'moda-interact-admin',
        'span is exported through the shared runtime SDK under the admin service',
      );
      assert.equal(
        child.exitCode,
        null,
        'server must stay alive while exporting framework telemetry',
      );

      // On the same requests, the shared runtime's own HttpInstrumentation
      // requestHook still records sanitized url.* attributes. The admin
      // process performs no rewriting of either attribute set.
      const sanitizedSpans = receiver.spans.filter(
        (span) => span.attributes['url.path'] === HEALTH_PATH,
      );
      assert.ok(sanitizedSpans.length > 0, 'expected sanitized HTTP spans');
      for (const span of sanitizedSpans) {
        assert.equal(span.attributes['url.query'], '');
        assert.ok(
          !String(span.attributes['url.full'] ?? '').includes('?'),
          `url.full must be sanitized by the shared runtime: ${span.attributes['url.full']}`,
        );
      }
    } catch (error) {
      throw describeFailure(error, receiver, getOutput);
    } finally {
      await cleanup();
    }
  },
);

test(
  'exporter/backend failure does not break valid admin requests',
  {
    timeout: 180_000,
    skip: existsSync(nextBuildId)
      ? false
      : 'run `npm run build` first (.next/BUILD_ID missing)',
  },
  async () => {
    // The OTLP trace exporter points at a closed port (127.0.0.1:1), so every
    // batch export fails and retries in the background. The admin service must
    // keep serving valid requests and must not crash or reject them because
    // telemetry export failed.
    const { baseUrl, child, getOutput, cleanup } = await startAdminRuntime({
      productionPreload: true,
      deadExporter: true,
    });

    try {
      const healthResponse = await waitForServer(baseUrl);
      assert.ok(
        healthResponse.status === 200 || healthResponse.status === 503,
        `health route should serve 200 or 503, got ${healthResponse.status}`,
      );
      const healthBody = await healthResponse.json();
      assert.ok(
        'database' in healthBody,
        'health body must report database state',
      );

      // Give the exporter time to fail and retry, then confirm valid requests
      // are still served.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await new Promise((resolveWait) => setTimeout(resolveWait, 400));
        const response = await fetch(`${baseUrl}${HEALTH_PATH}`);
        assert.ok(
          response.status === 200 || response.status === 503,
          `health route should serve 200 or 503, got ${response.status}`,
        );
      }

      assert.equal(
        child.exitCode,
        null,
        'server must stay alive despite exporter failures',
      );
    } catch (error) {
      throw describeFailure(error, null, getOutput);
    } finally {
      await cleanup();
    }
  },
);
