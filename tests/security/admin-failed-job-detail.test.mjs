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

function importQueueMonitor() {
  return import(`${sourcePath('src/lib/admin/queue-monitor.ts')}?detail-test=${Date.now()}`);
}

test('normalizes an approved selected job to a plain diagnostic model', async () => {
  const { readFailedJobDetail } = await importQueueMonitor();
  const calls = [];
  const detail = await readFailedJobDetail({
    redisUrl: 'redis://failed-detail.test.invalid',
    queueName: 'checkout-events',
    jobId: 'job-123',
    queueFactory: () => ({
      waitUntilReady: async () => calls.push('ready'),
      getJob: async (jobId) => {
        calls.push(`job:${jobId}`);
        return {
          id: jobId,
          name: 'checkout-created',
          attemptsMade: 3,
          timestamp: 1710000000000,
          processedOn: 1710000001000,
          finishedOn: 1710000002000,
          failedReason: 'checkout failed',
          stacktrace: ['Error: checkout failed'],
          data: { orderId: 'order-123' },
        };
      },
      getJobState: async (jobId) => {
        calls.push(`state:${jobId}`);
        return 'failed';
      },
    }),
  });

  assert.deepEqual(calls, ['ready', 'job:job-123', 'state:job-123']);
  assert.deepEqual(detail, {
    id: 'job-123',
    queueName: 'checkout-events',
    name: 'checkout-created',
    state: 'failed',
    attemptsMade: 3,
    timestamp: '2024-03-09T16:00:00.000Z',
    processedOn: '2024-03-09T16:00:01.000Z',
    finishedOn: '2024-03-09T16:00:02.000Z',
    failedReason: 'checkout failed',
    stacktrace: ['Error: checkout failed'],
    data: { orderId: 'order-123' },
  });
});

test('rejects unknown queues and missing jobs safely', async () => {
  const { FailedJobNotFoundError, InvalidFailedJobQueryError, readFailedJobDetail } = await importQueueMonitor();
  const options = {
    redisUrl: 'redis://failed-detail.test.invalid',
    queueFactory: () => ({
      waitUntilReady: async () => undefined,
      getJob: async () => undefined,
      getJobState: async () => 'unknown',
    }),
  };
  await assert.rejects(readFailedJobDetail({ ...options, queueName: 'arbitrary-queue', jobId: 'job-1' }), InvalidFailedJobQueryError);
  await assert.rejects(readFailedJobDetail({ ...options, queueName: 'checkout-events', jobId: 'missing' }), FailedJobNotFoundError);
});

test('rejects an existing non-failed job without returning its diagnostics', async () => {
  const { FailedJobNotFoundError, readFailedJobDetail } = await importQueueMonitor();
  await assert.rejects(readFailedJobDetail({
    redisUrl: 'redis://active-detail.test.invalid',
    queueName: 'checkout-events',
    jobId: 'active-job',
    queueFactory: () => ({
      waitUntilReady: async () => undefined,
      getJob: async () => ({
        id: 'active-job',
        name: 'checkout-created',
        attemptsMade: 1,
        failedReason: 'must not be returned',
        stacktrace: ['must not be returned'],
        data: { secret: 'must not be returned' },
      }),
      getJobState: async () => 'active',
    }),
  }), FailedJobNotFoundError);
});

test('detail API authorizes first and returns bounded safe error responses', async () => {
  const routeSource = await readFile(sourcePath('src/app/api/admin/queues/failed/detail/route.ts'), 'utf8');
  assert.ok(routeSource.indexOf('await requirePlatformAdminRead()') < routeSource.indexOf('readFailedJobDetail('));
  assert.match(routeSource, /status: 401/);
  assert.match(routeSource, /status: 400/);
  assert.match(routeSource, /status: 404/);
  assert.match(routeSource, /status: 503/);
  assert.match(routeSource, /Cache-Control.*no-store/);
  assert.doesNotMatch(routeSource, /REDIS_URL|connectionString|process\.env|stacktrace|data/);
});