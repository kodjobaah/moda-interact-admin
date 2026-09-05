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

test('uses the canonical Shopify contracts and observed queues for detailed readers', async () => {
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
    {
      queueName: 'pending-recovery-candidates',
      jobNames: ['Pending recovery candidates'],
    },
    {
      queueName: 'whatsapp-events',
      jobNames: ['WhatsApp events'],
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
    waitUntilReady: async () => undefined,
    getJobCounts: async (...types) => {
      queueCalls.push([queueName, ...types]);
      return { waiting: 2, active: 3, delayed: 4, failed: 5 };
    },
    getWorkersCount: async () => 1,
  });
  const redisFactory = () => ({
    waitUntilReady: async () => undefined,
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

  assert.equal(queueCalls.length, 4);
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
      {
        queueName: 'pending-recovery-candidates',
        jobNames: ['Pending recovery candidates'],
        counts: { waiting: 2, active: 3, delayed: 4, failed: 5, workers: 1 },
        lastActivity: { event: 'completed', observedAt: '2024-03-09T16:00:00.000Z' },
      },
      {
        queueName: 'whatsapp-events',
        jobNames: ['WhatsApp events'],
        counts: { waiting: 2, active: 3, delayed: 4, failed: 5, workers: 1 },
        lastActivity: { event: 'completed', observedAt: '2024-03-09T16:00:00.000Z' },
      },
    ],
  });
  assert.equal(JSON.stringify(snapshot).includes('secret-payload'), false);
  assert.equal(JSON.stringify(snapshot).includes('secret-job-id'), false);
});

test('detailed queue snapshot waits for cold queue and raw Redis readers', async () => {
  const { readQueueMonitorSnapshot } = await importQueueMonitor();
  const events = [];
  const queueFactory = (queueName) => ({
    toKey: () => `bull:${queueName}:events`,
    waitUntilReady: async () => {
      events.push(`ready:queue:${queueName}`);
    },
    getJobCounts: async () => {
      assert.ok(events.includes(`ready:queue:${queueName}`));
      assert.ok(events.includes('ready:redis'));
      events.push(`counts:${queueName}`);
      return { waiting: 0, active: 0, delayed: 0, failed: 0 };
    },
    getWorkersCount: async () => {
      assert.ok(events.includes(`ready:queue:${queueName}`));
      assert.ok(events.includes('ready:redis'));
      return 0;
    },
  });
  const redisFactory = () => ({
    waitUntilReady: async () => {
      events.push('ready:redis');
    },
    xrevrange: async () => {
      assert.ok(events.includes('ready:redis'));
      return [];
    },
  });

  await readQueueMonitorSnapshot({
    redisUrl: 'redis://cold-detailed-readiness.test.invalid',
    queueFactory,
    redisFactory,
  });
});

test('missing Redis configuration is a bounded unavailable result', async () => {
  const { QueueMonitorUnavailableError, readQueueMonitorSnapshot } = await importQueueMonitor();
  await assert.rejects(
    readQueueMonitorSnapshot({ redisUrl: '' }),
    QueueMonitorUnavailableError,
  );
});

test('failed detailed readers are recreated for a later healthy refresh', async () => {
  const { readQueueMonitorSnapshot } = await importQueueMonitor();
  let shouldFail = true;
  let factoryCalls = 0;
  const queueFactory = (queueName) => {
    factoryCalls += 1;
    return {
      toKey: () => `bull:${queueName}:events`,
      waitUntilReady: async () => {
        if (shouldFail) throw new Error('transient reader failure');
      },
      getJobCounts: async () => ({ waiting: 0, active: 0, delayed: 0, failed: 0 }),
      getWorkersCount: async () => 0,
    };
  };
  const redisFactory = () => ({
    waitUntilReady: async () => undefined,
    xrevrange: async () => [],
  });

  await assert.rejects(
    readQueueMonitorSnapshot({ redisUrl: 'redis://cache-recovery.test', queueFactory, redisFactory }),
    (error) => error.name === 'QueueMonitorUnavailableError',
  );
  shouldFail = false;
  const snapshot = await readQueueMonitorSnapshot({
    redisUrl: 'redis://cache-recovery.test',
    queueFactory,
    redisFactory,
  });

  assert.equal(snapshot.queues.length, 4);
  assert.equal(factoryCalls, 8);
});

test('queue overview reads active counts for the four observed queues only', async () => {
  const { getQueueOverviewDefinitions, readQueueOverviewSnapshot } = await importQueueMonitor();
  assert.deepEqual(getQueueOverviewDefinitions(), [
    { queueName: 'checkout-events', label: 'Checkout Events' },
    { queueName: 'order-events', label: 'Order Events' },
    { queueName: 'pending-recovery-candidates', label: 'Pending Recoveries' },
    { queueName: 'whatsapp-events', label: 'WhatsApp Events' },
  ]);

  const calls = [];
  const snapshot = await readQueueOverviewSnapshot({
    redisUrl: 'redis://test.invalid',
    queueFactory: (queueName) => ({
      waitUntilReady: async () => undefined,
      getJobCounts: async (...types) => {
        calls.push([queueName, ...types]);
        return { active: queueName.length };
      },
    }),
    redisFactory: () => {
      throw new Error('overview must not create a raw Redis reader');
    },
    now: () => new Date('2026-09-04T16:00:00.000Z'),
  });

  assert.deepEqual(calls, [
    ['checkout-events', 'active'],
    ['order-events', 'active'],
    ['pending-recovery-candidates', 'active'],
    ['whatsapp-events', 'active'],
  ]);
  assert.deepEqual(snapshot, {
    observedAt: '2026-09-04T16:00:00.000Z',
    queues: [
      { queueName: 'checkout-events', label: 'Checkout Events', active: 15 },
      { queueName: 'order-events', label: 'Order Events', active: 12 },
      { queueName: 'pending-recovery-candidates', label: 'Pending Recoveries', active: 27 },
      { queueName: 'whatsapp-events', label: 'WhatsApp Events', active: 15 },
    ],
  });
  assert.equal('failed' in snapshot.queues[0], false);
});

test('queue overview waits for cold readers before requesting active counts', async () => {
  const { readQueueOverviewSnapshot } = await importQueueMonitor();
  const events = [];

  await readQueueOverviewSnapshot({
    redisUrl: 'redis://cold-readiness.test.invalid',
    queueFactory: (queueName) => ({
      waitUntilReady: async () => {
        events.push(`ready:${queueName}`);
      },
      getJobCounts: async () => {
        assert.ok(events.includes(`ready:${queueName}`));
        events.push(`count:${queueName}`);
        return { active: 1 };
      },
    }),
  });

  for (const queueName of ['checkout-events', 'order-events', 'pending-recovery-candidates', 'whatsapp-events']) {
    assert.ok(events.indexOf(`ready:${queueName}`) < events.indexOf(`count:${queueName}`));
  }
});

test('queue overview preserves bounded fail-fast settings and unavailable containment styles', async () => {
  const queueSource = await readFile(sourcePath('src/lib/admin/queue-monitor.ts'), 'utf8');
  const cardSource = await readFile(sourcePath('src/components/admin/kpi-card.tsx'), 'utf8');
  const pageSource = await readFile(sourcePath('src/app/(protected)/page.tsx'), 'utf8');

  assert.match(queueSource, /enableOfflineQueue: false/);
  assert.match(queueSource, /maxRetriesPerRequest: 1/);
  assert.match(queueSource, /connectTimeout: QUEUE_OPERATION_TIMEOUT_MS/);
  assert.match(queueSource, /commandTimeout: QUEUE_OPERATION_TIMEOUT_MS/);
  assert.doesNotMatch(queueSource, /cachedOverviewRedis|overview.*RedisReader/);
  assert.match(cardSource, /min-w-0/);
  assert.match(cardSource, /break-words/);
  assert.match(pageSource, /status=\{queue\.active === null\}/);
});

test('Tenant Directory keeps queue unavailability isolated from tenant data', async () => {
  const pageSource = await readFile(sourcePath('src/app/(protected)/page.tsx'), 'utf8');
  assert.match(pageSource, /readQueueOverviewSnapshot/);
  assert.match(pageSource, /Unavailable/);
  assert.match(pageSource, /getTenantDirectory/);
});

test('detailed queue monitor presents a compact four-queue table with read-only selection', async () => {
  const componentSource = await readFile(sourcePath('src/components/admin/queue-monitor.tsx'), 'utf8');
  assert.match(componentSource, /<table/);
  for (const heading of ['Queue', 'Job label', 'Waiting', 'Active', 'Delayed', 'Failed', 'Workers', 'Last Redis activity']) {
    assert.match(componentSource, new RegExp(`>\\s*${heading}\\s*<`));
  }
  assert.match(
    componentSource,
    /aria-label=\{`Open \$\{queue\.queueName\} queue details`\}/,
  );
  assert.doesNotMatch(componentSource, /View details|>Details<\/span>/);
  assert.match(componentSource, /setSelectedQueueName/);
  assert.doesNotMatch(componentSource, /retry|requeue|delete|pause|resume/);
});

test('queue monitor renders a bounded four-state job summary without mutation actions', async () => {
  const componentSource = await readFile(sourcePath('src/components/admin/queue-monitor.tsx'), 'utf8');
  assert.match(componentSource, /\/api\/admin\/queues\/jobs\?/);
  assert.match(componentSource, /queueJobStatus/);
  assert.match(componentSource, /queueJobDirection/);
  assert.match(componentSource, /limit: showAllJobs \? "10" : "5"/);
  assert.match(componentSource, /page: String\(queueJobPage\)/);
  for (const heading of ['Job ID', 'Shop', 'Job name', 'Attempts']) {
    assert.match(componentSource, new RegExp(`>\\s*${heading}\\s*<`));
  }
  assert.match(componentSource, /Started \/ processed at/);
  assert.match(componentSource, /No \{queueJobStatus\} jobs were found/);
  assert.match(componentSource, /Queue jobs are unavailable/);
  assert.match(componentSource, /Orphan \/ No shop/);
  assert.match(componentSource, /View all jobs/);
  assert.match(componentSource, /Previous/);
  assert.match(componentSource, /Next/);
  for (const status of ['failed', 'active', 'waiting', 'delayed']) {
    assert.match(componentSource, new RegExp(`value="${status}"`));
  }
  assert.match(componentSource, /setSelectedJobId/);
  assert.doesNotMatch(componentSource, /retry|requeue|delete|pause|resume/);
});

test('queue API authorizes before accessing the Redis snapshot reader', async () => {
  const routeSource = await readFile(sourcePath('src/app/api/admin/queues/route.ts'), 'utf8');
  assert.ok(routeSource.indexOf('await requirePlatformAdminRead()') < routeSource.indexOf('readQueueMonitorSnapshot()'));
  assert.match(routeSource, /status: 401/);
  assert.match(routeSource, /status: 503/);
  assert.doesNotMatch(routeSource, /REDIS_URL|connectionString|stack/);
});

test('refresh preference defaults safely and restores valid browser-local values', async () => {
  const originalWindow = globalThis.window;
  const module = await import(`${sourcePath('src/components/admin/queue-monitor-refresh.ts')}?refresh-test=${Date.now()}`);
  const values = new Map();

  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
    },
  };
  assert.equal(module.getInitialRefreshMs(), 5_000);

  values.set('moda-admin.queue-monitor.refresh-ms', '0');
  assert.equal(module.getInitialRefreshMs(), 0);
  values.set('moda-admin.queue-monitor.refresh-ms', '2000');
  assert.equal(module.getInitialRefreshMs(), 2_000);
  values.set('moda-admin.queue-monitor.refresh-ms', 'invalid');
  assert.equal(module.getInitialRefreshMs(), 5_000);

  globalThis.window = originalWindow;
});