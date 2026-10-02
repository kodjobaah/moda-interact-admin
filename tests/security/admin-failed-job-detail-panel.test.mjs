import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { test } from 'node:test';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const sourcePath = (relativePath) => path.join(repositoryRoot, relativePath);

async function readQueueMonitorSources() {
  const moduleDirectory = sourcePath('src/components/admin/queue-monitor');
  const entries = await readdir(moduleDirectory, { withFileTypes: true });
  const modulePaths = entries
    .filter((entry) => entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name))
    .map((entry) => path.join(moduleDirectory, entry.name))
    .sort();
  const sources = await Promise.all(
    [sourcePath('src/components/admin/queue-monitor.tsx'), ...modulePaths].map(
      (filePath) => readFile(filePath, 'utf8'),
    ),
  );
  return sources.join('\n');
}

test('selected queue rows load the protected normalized detail endpoint', async () => {
  const componentSource = await readQueueMonitorSources();

  assert.match(componentSource, /\/api\/admin\/queues\/jobs\/detail/);
  assert.match(componentSource, /status: queueJobStatus/);
  assert.match(componentSource, /selectedQueueName/);
  assert.match(componentSource, /selectedJobId/);
  assert.match(componentSource, /queue\.loadingJobDetails/);
  assert.match(componentSource, /queue\.jobGone/);
});

test('detail panel renders lifecycle, failure, stacktrace, payload and bounded diagnostic controls', async () => {
  const componentSource = await readQueueMonitorSources();

  for (const key of ['queue', 'jobName', 'status', 'attemptsMade', 'created', 'processedAt', 'finishedAt', 'failedReason', 'stackTrace', 'payloadData']) {
    assert.match(componentSource, new RegExp(`queue\\.${key}`), `expected detail key: ${key}`);
  }
  assert.match(componentSource, /max-h-72 overflow-auto/);
  assert.match(componentSource, /navigator\.clipboard\.writeText/);
  assert.match(componentSource, /label=\{adminI18n\.t\("queue\.jobId"\)\}/);
  assert.match(componentSource, /label=\{adminI18n\.t\("queue\.stackTrace"\)\}/);
  assert.match(componentSource, /label=\{adminI18n\.t\("queue\.payloadData"\)\}/);
});

test('detail panel remains read-only and does not expose configuration values', async () => {
  const componentSource = await readQueueMonitorSources();

  assert.doesNotMatch(componentSource, /retry|requeue|delete|pause|resume/);
  assert.doesNotMatch(componentSource, /REDIS_URL|connectionString|process\.env|authorization|accessToken/);
});