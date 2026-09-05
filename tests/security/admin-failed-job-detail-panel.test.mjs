import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { test } from 'node:test';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const sourcePath = (relativePath) => path.join(repositoryRoot, relativePath);

test('selected queue rows load the protected normalized detail endpoint', async () => {
  const componentSource = await readFile(sourcePath('src/components/admin/queue-monitor.tsx'), 'utf8');

  assert.match(componentSource, /\/api\/admin\/queues\/jobs\/detail/);
  assert.match(componentSource, /status: queueJobStatus/);
  assert.match(componentSource, /selectedQueueName/);
  assert.match(componentSource, /selectedJobId/);
  assert.match(componentSource, /Loading queue job details/);
  assert.match(componentSource, /Selected queue job is no longer available/);
});

test('detail panel renders lifecycle, failure, stacktrace, payload and bounded diagnostic controls', async () => {
  const componentSource = await readFile(sourcePath('src/components/admin/queue-monitor.tsx'), 'utf8');

  for (const label of ['Queue', 'Job name', 'Status', 'Attempts made', 'Created', 'Processed at', 'Finished at', 'Failed reason', 'Stack trace', 'Payload / job data']) {
    assert.ok(componentSource.includes(label), `expected detail label: ${label}`);
  }
  assert.match(componentSource, /max-h-72 overflow-auto/);
  assert.match(componentSource, /navigator\.clipboard\.writeText/);
  assert.match(componentSource, /label="job ID"/);
  assert.match(componentSource, /label="stack trace"/);
  assert.match(componentSource, /label="job data"/);
});

test('detail panel remains read-only and does not expose configuration values', async () => {
  const componentSource = await readFile(sourcePath('src/components/admin/queue-monitor.tsx'), 'utf8');

  assert.doesNotMatch(componentSource, /retry|requeue|delete|pause|resume/);
  assert.doesNotMatch(componentSource, /REDIS_URL|connectionString|process\.env|authorization|accessToken/);
});