import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sourcePath = resolve(root, 'src/lib/admin/merchant-support.ts');
const source = readFileSync(sourcePath, 'utf8');
const packageJson = JSON.parse(
  readFileSync(resolve(root, 'package.json'), 'utf8'),
);

function runBehaviorScript(script) {
  const output = execFileSync(
      process.execPath,
      ['--experimental-strip-types', '--input-type=module', '-e', script],
      {
        cwd: root,
        env: {
          ...process.env,
          NODE_ENV: 'test',
          DEPLOYMENT_ENVIRONMENT_NAME: 'development',
        },
        encoding: 'utf8',
      },
    );
  return JSON.parse(output.trim().split('\n').at(-1));
}

const moduleUrl = pathToFileURL(sourcePath).href;

test('consumes the published shared release without a local declaration shim', () => {
  assert.equal(
    packageJson.dependencies['@modainteract/moda-interact-shared'],
    '0.7.1',
  );
  assert.equal(
    existsSync(resolve(root, 'src/types/shared-merchant-communications.d.ts')),
    false,
  );
  assert.match(
    source,
    /from '@modainteract\/moda-interact-shared\/merchant-communications\/node'/,
  );
  assert.doesNotMatch(source, /await import\(\s*['"]@modainteract\/moda-interact-shared\/merchant-communications\/node/);
});

test('enforces the Unicode body limit and owner recheck', () => {
  const result = runBehaviorScript(`
    import {
      adminCanSend,
      composeAdministrativeMessage,
    } from ${JSON.stringify(moduleUrl)};

    const database = {
      $transaction: async (callback) => callback({
        $queryRaw: async () => [{
          shopId: 'shop-1',
          assignedPlatformAdminId: 'development-platform-admin',
          merchantMessageVersion: 1,
          defaultLanguageTag: 'en-GB',
        }],
        $executeRaw: async () => 1,
      }),
    };
    const compose = (body, assignedPlatformAdminId = 'development-platform-admin') =>
      composeAdministrativeMessage({
        threadId: 'thread-1',
        body,
        database: {
          $transaction: async (callback) => callback({
            $queryRaw: async () => [{
              shopId: 'shop-1',
              assignedPlatformAdminId,
              merchantMessageVersion: 1,
              defaultLanguageTag: 'en-GB',
            }],
            $executeRaw: async () => 1,
          }),
        },
        queue: { add: async () => undefined },
      });
    const accepted = await compose('👩‍💻'.repeat(500));
    let tooLong = false;
    try { await compose('👩‍💻'.repeat(501)); } catch { tooLong = true; }
    let nonOwner = false;
    try { await compose('hello', 'another-admin'); } catch { nonOwner = true; }
    const superAdminNonOwner = adminCanSend(
      { id: 'super-admin', role: 'SUPER_ADMIN', developmentBypass: false },
      'another-owner',
    ) === false;
    console.log(JSON.stringify({ accepted: Boolean(accepted.messageId), tooLong, nonOwner, superAdminNonOwner }));
  `);

  assert.deepEqual(result, {
    accepted: true,
    tooLong: true,
    nonOwner: true,
    superAdminNonOwner: true,
  });
});

test('commits English and non-English compose work before queue handling', () => {
  const result = runBehaviorScript(`
    import { composeAdministrativeMessage } from ${JSON.stringify(moduleUrl)};
    const run = async (defaultLanguageTag) => {
      let executions = 0;
      let queueCalls = 0;
      let responseBoundaryConditions = [];
      const database = {
        $transaction: async (callback) => callback({
          $queryRaw: async () => [{
            shopId: 'shop-1',
            assignedPlatformAdminId: 'development-platform-admin',
            merchantMessageVersion: 1,
            defaultLanguageTag,
          }],
          $executeRaw: async (query) => {
            executions += 1;
            if (executions === (defaultLanguageTag === 'en-GB' ? 2 : 3)) {
              responseBoundaryConditions = query.values.filter(
                (value) => typeof value === 'boolean',
              );
            }
            return 1;
          },
        }),
      };
      const result = await composeAdministrativeMessage({
        threadId: 'thread-1',
        body: 'hello',
        database,
        queue: { add: async () => { queueCalls += 1; throw new Error('Redis down'); } },
      });
      return {
        hasTranslation: Boolean(result.translationId),
        executions,
        queueCalls,
        responseBoundaryConditions,
      };
    };
    console.log(JSON.stringify({ english: await run('en-GB'), french: await run('fr-FR') }));
  `);

  assert.deepEqual(result.english, {
    hasTranslation: false,
    executions: 2,
    queueCalls: 0,
    responseBoundaryConditions: [true, true],
  });
  assert.deepEqual(result.french, {
    hasTranslation: true,
    executions: 3,
    queueCalls: 1,
    responseBoundaryConditions: [false, false],
  });
});

test('maps persisted message kinds and respects existing translation status', () => {
  const result = runBehaviorScript(`
    import { requestAdditionalTranslation } from ${JSON.stringify(moduleUrl)};
    const run = async (kind, status) => {
      const values = [];
      let queryCount = 0;
      let queueCalls = 0;
      const database = {
        $transaction: async (callback) => callback({
          $queryRaw: async () => queryCount++ === 0
            ? [{ kind, sourceLanguageTag: 'fr-FR' }]
            : [{ id: 'translation-1', status }],
          $executeRaw: async (query) => { values.push(query.values); return 1; },
        }),
      };
      const id = await requestAdditionalTranslation({
        messageId: 'message-1',
        targetLanguageTag: 'en-gb',
        database,
        queue: { add: async () => { queueCalls += 1; } },
      });
      return { id, values, queueCalls };
    };
    let invalid = false;
    try {
      await requestAdditionalTranslation({
        messageId: 'message-1',
        targetLanguageTag: 'not a language',
        database: { $transaction: async () => { throw new Error('write'); } },
        queue: { add: async () => undefined },
      });
    } catch { invalid = true; }
    console.log(JSON.stringify({
      merchant: await run('MERCHANT', 'PENDING'),
      administrative: await run('ADMINISTRATIVE', 'AVAILABLE'),
      system: await run('SYSTEM', 'FAILED'),
      invalid,
    }));
  `);

  assert.equal(result.invalid, true);
  assert.equal(result.merchant.queueCalls, 1);
  assert.ok(result.merchant.values.flat().includes('en-GB'));
  assert.equal(result.administrative.queueCalls, 0);
  assert.equal(result.system.queueCalls, 0);
  assert.ok(result.merchant.values.flat().includes('MERCHANT_TO_ADMIN'));
  assert.ok(result.administrative.values.flat().includes('ADMIN_TO_MERCHANT'));
  assert.ok(result.system.values.flat().includes('SYSTEM_TO_MERCHANT'));
  assert.equal(result.merchant.id, 'translation-1');
});

test('keeps reconciliation durable when queue enqueue fails and caches producers', () => {
  assert.match(source, /let redisQueue: Queue \| null = null/);
  assert.match(source, /if \(redisQueue && redisQueueUrl === redisUrl\) return redisQueue/);
  assert.match(source, /await redisQueue\.close\(\)/);
  assert.match(source, /getMerchantCommunicationsQueue/);
  assert.match(source, /requestFailedTranslationReconciliation/);
  assert.match(source, /requestFailedTranslationsReconciliation/);
  assert.match(source, /adminCanRequestGlobalReconciliation/);
  assert.match(source, /status === 'PENDING'/);
  assert.doesNotMatch(source, /shared_job_id_runtime_unavailable/);
});

test('reuses production queues, closes replaced queues, and leaves injected queues open', () => {
  const result = runBehaviorScript(`
    import {
      composeAdministrativeMessage,
      getMerchantCommunicationsQueue,
    } from ${JSON.stringify(moduleUrl)};

    process.env.REDIS_URL = 'redis://localhost:6379/one';
    const first = await getMerchantCommunicationsQueue();
    let closed = 0;
    const originalClose = first.close.bind(first);
    first.close = async () => { closed += 1; return originalClose(); };
    const reused = await getMerchantCommunicationsQueue();
    process.env.REDIS_URL = 'redis://localhost:6379/two';
    const replaced = await getMerchantCommunicationsQueue();

    let injectedClosed = 0;
    await composeAdministrativeMessage({
      threadId: 'thread-1',
      body: 'hello',
      database: {
        $transaction: async (callback) => callback({
          $queryRaw: async () => [{
            shopId: 'shop-1',
            assignedPlatformAdminId: 'development-platform-admin',
            merchantMessageVersion: 1,
            defaultLanguageTag: 'fr-FR',
          }],
          $executeRaw: async () => 1,
        }),
      },
      queue: {
        add: async () => undefined,
        close: async () => { injectedClosed += 1; },
      },
    });
    await replaced.close();
    console.log(JSON.stringify({
      reused: first === reused,
      replaced: first !== replaced,
      closed,
      injectedClosed,
    }));
  `);

  assert.deepEqual(result, {
    reused: true,
    replaced: true,
    closed: 1,
    injectedClosed: 0,
  });
});

test('persists targeted reconciliation before a failed queue hint', () => {
  const result = runBehaviorScript(`
    import {
      requestFailedTranslationReconciliation,
    } from ${JSON.stringify(moduleUrl)};

    let writes = 0;
    const requestId = await requestFailedTranslationReconciliation({
      translationId: 'translation-failed',
      database: {
        $transaction: async (callback) => callback({
          $queryRaw: async () => [{ status: 'FAILED', threadId: 'thread-1' }],
          $executeRaw: async () => { writes += 1; return 1; },
        }),
      },
      queue: { add: async () => { throw new Error('Redis down'); } },
    });
    console.log(JSON.stringify({ requestId, writes }));
  `);

  assert.match(result.requestId, /^[0-9a-f-]{36}$/);
  assert.equal(result.writes, 1);
});

test('enforces global reconciliation authorization and durability', () => {
  const result = runBehaviorScript(`
    import {
      adminCanRequestGlobalReconciliation,
      requestFailedTranslationsReconciliation,
    } from ${JSON.stringify(moduleUrl)};

    let writes = 0;
    const requestId = await requestFailedTranslationsReconciliation({
      database: {
        $executeRaw: async () => { writes += 1; return 1; },
      },
      queue: { add: async () => { throw new Error('Redis down'); } },
    });
    console.log(JSON.stringify({
      requestId,
      writes,
      superAdminAllowed: adminCanRequestGlobalReconciliation({
        id: 'super-admin', role: 'SUPER_ADMIN', developmentBypass: false,
      }),
      platformAdminAllowed: adminCanRequestGlobalReconciliation({
        id: 'platform-admin', role: 'PLATFORM_ADMIN', developmentBypass: false,
      }),
    }));
  `);

  assert.match(result.requestId, /^[0-9a-f-]{36}$/);
  assert.equal(result.writes, 1);
  assert.equal(result.superAdminAllowed, true);
  assert.equal(result.platformAdminAllowed, false);
});

test('lists only pending threads with bounded filters and safe owner summaries', () => {
  const result = runBehaviorScript(`
    import { getPendingMerchantSupportThreads } from ${JSON.stringify(moduleUrl)};
    const queries = [];
    const database = {
      $queryRaw: async (query) => {
        queries.push(query);
        if (query.sql.includes('COUNT(*)')) return [{ count: 2n }];
        return [{
          id: 'thread-1',
          shopId: 'shop-1',
          domain: 'one.example',
          assignedPlatformAdminId: 'admin-2',
          lastMerchantMessageAt: null,
          ownerId: 'admin-2',
          ownerDisplayName: 'Other Admin',
          ownerEmail: 'other@example.com',
        }];
      },
    };
    const page = await getPendingMerchantSupportThreads({
      page: 1,
      pageSize: 999,
      filter: 'assigned-to-others',
      search: 'one.example',
      database,
    });
    console.log(JSON.stringify({
      pageSize: page.pageSize,
      totalItems: page.totalItems,
      item: page.items[0],
      queryValues: queries.flatMap((query) => query.values),
    }));
  `);

  assert.equal(result.pageSize, 50);
  assert.equal(result.totalItems, 2);
  assert.deepEqual(result.item.owner, {
    id: 'admin-2',
    displayName: 'Other Admin',
    email: 'other@example.com',
  });
  assert.equal('originalBody' in result.item, false);
  assert.ok(result.queryValues.includes('development-platform-admin'));
});

test('compare-and-set ownership has one winner and reloads the losing owner', () => {
  const result = runBehaviorScript(`
    import {
      adminCanRelease,
      adminCanSend,
      releaseMerchantSupportThreadOwnership,
      reassignMerchantSupportThreadOwnership,
      takeMerchantSupportThreadOwnership,
    } from ${JSON.stringify(moduleUrl)};
    let available = true;
    const owner = {
      ownerId: 'development-platform-admin',
      ownerDisplayName: 'Current Admin',
      ownerEmail: 'current@example.com',
    };
    const database = {
      $transaction: async (callback) => callback({
        $executeRaw: async () => {
          if (!available) return 0;
          available = false;
          return 1;
        },
        $queryRaw: async () => [owner],
      }),
      $executeRaw: async () => 1,
    };
    const winners = await Promise.all([
      takeMerchantSupportThreadOwnership('thread-1', database),
      takeMerchantSupportThreadOwnership('thread-1', database),
    ]);
    let reassigned = null;
    const reassignDatabase = {
      $transaction: async (callback) => callback({
        $queryRaw: async () => [{ id: 'admin-2', displayName: 'Admin Two', email: 'two@example.com' }],
        $executeRaw: async () => 1,
      }),
    };
    reassigned = await reassignMerchantSupportThreadOwnership({
      threadId: 'thread-1',
      targetPlatformAdminId: 'admin-2',
      database: reassignDatabase,
    });
    await releaseMerchantSupportThreadOwnership('thread-1', database);
    console.log(JSON.stringify({
      claims: winners.map((entry) => entry.claimed),
      loserOwner: winners.find((entry) => !entry.claimed).owner,
      reassigned,
      ordinaryReleaseOther: adminCanRelease(
        { id: 'admin-1', role: 'ADMIN', developmentBypass: false },
        'admin-2',
      ),
      superReleaseOther: adminCanRelease(
        { id: 'super', role: 'SUPER_ADMIN', developmentBypass: false },
        'admin-2',
      ),
      superSendOther: adminCanSend(
        { id: 'super', role: 'SUPER_ADMIN', developmentBypass: false },
        'admin-2',
      ),
    }));
  `);

  assert.deepEqual(result.claims.sort(), [false, true]);
  assert.deepEqual(result.loserOwner, {
    id: 'development-platform-admin',
    displayName: 'Current Admin',
    email: 'current@example.com',
  });
  assert.deepEqual(result.reassigned, {
    id: 'admin-2',
    displayName: 'Admin Two',
    email: 'two@example.com',
  });
  assert.equal(result.ordinaryReleaseOther, false);
  assert.equal(result.superReleaseOther, true);
  assert.equal(result.superSendOther, false);
});