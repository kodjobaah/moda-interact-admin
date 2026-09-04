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
  return import(`${sourcePath('src/lib/admin/queue-monitor.ts')}?test=${Date.now()}`);
}

test('uses the canonical Shopify contracts for exactly two queue readers', async () => {
  const { getQueueMonitorDefinitions } = await importQueueMonitor();

  assert.deepEqual(getQueueMonitorDefinitions(), [
    {
      queueName: 'checkout-events',
      jobNames: ['checkout-created', 'checkout-updated'],
    },
    {
      queueName: 'order-events',
      jobNames: ['order-completed'],
    },
  ]);
});

test('maps bounded queue state and latest activity without payload data', async () => {
  const { readQueueMonitorSnapshot } = await importQueueMonitor();
  const queueCalls = [];
  const queueFactory = (queueName) => ({
    toKey: (type) => {
      assert.equal(type, 'events');
      return `bull:${queueName}:events`;
    },
    getJobCounts: async (...types) => {
      queueCalls.push([queueName, ...types]);
      return { waiting: 2, active: 3, delayed: 4, failed: 5 };
    },
    getWorkersCount: async () => 1,
  });
  const redisFactory = () => ({
    xrevrange: async (key, end, start, countToken, count) => {
      assert.match(key, /^bull:.*:events$/);
      assert.equal(end, '+');
      assert.equal(start, '-');
      assert.equal(countToken, 'COUNT');
      assert.equal(count, '1');
      return [['1710000000000-0', ['event', 'completed', 'jobId', 'secret-job-id', 'data', 'secret-payload']]];
    },
  });

  const snapshot = await readQueueMonitorSnapshot({
    redisUrl: 'redis://test.invalid',
    queueFactory,
    redisFactory,
    now: () => new Date('2026-09-04T16:00:00.000Z'),
  });

  assert.equal(queueCalls.length, 2);
  assert.deepEqual(snapshot, {
    observedAt: '2026-09-04T16:00:00.000Z',
    queues: [
      {
        queueName: 'checkout-events',
        jobNames: ['checkout-created', 'checkout-updated'],
        counts: { waiting: 2, active: 3, delayed: 4, failed: 5, workers: 1 },
        lastActivity: { event: 'completed', observedAt: '2024-03-09T16:00:00.000Z' },
      },
      {
        queueName: 'order-events',
        jobNames: ['order-completed'],
        counts: { waiting: 2, active: 3, delayed: 4, failed: 5, workers: 1 },
        lastActivity: { event: 'completed', observedAt: '2024-03-09T16:00:00.000Z' },
      },
    ],
  });
  assert.equal(JSON.stringify(snapshot).includes('secret-payload'), false);
  assert.equal(JSON.stringify(snapshot).includes('secret-job-id'), false);
});

test('missing Redis configuration is a bounded unavailable result', async () => {
  const { QueueMonitorUnavailableError, readQueueMonitorSnapshot } = await importQueueMonitor();
  await assert.rejects(
    readQueueMonitorSnapshot({ redisUrl: '' }),
    QueueMonitorUnavailableError,
  );
});

test('queue API authorizes before accessing the Redis snapshot reader', async () => {
  const routeSource = await readFile(sourcePath('src/app/api/admin/queues/route.ts'), 'utf8');
  assert.ok(routeSource.indexOf('await requirePlatformAdminRead()') < routeSource.indexOf('readQueueMonitorSnapshot()'));
  assert.match(routeSource, /status: 401/);
  assert.match(routeSource, /status: 503/);
  assert.doesNotMatch(routeSource, /REDIS_URL|connectionString|stack/);
});