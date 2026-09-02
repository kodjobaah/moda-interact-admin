// Ownership and disable-ability tests for the shared observability runtime.
//
// - The admin repository must consume the published shared runtime through its
//   preload and must not retain a competing service-local NodeSDK / provider /
//   exporter / sampler stack.
// - Local/test hosted export must remain disableable: with
//   `OTEL_SDK_DISABLED=true`, and also when no OTLP endpoint is configured.
// - Environment identity is derived from the architecture-owned
//   `DEPLOYMENT_ENVIRONMENT_NAME` and distinguishes test from production.
// - The admin repository creates no Moda-owned spans/metrics and the preload
//   performs no local OpenTelemetry rewriting or span patching.

import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const adminRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const COMPETING_RUNTIME_PATTERNS = [
  /NodeSDK/,
  /TracerProvider/,
  /MeterProvider/,
  /OTLPTraceExporter/,
  /OTLPMetricExporter/,
  /BatchSpanProcessor/,
  /ParentBasedSampler/,
  /TraceIdRatioBasedSampler/,
  /@opentelemetry\/(sdk-|exporter-|instrumentation-)/,
];

// Moda-owned telemetry creation is prohibited: application code must not
// create spans/metrics with the OpenTelemetry API or add span attributes
// directly. All telemetry must come from the shared runtime's approved
// instrumentations or approved third-party framework instrumentation.
const MODA_OWNED_TELEMETRY_PATTERNS = [
  /@opentelemetry\/api/,
  /\bgetTracer\s*\(/,
  /\bgetMeter\s*\(/,
  /\bstartSpan\s*\(/,
  /\bcreateSpan\s*\(/,
  /\bspan\.setAttribute\s*\(/,
  /\baddSpanEvent\s*\(/,
  /\bhttp\.target/,
  /\bsanitize/i,
];

// The preload must only initialize the shared runtime. Any local provider,
// span processor, attribute rewriting or span patching here would duplicate or
// conflict with the shared runtime and is prohibited.
const PRELOAD_REWRITING_PATTERNS = [
  /TracerProvider/,
  /MeterProvider/,
  /BatchSpanProcessor/,
  /SpanProcessor/,
  /setAttribute/,
  /getTracer/,
  /getMeter/,
  /addSpanEvent/,
  /http\.target/,
  /sanitize/i,
  /patch/i,
];

// Strip inherited deployment OTEL environment (which may point at the real
// Grafana gateway) so the runtime state is fully determined by the test.
function cleanEnv(extraEnv) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (/^OTEL_/i.test(key)) {
      continue;
    }
    env[key] = value;
  }
  return { ...env, ...extraEnv };
}

function runPreload(extraEnv) {
  const script = `
    await import("./observability.mjs");
    const { getNodeObservabilityRuntime } = await import("@modainteract/moda-interact-shared/observability/node");
    const runtime = getNodeObservabilityRuntime();
    await runtime.shutdown();
    process.stdout.write(JSON.stringify(runtime));
  `;
  const stdout = execFileSync(
    process.execPath,
    ['--input-type=module', '--eval', script],
    {
      cwd: adminRoot,
      encoding: 'utf8',
      env: cleanEnv(extraEnv),
    },
  );
  return JSON.parse(stdout);
}

function collectSourceFiles(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      collectSourceFiles(fullPath, files);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(fullPath);
    }
  }
  return files;
}

test('preload initializes the canonical admin service identity', () => {
  const runtime = runPreload({
    DEPLOYMENT_ENVIRONMENT_NAME: 'test',
    OTEL_SDK_DISABLED: 'true',
  });
  assert.equal(runtime.enabled, false);
  assert.equal(runtime.serviceName, 'moda-interact-admin');
  assert.equal(runtime.environment, 'test');
});

test('hosted export stays disableable without an OTLP endpoint', () => {
  const runtime = runPreload({
    DEPLOYMENT_ENVIRONMENT_NAME: 'test',
  });
  assert.equal(runtime.enabled, false);
  assert.equal(runtime.serviceName, 'moda-interact-admin');
  assert.equal(runtime.environment, 'test');
});

test('runtime enables when an OTLP endpoint is configured', () => {
  const runtime = runPreload({
    DEPLOYMENT_ENVIRONMENT_NAME: 'test',
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://127.0.0.1:1/v1/traces',
  });
  assert.equal(runtime.enabled, true);
  assert.equal(runtime.serviceName, 'moda-interact-admin');
});

test('no competing generic provider/exporter/sampler stack exists in app code', () => {
  const srcDir = join(adminRoot, 'src');
  const files = collectSourceFiles(srcDir);
  assert.ok(files.length > 0, 'expected application source files to exist');

  const offenders = [];
  for (const file of files) {
    const contents = readFileSync(file, 'utf8');
    for (const pattern of COMPETING_RUNTIME_PATTERNS) {
      if (pattern.test(contents)) {
        offenders.push(`${relative(adminRoot, file)} matched ${pattern}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `application code must not implement a competing runtime: ${offenders.join('; ')}`,
  );
});

test('no Moda-owned span/metric creation exists in application code', () => {
  const srcDir = join(adminRoot, 'src');
  const files = collectSourceFiles(srcDir);
  assert.ok(files.length > 0, 'expected application source files to exist');

  const offenders = [];
  for (const file of files) {
    const contents = readFileSync(file, 'utf8');
    for (const pattern of MODA_OWNED_TELEMETRY_PATTERNS) {
      if (pattern.test(contents)) {
        offenders.push(`${relative(adminRoot, file)} matched ${pattern}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `application code must not create Moda-owned telemetry: ${offenders.join('; ')}`,
  );
});

test('preload performs no local telemetry rewriting or span patching', () => {
  const preload = readFileSync(join(adminRoot, 'observability.mjs'), 'utf8');
  const offenders = PRELOAD_REWRITING_PATTERNS.filter((pattern) =>
    pattern.test(preload),
  );
  assert.deepEqual(
    offenders,
    [],
    'preload must only call initNodeObservability (no local sanitizer/span patch)',
  );
});

test('environment identity distinguishes test and production', () => {
  const testRuntime = runPreload({
    DEPLOYMENT_ENVIRONMENT_NAME: 'test',
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://127.0.0.1:1/v1/traces',
  });
  const productionRuntime = runPreload({
    DEPLOYMENT_ENVIRONMENT_NAME: 'production',
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://127.0.0.1:1/v1/traces',
  });
  assert.equal(testRuntime.environment, 'test');
  assert.equal(productionRuntime.environment, 'production');
});
