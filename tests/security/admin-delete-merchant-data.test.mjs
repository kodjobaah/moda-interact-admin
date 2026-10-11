import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { deleteImmutableShopPrompts } from '../../scripts/merchant-prompt-cleanup.mjs';
import {
  deleteMerchantDatabaseRows,
  merchantInventory,
  parseOptions,
  validateDeletion,
} from '../../scripts/merchant-data-deletion-core.mjs';

const shop = { id: 'shop-fixture', domain: 'example.myshopify.com', platform: 'SHOPIFY' };
const env = { DATABASE_URL: 'postgresql://dev:dev@localhost:5432/moda_dev', NODE_ENV: 'development' };
const allowed = {
  command: 'delete', shop: shop.id,
  confirmShop: shop.domain, confirmTestData: true,
  confirmWorkersStopped: true,
  externalAssetsHandled: false,
  allowRemoteDevelopmentDb: false,
  confirmImmutablePromptPurge: false,
};

test('parses a merchant-specific preview and explicit deletion request', () => {
  assert.deepEqual(parseOptions(['status', '--shop', shop.id]), {
    ...allowed, command: 'status', confirmShop: undefined,
    confirmTestData: false, confirmWorkersStopped: false,
  });
  assert.deepEqual(parseOptions([
    'delete', `--shop=${shop.id}`, '--confirm-shop', shop.domain,
    '--confirm-test-data', '--confirm-workers-stopped',
  ]), allowed);
  assert.throws(() => parseOptions(['delete', '--confirm-test-data']), /--shop/);
  assert.throws(() => parseOptions(['delete', '--shop', shop.id, '--all']), /Unknown/);
});

test('refuses deletion without both confirmations and an exact shop domain', () => {
  assert.throws(() => validateDeletion({ ...allowed, confirmTestData: false }, shop, {}, env), /--confirm-test-data/);
  assert.throws(() => validateDeletion({ ...allowed, confirmWorkersStopped: false }, shop, {}, env), /--confirm-workers-stopped/);
  assert.throws(() => validateDeletion({ ...allowed, confirmShop: 'other.myshopify.com' }, shop, {}, env), /exactly match/);
  assert.doesNotThrow(() => validateDeletion(allowed, shop, { merchantKnowledgeUploadedAssets: 0 }, env));
});

test('refuses production, unknown databases and remote targets without separate acknowledgement', () => {
  assert.throws(() => validateDeletion(allowed, shop, {}, { ...env, NODE_ENV: 'production' }), /Production/);
  assert.throws(() => validateDeletion(allowed, shop, {}, { ...env, MODA_ENVIRONMENT: 'prod' }), /Production/);
  assert.throws(() => validateDeletion(allowed, shop, {}, { ...env, DATABASE_URL: undefined }), /DATABASE_URL/);
  assert.throws(() => validateDeletion(allowed, shop, {}, { ...env, DATABASE_URL: 'postgresql://test@example.com/db' }), /Remote database/);
  assert.doesNotThrow(() => validateDeletion({ ...allowed, allowRemoteDevelopmentDb: true }, shop, {}, { ...env, DATABASE_URL: 'postgresql://test@example.com/db' }));
});

test('requires explicit authorization for immutable prompt cleanup', () => {
  assert.throws(() => validateDeletion(allowed, shop, { commerceAgentPrompts: 1 }, env), /--confirm-immutable-prompt-purge/);
  assert.doesNotThrow(() => validateDeletion({ ...allowed, confirmImmutablePromptPurge: true }, shop, { commerceAgentPrompts: 1 }, env));
  assert.equal(parseOptions(['delete', '--shop', shop.id, '--confirm-immutable-prompt-purge']).confirmImmutablePromptPurge, true);
});

test('requires separate acknowledgement for uploaded assets not erased from R2', () => {
  assert.throws(() => validateDeletion(allowed, shop, { merchantKnowledgeUploadedAssets: 1 }, env), /R2/);
  assert.doesNotThrow(() => validateDeletion({ ...allowed, externalAssetsHandled: true }, shop, { merchantKnowledgeUploadedAssets: 1 }, env));
});

test('preview counts merchant-scoped rows without executing writes', async () => {
  const calls = [];
  const client = new Proxy({}, { get: (_, model) => ({ count: async (args) => {
    calls.push({ model, where: args.where });
    return 3;
  } }) });
  const result = await merchantInventory(client, shop);
  assert.equal(result.sessions, 3);
  assert.equal(result.commerceAgentPrompts, 3);
  assert.equal(result.commerceAgentPromptRevisions, 3);
  assert.equal(result.merchantKnowledgeUploadedAssets, 3);
  assert.deepEqual(calls.find((entry) => entry.model === 'session').where, { shop: shop.domain });
  for (const call of calls.filter((entry) => entry.model !== 'session' && entry.model !== 'conversation' && entry.model !== 'commerceAgentPromptRevision')) {
    assert.equal(call.where.shopId, shop.id);
  }
});

test('deletion is targeted and ordered around restrictive foreign keys', async () => {
  const calls = [];
  const tx = new Proxy({}, {
    get: (_, model) => model === 'commerceAgentPrompt' ? {
      count: async () => 0,
      deleteMany: async (args) => { calls.push({ model, ...args }); return { count: 1 }; },
    } : model === '$executeRaw' ? async (parts, shopId) => {
      calls.push({ model: 'merchantTranslationReconciliationRequest', shopId, sql: parts.join('?') });
      return 2;
    } : model === 'shop' ? { delete: async (args) => {
      calls.push({ model: 'shop', ...args });
      return { id: shop.id };
    } } : { deleteMany: async (args) => {
      calls.push({ model, ...args });
      return { count: 1 };
    } },
  });
  const result = await deleteMerchantDatabaseRows(tx, shop);
  const position = (model) => calls.findIndex((call) => call.model === model);
  assert.equal(result.shop, 1);
  assert.equal(result.merchantTranslationReconciliationRequest, 2);
  assert.ok(position('usageReservation') < position('promotionalCreditGrant'));
  assert.ok(position('merchantPromotionSelection') < position('promotionalCreditGrant'));
  assert.ok(position('recoveryCreditRefund') < position('recoveryCreditPurchase'));
  assert.ok(position('recoveryCreditPurchase') < position('billingPeriod'));
  assert.ok(position('merchantKnowledgeSource') < position('merchantKnowledgeUploadedAsset'));
  assert.ok(position('commerceAgentConfiguration') < position('commerceAgentPromptRevision'));
  assert.ok(position('commerceAgentPromptRevision') < position('commerceAgentPrompt'));
  assert.ok(position('commerceModelCatalogueEntry') < position('commerceModelAvailability'));
  assert.ok(position('billingPeriod') < position('shop'));
  assert.ok(position('shop') < position('session'));
  assert.deepEqual(calls.find((call) => call.model === 'shop').where, { id: shop.id });
  assert.deepEqual(calls.find((call) => call.model === 'session').where, { shop: shop.domain });
  for (const entry of calls) {
    assert.ok(entry.model === 'shop' || entry.model === 'session' || entry.model === 'merchantTranslationReconciliationRequest' ||
      JSON.stringify(entry.where).includes(shop.id), `Unscoped deletion in ${entry.model}`);
  }
  assert.equal(calls.find((call) => call.model === 'merchantTranslationReconciliationRequest').shopId, shop.id);
});

test('prompt cleanup refuses any unconfirmed attempt to bypass ARCH-021 immutability', async () => {
  const events = [];
  const tx = {
    commerceAgentPrompt: { count: async ({ where }) => {
      assert.deepEqual(where, { shopId: shop.id });
      return 2;
    } },
    $queryRaw: async () => { events.push('inspect'); return []; },
    $executeRawUnsafe: async () => { events.push('ddl'); },
  };
  await assert.rejects(deleteImmutableShopPrompts(tx, shop.id, async () => {}, false), /--confirm-immutable-prompt-purge/);
  assert.deepEqual(events, []);
});

test('prompt cleanup fails closed on missing or altered trigger modes', async () => {
  const events = [];
  const tx = {
    commerceAgentPrompt: { count: async () => 1 },
    $queryRaw: async () => [
      { tableName: 'CommerceAgentPromptRevision', triggerName: 'arch021_agent_prompt_revision_guard', enabledState: 'O', internal: false },
      { tableName: 'CommerceAgentPrompt', triggerName: 'arch021_agent_prompt_guard', enabledState: 'O', internal: false },
    ],
    $executeRawUnsafe: async () => { events.push('ddl'); },
  };
  await assert.rejects(deleteImmutableShopPrompts(tx, shop.id, async () => {}, true), /expected enabled state/);
  assert.deepEqual(events, []);
});

test('confirmed prompt cleanup suspends only two application guards and restores original modes', async () => {
  const events = [];
  const tx = {
    commerceAgentPrompt: { count: async () => 2 },
    $queryRaw: async () => [
      { tableName: 'CommerceAgentPromptRevision', triggerName: 'arch021_agent_prompt_revision_guard', enabledState: 'A', internal: false },
      { tableName: 'CommerceAgentPrompt', triggerName: 'arch021_agent_prompt_guard', enabledState: 'O', internal: false },
    ],
    $executeRaw: async (parts) => { events.push(parts.join('')); },
    $executeRawUnsafe: async (sql) => { events.push(sql); },
  };
  await deleteImmutableShopPrompts(tx, shop.id, async (name, args) => {
    events.push({ name, args });
  }, true);
  assert.deepEqual(events.map((value) => typeof value === 'string' ? value : value.name), [
    "SET LOCAL lock_timeout = '5s'",
    'ALTER TABLE commerce."CommerceAgentPromptRevision" DISABLE TRIGGER arch021_agent_prompt_revision_guard',
    'ALTER TABLE commerce."CommerceAgentPrompt" DISABLE TRIGGER arch021_agent_prompt_guard',
    'commerceAgentPromptRevision',
    'commerceAgentPrompt',
    'ALTER TABLE commerce."CommerceAgentPromptRevision" ENABLE ALWAYS TRIGGER arch021_agent_prompt_revision_guard',
    'ALTER TABLE commerce."CommerceAgentPrompt" ENABLE TRIGGER arch021_agent_prompt_guard',
  ]);
  const deletes = events.filter((value) => typeof value !== 'string');
  assert.deepEqual(deletes[0].args, { where: { prompt: { is: { shopId: shop.id } } } });
  assert.deepEqual(deletes[1].args, { where: { shopId: shop.id } });
});

test('prompt cleanup propagates failed deletion for transaction rollback rather than re-enabling inside an aborted transaction', async () => {
  const events = [];
  const tx = {
    commerceAgentPrompt: { count: async () => 1 },
    $queryRaw: async () => [
      { tableName: 'CommerceAgentPromptRevision', triggerName: 'arch021_agent_prompt_revision_guard', enabledState: 'A', internal: false },
      { tableName: 'CommerceAgentPrompt', triggerName: 'arch021_agent_prompt_guard', enabledState: 'O', internal: false },
    ],
    $executeRaw: async () => {},
    $executeRawUnsafe: async (sql) => { events.push(sql); },
  };
  await assert.rejects(deleteImmutableShopPrompts(tx, shop.id, async () => { throw new Error('FK blocked'); }, true), /FK blocked/);
  assert.equal(events.filter((sql) => sql.includes('DISABLE TRIGGER')).length, 2);
  assert.equal(events.filter((sql) => sql.includes('ENABLE')).length, 0);
});

test('schema direct restrictive Shop foreign keys are explicitly handled', () => {
  const schema = readFileSync(new URL('../../database/prisma/schema.prisma', import.meta.url), 'utf8');
  const names = [];
  for (const match of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    if (/\bShop\??\s+@relation\([^\n]*onDelete: Restrict/.test(match[2])) names.push(match[1]);
  }
  assert.deepEqual(names.sort(), [
    'CommerceAgentConfiguration', 'CommerceAgentPrompt', 'CommerceAuditEvent',
    'CommerceExternalConnectionAudit', 'CommerceExternalCredential',
    'CommerceModelAvailability', 'CommerceStudioMerchantAccess',
    'PromotionCampaign', 'PromotionalCreditGrant',
  ].sort());
});
