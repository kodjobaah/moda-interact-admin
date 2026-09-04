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
  return import(`${sourcePath('src/lib/admin/queue-monitor.ts')}?jobs-test=${Date.now()}-${Math.random()}`);
}

function queueFactory(jobsByStatus) {
  return () => ({
    waitUntilReady: async () => undefined,
    getJobs: async (status) => jobsByStatus[status] ?? [],
  });
}

test('projects only documented Shopify tenant shop domains', async () => {
  const { extractQueueJobShop } = await importQueueMonitor();

  assert.equal(
    extractQueueJobShop(
      'checkout-events',
      'checkout-created',
      { tenant: { shopDomain: ' Alpha.MyShopify.com ' } },
    ),
    'alpha.myshopify.com',
  );
  assert.equal(
    extractQueueJobShop(
      'checkout-events',
      'checkout-created',
      { shop: 'alpha.myshopify.com' },
    ),
    null,
  );
  assert.equal(
    extractQueueJobShop(
      'pending-recovery-candidates',
      'Pending recovery candidates',
      { shopId: 'shop_1' },
    ),
    null,
  );
  assert.equal(
    extractQueueJobShop(
      'checkout-events',
      'checkout-created',
      { tenant: { shopDomain: 'not a domain' } },
    ),
    null,
  );
});

test('reads failed and active jobs with shop facets and redacted list fields', async () => {
  const { readQueueJobSnapshot } = await importQueueMonitor();
  const snapshot = await readQueueJobSnapshot({
    redisUrl: 'redis://queue-jobs.test.invalid',
    queueName: 'checkout-events',
    queueFactory: queueFactory({
      failed: [
        {
          id: 'failed-1',
          name: 'checkout-created',
          attemptsMade: 2,
          finishedOn: 1710000002000,
          data: { tenant: { shopDomain: 'alpha.myshopify.com' } },
          failedReason: 'safe reason',
          stacktrace: ['secret stack'],
        },
        {
          id: 'failed-2',
          name: 'checkout-created',
          attemptsMade: 1,
          timestamp: 1710000001000,
          data: { unexpected: 'orphan' },
        },
      ],
      active: [
        {
          id: 'active-1',
          name: 'checkout-updated',
          attemptsMade: 1,
          processedOn: 1710000003000,
          data: { tenant: { shopDomain: 'beta.myshopify.com' } },
        },
      ],
    }),
  });

  assert.equal(snapshot.status, 'failed');
  assert.equal(snapshot.shop, '*');
  assert.equal(snapshot.direction, 'desc');
  assert.equal(snapshot.knownTotal, 2);
  assert.equal(snapshot.scanTruncated, false);
  assert.equal(snapshot.hasNext, false);
  assert.deepEqual(snapshot.jobs.map((job) => [job.id, job.shop, job.eventAt]), [
    ['failed-1', 'alpha.myshopify.com', '2024-03-09T16:00:02.000Z'],
    ['failed-2', null, '2024-03-09T16:00:01.000Z'],
  ]);
  assert.deepEqual(snapshot.facets.shops, [
    { value: 'alpha.myshopify.com', label: 'alpha.myshopify.com' },
    { value: 'beta.myshopify.com', label: 'beta.myshopify.com' },
  ]);
  assert.equal(snapshot.facets.hasOrphans, true);
  assert.equal(JSON.stringify(snapshot).includes('secret stack'), false);
  assert.equal(JSON.stringify(snapshot).includes('data'), false);
});

test('filters orphan and concrete shops before bounded pagination', async () => {
  const { readQueueJobSnapshot } = await importQueueMonitor();
  const options = {
    redisUrl: 'redis://queue-jobs-filter.test.invalid',
    queueName: 'order-events',
    queueFactory: queueFactory({
      failed: [
        { id: 'alpha', name: 'order-completed', attemptsMade: 1, finishedOn: 1710000001000, data: { tenant: { shopDomain: 'alpha.myshopify.com' } } },
        { id: 'orphan', name: 'order-completed', attemptsMade: 1, finishedOn: 1710000002000, data: {} },
      ],
      active: [
        { id: 'active-alpha', name: 'order-completed', attemptsMade: 1, processedOn: 1710000003000, data: { tenant: { shopDomain: 'alpha.myshopify.com' } } },
      ],
    }),
  };

  const orphanSnapshot = await readQueueJobSnapshot({ ...options, shop: '__orphan__' });
  assert.deepEqual(orphanSnapshot.jobs.map((job) => job.id), ['orphan']);

  const concreteSnapshot = await readQueueJobSnapshot({
    ...options,
    shop: 'ALPHA.MYSHOPIFY.COM',
    limit: '1',
    page: '2',
  });
  assert.deepEqual(concreteSnapshot.jobs, []);
  assert.equal(concreteSnapshot.knownTotal, 1);
  assert.equal(concreteSnapshot.hasPrevious, true);
  assert.equal(concreteSnapshot.hasNext, false);

  const activeSnapshot = await readQueueJobSnapshot({ ...options, status: 'active' });
  assert.equal(activeSnapshot.jobs[0].status, 'active');
  assert.equal(activeSnapshot.jobs[0].eventAt, '2024-03-09T16:00:03.000Z');
});

test('rejects unsupported statuses, malformed shops, and unbounded queries', async () => {
  const { InvalidQueueJobQueryError, readQueueJobSnapshot } = await importQueueMonitor();
  const options = {
    redisUrl: 'redis://queue-jobs-invalid.test.invalid',
    queueName: 'checkout-events',
    queueFactory: () => {
      throw new Error('Redis must not be accessed');
    },
  };

  await assert.rejects(readQueueJobSnapshot({ ...options, status: 'waiting' }), InvalidQueueJobQueryError);
  await assert.rejects(readQueueJobSnapshot({ ...options, shop: 'not a domain' }), InvalidQueueJobQueryError);
  await assert.rejects(readQueueJobSnapshot({ ...options, limit: '51' }), InvalidQueueJobQueryError);
});

test('generic queue-job API authorizes first and exposes safe errors', async () => {
  const routeSource = await readFile(sourcePath('src/app/api/admin/queues/jobs/route.ts'), 'utf8');
  assert.ok(routeSource.indexOf('await requirePlatformAdminRead()') < routeSource.indexOf('readQueueJobSnapshot('));
  assert.match(routeSource, /status: 401/);
  assert.match(routeSource, /status: 400/);
  assert.match(routeSource, /status: 503/);
  assert.match(routeSource, /Cache-Control.*no-store/);
  assert.doesNotMatch(routeSource, /REDIS_URL|connectionString|stacktrace|data/);
});