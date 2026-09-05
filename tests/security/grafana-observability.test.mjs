import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import path from 'node:path';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const sourcePath = (relativePath) => path.join(repositoryRoot, relativePath);

async function loadNavigation(environment, variables) {
  process.env.DEPLOYMENT_ENVIRONMENT_NAME = environment;
  process.env.NODE_ENV = environment;
  for (const name of [
    'GRAFANA_BASE_URL',
    'GRAFANA_PLATFORM_DASHBOARD_URL',
    'GRAFANA_LOGS_URL',
    'GRAFANA_TRACES_URL',
    'GRAFANA_METRICS_URL',
  ]) {
    delete process.env[name];
  }
  Object.assign(process.env, variables);
  const { getGrafanaNavigation } = await import(
    '../../src/lib/observability/grafana.ts'
  );
  return getGrafanaNavigation();
}

test('Grafana navigation accepts isolated HTTPS destinations and labels environment', async () => {
  const navigation = await loadNavigation('production', {
    GRAFANA_BASE_URL: 'https://production.grafana.net',
    GRAFANA_PLATFORM_DASHBOARD_URL: 'https://production.grafana.net/d/platform',
    GRAFANA_LOGS_URL: 'https://production.grafana.net/explore/logs',
  });

  assert.equal(navigation.environment, 'production');
  assert.equal(navigation.configured, true);
  assert.deepEqual(
    navigation.links.map(({ label, href }) => ({ label, href })),
    [
      { label: 'Platform dashboard', href: 'https://production.grafana.net/d/platform' },
      { label: 'Logs', href: 'https://production.grafana.net/explore/logs' },
    ],
  );
});

test('Grafana navigation rejects unsafe, malformed, credentialed, and unknown-environment URLs', async () => {
  const navigation = await loadNavigation('production', {
    GRAFANA_BASE_URL: 'http://grafana.internal',
    GRAFANA_PLATFORM_DASHBOARD_URL: 'javascript:alert(1)',
    GRAFANA_LOGS_URL: 'https://user:password@grafana.net/logs',
    GRAFANA_TRACES_URL: 'not a URL',
    GRAFANA_METRICS_URL: 'https://grafana.net/metrics',
  });

  assert.equal(navigation.configured, true);
  assert.deepEqual(navigation.links.map(({ label }) => label), ['Metrics']);

  const unknown = await loadNavigation('preview', {
    GRAFANA_BASE_URL: 'https://grafana.net',
    GRAFANA_PLATFORM_DASHBOARD_URL: 'https://grafana.net/d/platform',
  });
  assert.equal(unknown.configured, false);
  assert.deepEqual(unknown.links, []);
});

test('Grafana navigation permits HTTP only for local development and reports unavailable state', async () => {
  const development = await loadNavigation('development', {
    GRAFANA_BASE_URL: 'http://localhost:3001',
    GRAFANA_PLATFORM_DASHBOARD_URL: 'http://127.0.0.1:3001/d/platform',
  });
  assert.equal(development.configured, true);
  assert.equal(development.links.length, 1);

  const unavailable = await loadNavigation('test', {});
  assert.equal(unavailable.environment, 'test');
  assert.equal(unavailable.configured, false);
  assert.equal(unavailable.links.length, 0);
});

test('observability page keeps the platform-admin guard and has no screenshot dependency', async () => {
  const pageSource = await readFile(
    sourcePath('src/app/(protected)/observability/page.tsx'),
    'utf8',
  );
  const panelSource = await readFile(
    sourcePath('src/components/admin/observability-panel.tsx'),
    'utf8',
  );

  assert.match(pageSource, /await requirePlatformAdminPage\(\)/);
  assert.match(pageSource, /getGrafanaNavigation/);
  assert.doesNotMatch(panelSource, /grafana-dashboard\.png/);
  assert.match(panelSource, /target="_blank"/);
  assert.match(panelSource, /rel="noopener noreferrer"/);
  assert.doesNotMatch(panelSource, /<iframe/);
});

test('Shopify Queues has a protected route and the Tenant Directory no longer mounts diagnostics', async () => {
  const queuePageSource = await readFile(
    sourcePath('src/app/(protected)/observability/queues/page.tsx'),
    'utf8',
  );
  const tenantPageSource = await readFile(
    sourcePath('src/app/(protected)/page.tsx'),
    'utf8',
  );
  const panelSource = await readFile(
    sourcePath('src/components/admin/observability-panel.tsx'),
    'utf8',
  );

  assert.match(queuePageSource, /await requirePlatformAdminPage\(\)/);
  assert.match(queuePageSource, /QueueMonitor/);
  assert.doesNotMatch(tenantPageSource, /components\/admin\/queue-monitor/);
  assert.doesNotMatch(tenantPageSource, /<QueueMonitor/);
  assert.doesNotMatch(panelSource, /Shopify Queues/);
  assert.doesNotMatch(panelSource, /Open Shopify Queues/);
});
