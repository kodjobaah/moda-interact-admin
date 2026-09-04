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
  return import(`${sourcePath('src/lib/admin/queue-monitor.ts')}?failed-test=${Date.now()}`);
}

test('reads an allowlisted queue with bounded sorting and list-level fields only', async () => {
  const { readFailedJobSnapshot } = await importQueueMonitor();
  const calls = [];
  const snapshot = await readFailedJobSnapshot({
    redisUrl: 'redis://failed-jobs.test.invalid',
    queueName: 'checkout-events',
    limit: '2',
    sort: 'attemptsMade',
    direction: 'asc',
    queueFactory: () => ({
      waitUntilReady: async () => undefined,
      getJobs: async (...args) => {
        calls.push(args);
        return [
          { id: 'job-2', name: 'checkout-created', attemptsMade: 4, finishedOn: 1710000002000, failedReason: 'later' },
          { id: 'job-1', name: 'checkout-updated', attemptsMade: 2, finishedOn: 1710000001000, failedReason: 'first' },
        ];
      },
    }),
  });

  assert.deepEqual(calls, [['failed', 0, 999, false]]);
  assert.deepEqual(snapshot, {
    queueName: 'checkout-events',
    page: 1,
    limit: 2,
    sort: 'attemptsMade',
    direction: 'asc',
    jobs: [
      {
        id: 'job-1',
        queueName: 'checkout-events',
        name: 'checkout-updated',
        attemptsMade: 2,
        failedAt: '2024-03-09T16:00:01.000Z',
        failedReason: 'first',
      },
      {
        id: 'job-2',
        queueName: 'checkout-events',
        name: 'checkout-created',
        attemptsMade: 4,
        failedAt: '2024-03-09T16:00:02.000Z',
        failedReason: 'later',
      },
    ],
  });
  assert.equal(JSON.stringify(snapshot).includes('data'), false);
  assert.equal(JSON.stringify(snapshot).includes('stacktrace'), false);
});

test('rejects unknown queues and invalid bounds before Redis access', async () => {
  const { InvalidFailedJobQueryError, readFailedJobSnapshot } = await importQueueMonitor();
  const options = {
    redisUrl: 'redis://failed-jobs.test.invalid',
    queueFactory: () => {
      throw new Error('Redis must not be accessed');
    },
  };
  await assert.rejects(readFailedJobSnapshot({ ...options, queueName: 'arbitrary-queue' }), InvalidFailedJobQueryError);
  await assert.rejects(readFailedJobSnapshot({ ...options, queueName: 'checkout-events', limit: '51' }), InvalidFailedJobQueryError);
  await assert.rejects(readFailedJobSnapshot({ ...options, queueName: 'checkout-events', sort: 'failedReason' }), InvalidFailedJobQueryError);
});

test('defaults to the most recently failed jobs first', async () => {
  const { readFailedJobSnapshot } = await importQueueMonitor();
  const snapshot = await readFailedJobSnapshot({
    redisUrl: 'redis://failed-jobs-default.test.invalid',
    queueName: 'order-events',
    queueFactory: () => ({
      waitUntilReady: async () => undefined,
      getJobs: async () => [
        { id: 'older', name: 'order-completed', attemptsMade: 1, finishedOn: 1710000001000, failedReason: 'older' },
        { id: 'newer', name: 'order-completed', attemptsMade: 1, finishedOn: 1710000002000, failedReason: 'newer' },
      ],
    }),
  });

  assert.equal(snapshot.sort, 'failedAt');
  assert.equal(snapshot.direction, 'desc');
  assert.deepEqual(snapshot.jobs.map((job) => job.id), ['newer', 'older']);
});

test('failed-job API authorizes first and exposes only safe bounded query errors', async () => {
  const routeSource = await readFile(sourcePath('src/app/api/admin/queues/failed/route.ts'), 'utf8');
  assert.ok(routeSource.indexOf('await requirePlatformAdminRead()') < routeSource.indexOf('readFailedJobSnapshot('));
  assert.match(routeSource, /status: 401/);
  assert.match(routeSource, /status: 400/);
  assert.match(routeSource, /status: 503/);
  assert.match(routeSource, /Cache-Control.*no-store/);
  assert.doesNotMatch(routeSource, /REDIS_URL|connectionString|stacktrace|data/);
});