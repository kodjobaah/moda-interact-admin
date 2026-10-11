import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePricingResetOptions, databaseIdentity, assertPricingResetAllowed,
  pricingCatalogueInventory, clearPricingCatalogueWithinTransaction,
} from '../../scripts/clear-merchant-pricing-core.mjs';

const LOCAL_ENV = { DATABASE_URL: 'postgresql://tester:password@localhost:5432/moda_test' };
const REMOTE_ENV = { DATABASE_URL: 'postgresql://tester:password@dev-db.example.com:5432/moda_test' };
const args = ['delete', '--confirm-test-data', '--confirm-delete-all-pricing',
  '--confirm-workers-stopped', '--confirm-database', 'moda_test'];
const options = parsePricingResetOptions(args);
const plan = (id, materializedAt = null) => ({
  id, displayName: `Plan ${id}`, shopifyPlanHandle: `handle-${id}`, materializedAt,
});
function stub({ plans = [plan('one')], operations = 0, counts = {}, onDelete = null } = {}) {
  let deletions = 0;
  const db = {
    merchantPricingPlan: {
      findMany: async () => plans,
      count: async () => deletions > 0 ? 0 : plans.length,
      deleteMany: async () => {
        deletions++;
        if (onDelete) await onDelete();
        return { count: plans.length };
      },
    },
    merchantPricingPlanTranslation: { count: async () => counts.translations ?? 20 },
    merchantPricingPlanHighlight: { count: async () => counts.highlights ?? 2 },
    merchantPricingPlanHighlightTranslation: { count: async () => counts.highlightTranslations ?? 40 },
    merchantPricingUsageEvent: { count: async () => counts.usageEvents ?? 3 },
    merchantPricingUsageTier: { count: async () => counts.usageTiers ?? 0 },
    merchantPricingPlanFeature: { count: async () => counts.features ?? 2 },
    billingOperation: { count: async (query) => {
      assert.deepEqual(query.where.OR, [
        { merchantPricingPlanId: { not: null } },
        { merchantPricingUsageEventId: { not: null } },
      ]);
      return operations;
    } },
    billingPlan: { count: async () => counts.billingPlans ?? 1 },
    get deletions() { return deletions; },
  };
  return db;
}

test('status is read-only and rejects mutations flags', () => {
  assert.equal(parsePricingResetOptions(['status']).command, 'status');
  assert.throws(() => parsePricingResetOptions(['status', '--confirm-test-data']), /read-only/);
});
test('invalid and duplicate arguments fail closed', () => {
  assert.throws(() => parsePricingResetOptions(['delete', '--unknown']), /Unknown argument/);
  assert.throws(() => parsePricingResetOptions([...args, '--confirm-test-data']), /Duplicate/);
  assert.throws(() => parsePricingResetOptions([...args, '--confirm-database']), /requires exactly one/);
});
test('database identity never includes credentials', () => {
  assert.deepEqual(databaseIdentity(LOCAL_ENV), { database: 'moda_test', host: 'localhost', isLocal: true });
  assert.throws(() => databaseIdentity({ DATABASE_URL: 'https://example.com/foo' }), /PostgreSQL/);
});
test('production environments are rejected even with all confirmations', () => {
  const inventory = { billingOperationsReferencingPricing: 0, materializedPlans: 0 };
  for (const marker of ['production', 'PROD']) {
    assert.throws(() => assertPricingResetAllowed(options, inventory, { ...LOCAL_ENV, NODE_ENV: marker }), /Production/);
  }
});
test('required explicit confirmations and database-name match prevent deletion', () => {
  const inventory = { billingOperationsReferencingPricing: 0, materializedPlans: 0 };
  assert.throws(() => assertPricingResetAllowed({ ...options, confirmWorkersStopped: false }, inventory, LOCAL_ENV), /requires/);
  assert.throws(() => assertPricingResetAllowed({ ...options, confirmDatabase: 'wrong_db' }, inventory, LOCAL_ENV), /--confirm-database/);
  assert.doesNotThrow(() => assertPricingResetAllowed(options, inventory, LOCAL_ENV));
});
test('remote database requires separate development override', () => {
  const inventory = { billingOperationsReferencingPricing: 0, materializedPlans: 0 };
  assert.throws(() => assertPricingResetAllowed(options, inventory, REMOTE_ENV), /Remote database refused/);
  assert.doesNotThrow(() => assertPricingResetAllowed({ ...options, allowRemoteDevelopmentDb: true }, inventory, REMOTE_ENV));
});
test('billing-operation references prevent reset without modifying history', async () => {
  const db = stub({ operations: 2 });
  const inventory = await pricingCatalogueInventory(db);
  assert.equal(inventory.billingOperationsReferencingPricing, 2);
  await assert.rejects(
    clearPricingCatalogueWithinTransaction(db, ['one'], options, LOCAL_ENV),
    /BillingOperation record/,
  );
  assert.equal(db.deletions, 0);
});
test('materialized plans require an additional explicit confirmation', async () => {
  const db = stub({ plans: [plan('one', new Date())] });
  await assert.rejects(clearPricingCatalogueWithinTransaction(db, ['one'], options, LOCAL_ENV), /--confirm-materialized-plans/);
  assert.equal(db.deletions, 0);
  const result = await clearPricingCatalogueWithinTransaction(db, ['one'], { ...options, confirmMaterializedPlans: true }, LOCAL_ENV);
  assert.equal(result.deletedPlans, 1);
});
test('catalogue changes after preview abort before deletion', async () => {
  const db = stub();
  await assert.rejects(clearPricingCatalogueWithinTransaction(db, ['different'], options, LOCAL_ENV), /changed after preview/);
  assert.equal(db.deletions, 0);
});
test('successful reset calls only MerchantPricingPlan.deleteMany and verifies empty state', async () => {
  const db = stub({ plans: [plan('one'), plan('two')] });
  const inventory = await pricingCatalogueInventory(db);
  assert.equal(inventory.planCount, 2);
  assert.equal(inventory.matchingRetainedBillingPlans, 1);
  const result = await clearPricingCatalogueWithinTransaction(db, inventory.plans.map(({id}) => id), options, LOCAL_ENV);
  assert.equal(result.deletedPlans, 2);
  assert.equal(result.deletedChildRowsByCascade.translations, 20);
  assert.equal(db.deletions, 1);
});
test('database query failure propagates without disguising the cause', async () => {
  const db = stub({ onDelete: () => { throw new Error('P2003: foreign key restriction'); } });
  await assert.rejects(clearPricingCatalogueWithinTransaction(db, ['one'], options, LOCAL_ENV), /P2003/);
});
test('empty catalogue is idempotent and leaves operational billing untouched', async () => {
  const db = stub({ plans: [] });
  const inventory = await pricingCatalogueInventory(db);
  assert.equal(inventory.planCount, 0);
  assert.equal(inventory.matchingRetainedBillingPlans, 0);
  const result = await clearPricingCatalogueWithinTransaction(db, [], options, LOCAL_ENV);
  assert.equal(result.deletedPlans, 0);
});
