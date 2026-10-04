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
const queueMonitorModuleDirectory = sourcePath('src/components/admin/queue-monitor');

async function readQueueMonitorSources() {
  const entries = await readdir(queueMonitorModuleDirectory, { withFileTypes: true });
  const modulePaths = entries
    .filter((entry) => entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name))
    .map((entry) => path.join(queueMonitorModuleDirectory, entry.name))
    .sort();
  const sources = await Promise.all(
    [sourcePath('src/components/admin/queue-monitor.tsx'), ...modulePaths].map(
      (filePath) => readFile(filePath, 'utf8'),
    ),
  );
  return sources.join('\n');
}

function importQueueMonitor() {
  return import(`${sourcePath('src/lib/admin/queue-monitor.ts')}?test=${Date.now()}`);
}

const platformQueueDefinitions = [
  {
    queueName: 'checkout-events',
    jobNames: ['checkout-created', 'checkout-updated', 'cart-activity'],
  },
  { queueName: 'order-events', jobNames: ['order-completed'] },
  {
    queueName: 'pending-recovery-candidates',
    jobNames: ['evaluate-pending-recovery'],
  },
  {
    queueName: 'recovery-capacity-resume',
    jobNames: ['resume-capacity-blocked-recoveries'],
  },
  {
    queueName: 'recovery-outreach-follow-up',
    jobNames: ['recovery-outreach-follow-up'],
  },
  {
    queueName: 'shopify-discount-sync',
    jobNames: ['reconcile-shopify-discounts'],
  },
  {
    queueName: 'billing-subscription-reconcile',
    jobNames: ['reconcile-subscription'],
  },
  {
    queueName: 'whatsapp-events',
    jobNames: ['message-received', 'message-status', 'process-conversation-turn'],
  },
  {
    queueName: 'merchant-communications',
    jobNames: [
      'translation-dispatch',
      'translation-batch-submit',
      'translation-batch-poll',
      'translation-batch-results',
      'translation-reconcile',
    ],
  },
  { queueName: 'merchant-knowledge', jobNames: ['process-source-revision'] },
];

test('uses canonical shared contracts plus the background-owned recovery queues for detailed readers', async () => {
  const { getQueueMonitorDefinitions } = await importQueueMonitor();

  assert.deepEqual(getQueueMonitorDefinitions(), platformQueueDefinitions);
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

  assert.equal(queueCalls.length, platformQueueDefinitions.length);
  assert.deepEqual(snapshot, {
    observedAt: '2026-09-04T16:00:00.000Z',
    queues: platformQueueDefinitions.map((definition) => ({
      ...definition,
      counts: { waiting: 2, active: 3, delayed: 4, failed: 5, workers: 1 },
      lastActivity: { event: 'completed', observedAt: '2024-03-09T16:00:00.000Z' },
    })),
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

  assert.equal(snapshot.queues.length, platformQueueDefinitions.length);
  assert.equal(factoryCalls, platformQueueDefinitions.length * 2);
});

test('queue overview reads active counts for the complete platform queue registry', async () => {
  const { getQueueOverviewDefinitions, readQueueOverviewSnapshot } = await importQueueMonitor();
  const expectedOverview = [
    { queueName: 'checkout-events', labelKey: 'queue.checkoutEvents' },
    { queueName: 'order-events', labelKey: 'queue.orderEvents' },
    { queueName: 'pending-recovery-candidates', labelKey: 'queue.pendingRecoveries' },
    { queueName: 'recovery-capacity-resume', labelKey: 'queue.recoveryCapacityResume' },
    { queueName: 'recovery-outreach-follow-up', labelKey: 'queue.recoveryOutreachFollowUp' },
    { queueName: 'shopify-discount-sync', labelKey: 'queue.shopifyDiscountSync' },
    { queueName: 'billing-subscription-reconcile', labelKey: 'queue.billingSubscriptionReconcile' },
    { queueName: 'whatsapp-events', labelKey: 'queue.whatsappEvents' },
    { queueName: 'merchant-communications', labelKey: 'queue.merchantCommunications' },
    { queueName: 'merchant-knowledge', labelKey: 'queue.merchantKnowledge' },
  ];
  assert.deepEqual(getQueueOverviewDefinitions(), expectedOverview);

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

  assert.deepEqual(calls, expectedOverview.map(({ queueName }) => [queueName, 'active']));
  assert.deepEqual(snapshot, {
    observedAt: '2026-09-04T16:00:00.000Z',
    queues: expectedOverview.map((definition) => ({
      ...definition,
      active: definition.queueName.length,
    })),
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

  for (const { queueName } of platformQueueDefinitions) {
    assert.ok(events.indexOf(`ready:${queueName}`) < events.indexOf(`count:${queueName}`));
  }
});

test('queue overview preserves bounded fail-fast settings for observability consumers', async () => {
  const queueSource = await readFile(sourcePath('src/lib/admin/queue-monitor.ts'), 'utf8');
  const cardSource = await readFile(sourcePath('src/components/admin/kpi-card.tsx'), 'utf8');

  assert.match(queueSource, /enableOfflineQueue: false/);
  assert.match(queueSource, /maxRetriesPerRequest: 1/);
  assert.match(queueSource, /connectTimeout: QUEUE_OPERATION_TIMEOUT_MS/);
  assert.match(queueSource, /commandTimeout: QUEUE_OPERATION_TIMEOUT_MS/);
  assert.doesNotMatch(queueSource, /cachedOverviewRedis|overview.*RedisReader/);
  assert.match(cardSource, /min-w-0/);
  assert.match(cardSource, /break-words/);
});

test('Tenant Directory is independent from transient queue state', async () => {
  const pageSource = await readFile(sourcePath('src/app/(protected)/page.tsx'), 'utf8');
  assert.match(pageSource, /getTenantDirectory/);
  assert.doesNotMatch(pageSource, /readQueueOverviewSnapshot/);
  assert.doesNotMatch(pageSource, /QueueMonitorUnavailableError/);
  assert.doesNotMatch(pageSource, /adminQueueLabel/);
});

test('detailed queue monitor presents the platform queue table with read-only selection', async () => {
  const componentSource = await readQueueMonitorSources();
  assert.match(componentSource, /<table/);
  for (const key of ['queue', 'jobLabel', 'workers', 'lastRedisActivity']) {
    assert.match(componentSource, new RegExp(`queue\\.${key}`));
  }
  for (const key of ['waiting', 'active', 'delayed', 'failed']) {
    assert.match(componentSource, new RegExp(`status\\.${key}`));
  }
  assert.match(componentSource, /queue\.openDetails/);
  assert.doesNotMatch(componentSource, /View details|>Details<\/span>/);
  assert.match(componentSource, /setSelectedQueueName/);
  assert.doesNotMatch(componentSource, /retry|requeue|delete|pause|resume/);
});

test('queue monitor renders a bounded four-state job summary without mutation actions', async () => {
  const componentSource = await readQueueMonitorSources();
  assert.match(componentSource, /\/api\/admin\/queues\/jobs\?/);
  assert.match(componentSource, /queueJobStatus/);
  assert.match(componentSource, /queueJobDirection/);
  assert.match(componentSource, /limit: state\.showAllJobs \? "10" : "5"/);
  assert.match(componentSource, /page: String\(request\.page\)/);
  for (const key of ['jobId', 'shop', 'jobName', 'attempts']) {
    assert.match(componentSource, new RegExp(`queue\\.${key}`));
  }
  assert.match(componentSource, /queue\.startedProcessedAt/);
  assert.match(componentSource, /queue\.jobStatusEmpty/);
  assert.match(componentSource, /queue\.jobsUnavailable/);
  assert.match(componentSource, /queue\.orphanShop/);
  assert.match(componentSource, /queue\.viewAllJobs/);
  assert.match(componentSource, /pagination\.previous/);
  assert.match(componentSource, /pagination\.next/);
  for (const status of ['failed', 'active', 'waiting', 'delayed']) {
    assert.match(componentSource, new RegExp(`value="${status}"`));
  }
  assert.match(componentSource, /onClick=\{\(\) => selectJob\(job\.id\)\}/);
  const selectedJobTransition = componentSource.match(
    /case "job-selected":([\s\S]*?)case "selection-cleared":/,
  );
  assert.ok(selectedJobTransition, "expected a selected-job detail transition");
  assert.match(selectedJobTransition[1], /selectedJobId: action\.jobId/);
  assert.match(selectedJobTransition[1], /jobDetail: null/);
  assert.match(selectedJobTransition[1], /jobDetailError: null/);
  assert.match(selectedJobTransition[1], /jobDetailLoading: true/);
  assert.doesNotMatch(componentSource, /retry|requeue|delete|pause|resume/);
});

test('queue observability is presented as Platform Queues with workload ownership', async () => {
  const componentSource = await readQueueMonitorSources();
  const pageSource = await readFile(sourcePath('src/app/(protected)/observability/queues/page.tsx'), 'utf8');
  const sidebarSource = await readFile(sourcePath('src/components/admin/sidebar.tsx'), 'utf8');
  const catalogueSource = await readFile(sourcePath('src/i18n/locales/en.json'), 'utf8');

  assert.match(componentSource, /queue\.workload/);
  assert.match(componentSource, /adminQueueWorkloadLabel/);
  assert.match(pageSource, /nav\.platformQueues/);
  assert.match(sidebarSource, /nav\.platformQueues/);
  assert.match(catalogueSource, /"nav\.platformQueues": "Platform Queues"/);
  assert.doesNotMatch(catalogueSource, /"nav\.shopifyQueues"/);
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
  const refreshModule = await import(`${sourcePath('src/components/admin/queue-monitor-refresh.ts')}?refresh-test=${Date.now()}`);
  const values = new Map();

  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
    },
  };
  assert.equal(refreshModule.getInitialRefreshMs(), 5_000);

  values.set('moda-admin.queue-monitor.refresh-ms', '0');
  assert.equal(refreshModule.getInitialRefreshMs(), 0);
  values.set('moda-admin.queue-monitor.refresh-ms', '2000');
  assert.equal(refreshModule.getInitialRefreshMs(), 2_000);
  values.set('moda-admin.queue-monitor.refresh-ms', 'invalid');
  assert.equal(refreshModule.getInitialRefreshMs(), 5_000);

  globalThis.window = originalWindow;
});

test('queue display labels remain catalogue-owned at the UI boundary', async () => {
  const source = await readFile(sourcePath('src/lib/admin/queue-monitor.ts'), 'utf8');
  const componentSource = await readQueueMonitorSources();

  assert.doesNotMatch(source, /Pending recovery candidates|WhatsApp events/);
  assert.match(source, /evaluate-pending-recovery/);
  assert.match(source, /whatsapp-events/);
  for (const queueName of [
    'pending-recovery-candidates',
    'recovery-capacity-resume',
    'recovery-outreach-follow-up',
    'whatsapp-events',
  ]) {
    assert.match(source, new RegExp(queueName));
  }
  assert.match(source, /CART_ACTIVITY_EVENTS/);
  assert.match(source, /SHOPIFY_DISCOUNT_SYNC/);
  assert.match(source, /MERCHANT_COMMUNICATIONS_JOB_NAMES/);
  assert.match(source, /BILLING_SUBSCRIPTION_RECONCILE_QUEUE_NAME/);
  assert.match(source, /MERCHANT_KNOWLEDGE_QUEUE_NAME/);
  assert.match(
    componentSource,
    /\{queue\.jobNames\.map\(adminQueueJobLabel\)\.join\(", "\)\}/,
  );
  assert.match(
    componentSource,
    /\{selectedQueue\.jobNames\.map\(adminQueueJobLabel\)\.join\(", "\)\}/,
  );
});