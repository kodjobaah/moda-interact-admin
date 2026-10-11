import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
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
  assert.equal(result.merchantKnowledgeUploadedAssets, 3);
  assert.deepEqual(calls.find((entry) => entry.model === 'session').where, { shop: shop.domain });
  for (const call of calls.filter((entry) => entry.model !== 'session' && entry.model !== 'conversation')) {
    assert.equal(call.where.shopId, shop.id);
  }
});

test('deletion is targeted and ordered around restrictive foreign keys', async () => {
  const calls = [];
  const tx = new Proxy({}, {
    get: (_, model) => model === '$executeRaw' ? async (parts, shopId) => {
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
