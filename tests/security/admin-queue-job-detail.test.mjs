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
  return import(`${sourcePath('src/lib/admin/queue-monitor.ts')}?detail-jobs-test=${Date.now()}-${Math.random()}`);
}

function queueFactory(job, state) {
  return () => ({
    waitUntilReady: async () => undefined,
    getJob: async () => job,
    getJobState: async () => state,
  });
}

test('normalizes active detail with the same shop projection as list rows', async () => {
  const { readQueueJobDetail } = await importQueueMonitor();
  const detail = await readQueueJobDetail({
    redisUrl: 'redis://active-detail-jobs.test.invalid',
    queueName: 'checkout-events',
    status: 'active',
    jobId: 'active-123',
    queueFactory: queueFactory({
      id: 'active-123',
      name: 'checkout-created',
      attemptsMade: 2,
      timestamp: 1710000000000,
      processedOn: 1710000001000,
      finishedOn: 1710000002000,
      failedReason: 'must not be returned for active',
      stacktrace: ['must not be returned for active'],
      data: { tenant: { shopDomain: ' Alpha.MyShopify.com ' }, orderId: 'order-123' },
    }, 'active'),
  });

  assert.deepEqual(detail, {
    id: 'active-123',
    queueName: 'checkout-events',
    name: 'checkout-created',
    status: 'active',
    shop: 'alpha.myshopify.com',
    attemptsMade: 2,
    timestamp: '2024-03-09T16:00:00.000Z',
    processedOn: '2024-03-09T16:00:01.000Z',
    finishedOn: '2024-03-09T16:00:02.000Z',
    failedReason: '',
    stacktrace: ['must not be returned for active'],
    data: { tenant: { shopDomain: ' Alpha.MyShopify.com ' }, orderId: 'order-123' },
  });
});

test('keeps failed detail inspectable through the generic reader', async () => {
  const { readQueueJobDetail } = await importQueueMonitor();
  const detail = await readQueueJobDetail({
    redisUrl: 'redis://failed-detail-jobs.test.invalid',
    queueName: 'order-events',
    status: 'failed',
    jobId: 'failed-123',
    queueFactory: queueFactory({
      id: 'failed-123',
      name: 'order-completed',
      attemptsMade: 3,
      finishedOn: 1710000002000,
      failedReason: 'order failed',
      stacktrace: ['Error: order failed'],
      data: { tenant: { shopDomain: 'beta.myshopify.com' } },
    }, 'failed'),
  });

  assert.equal(detail.status, 'failed');
  assert.equal(detail.shop, 'beta.myshopify.com');
  assert.equal(detail.failedReason, 'order failed');
  assert.deepEqual(detail.stacktrace, ['Error: order failed']);
});

test('returns safe not-found for state races and rejects unsupported status', async () => {
  const { InvalidQueueJobQueryError, QueueJobNotFoundError, readQueueJobDetail } = await importQueueMonitor();
  const options = {
    redisUrl: 'redis://race-detail-jobs.test.invalid',
    queueName: 'checkout-events',
    jobId: 'job-123',
    queueFactory: queueFactory({ id: 'job-123', name: 'checkout-created', attemptsMade: 1 }, 'active'),
  };

  await assert.rejects(readQueueJobDetail({ ...options, status: 'failed' }), QueueJobNotFoundError);
  await assert.rejects(readQueueJobDetail({ ...options, status: 'waiting' }), InvalidQueueJobQueryError);
  await assert.rejects(readQueueJobDetail({ ...options }), InvalidQueueJobQueryError);
});

test('generic detail API authorizes first and exposes safe errors', async () => {
  const routeSource = await readFile(sourcePath('src/app/api/admin/queues/jobs/detail/route.ts'), 'utf8');
  assert.ok(routeSource.indexOf('await requirePlatformAdminRead()') < routeSource.indexOf('readQueueJobDetail('));
  assert.match(routeSource, /status: 401/);
  assert.match(routeSource, /status: 400/);
  assert.match(routeSource, /status: 404/);
  assert.match(routeSource, /status: 503/);
  assert.match(routeSource, /Cache-Control.*no-store/);
  assert.doesNotMatch(routeSource, /REDIS_URL|connectionString|process\.env/);
});