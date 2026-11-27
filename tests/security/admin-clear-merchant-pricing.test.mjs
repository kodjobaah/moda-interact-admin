import test from "node:test";
import assert from "node:assert/strict";
import {
  parsePricingResetOptions,
  databaseIdentity,
  assertPricingResetAllowed,
  pricingCatalogueInventory,
  clearPricingCatalogueWithinTransaction,
} from "../../scripts/clear-merchant-pricing-core.mjs";

const LOCAL_ENV = {
  DATABASE_URL: "postgresql://tester:password@localhost:5432/moda_test",
};
const REMOTE_ENV = {
  DATABASE_URL:
    "postgresql://tester:password@dev-db.example.com:5432/moda_test",
};
const args = [
  "delete",
  "--confirm-test-data",
  "--confirm-delete-all-pricing",
  "--confirm-workers-stopped",
  "--confirm-database",
  "moda_test",
];
const options = parsePricingResetOptions(args);
const plan = (id, materializedAt = null) => ({
  id,
  displayName: `Plan ${id}`,
  shopifyPlanHandle: `handle-${id}`,
  materializedAt,
});
function stub({
  plans = [plan("one")],
  operations = 0,
  counts = {},
  onDelete = null,
  policyDeleteCount = counts.planScopedCommerceModelPolicies ?? 0,
} = {}) {
  let deletions = 0;
  let policyDeletions = 0;
  const calls = [];
  const planIds = plans.map(({ id }) => id);
  const db = {
    merchantPricingPlan: {
      findMany: async () => plans,
      count: async () => (deletions > 0 ? 0 : plans.length),
      deleteMany: async () => {
        calls.push("merchantPricingPlan.deleteMany");
        deletions++;
        if (onDelete) await onDelete();
        return { count: plans.length };
      },
    },
    merchantPricingPlanTranslation: {
      count: async () => counts.translations ?? 20,
    },
    merchantPricingPlanHighlight: { count: async () => counts.highlights ?? 2 },
    merchantPricingPlanHighlightTranslation: {
      count: async () => counts.highlightTranslations ?? 40,
    },
    merchantPricingUsageEvent: { count: async () => counts.usageEvents ?? 3 },
    merchantPricingUsageTier: { count: async () => counts.usageTiers ?? 0 },
    merchantPricingPlanFeature: { count: async () => counts.features ?? 2 },
    billingOperation: {
      count: async (query) => {
        assert.deepEqual(query.where.OR, [
          { merchantPricingPlanId: { not: null } },
          { merchantPricingUsageEventId: { not: null } },
        ]);
        return operations;
      },
    },
    billingPlan: { count: async () => counts.billingPlans ?? 1 },
    commerceModelPolicy: {
      count: async ({ where }) => {
        assert.deepEqual(where, { merchantPricingPlanId: { in: planIds } });
        return policyDeletions > 0
          ? 0
          : (counts.planScopedCommerceModelPolicies ?? 0);
      },
      deleteMany: async ({ where }) => {
        assert.deepEqual(where, { merchantPricingPlanId: { in: planIds } });
        calls.push("commerceModelPolicy.deleteMany");
        policyDeletions++;
        return { count: policyDeleteCount };
      },
    },
    get deletions() {
      return deletions;
    },
    get calls() {
      return calls;
    },
  };
  return db;
}

test("status is read-only and rejects mutations flags", () => {
  assert.equal(parsePricingResetOptions(["status"]).command, "status");
  assert.throws(
    () => parsePricingResetOptions(["status", "--confirm-test-data"]),
    /read-only/,
  );
});
test("invalid and duplicate arguments fail closed", () => {
  assert.throws(
    () => parsePricingResetOptions(["delete", "--unknown"]),
    /Unknown argument/,
  );
  assert.throws(
    () => parsePricingResetOptions([...args, "--confirm-test-data"]),
    /Duplicate/,
  );
  assert.throws(
    () => parsePricingResetOptions([...args, "--confirm-database"]),
    /requires exactly one/,
  );
});
test("database identity never includes credentials", () => {
  assert.deepEqual(databaseIdentity(LOCAL_ENV), {
    database: "moda_test",
    host: "localhost",
    isLocal: true,
  });
  assert.throws(
    () => databaseIdentity({ DATABASE_URL: "https://example.com/foo" }),
    /PostgreSQL/,
  );
});
test("production environments are rejected even with all confirmations", () => {
  const inventory = {
    billingOperationsReferencingPricing: 0,
    materializedPlans: 0,
  };
  for (const marker of ["production", "PROD"]) {
    assert.throws(
      () =>
        assertPricingResetAllowed(options, inventory, {
          ...LOCAL_ENV,
          NODE_ENV: marker,
        }),
      /Production/,
    );
  }
});
test("required explicit confirmations and database-name match prevent deletion", () => {
  const inventory = {
    billingOperationsReferencingPricing: 0,
    materializedPlans: 0,
  };
  assert.throws(
    () =>
      assertPricingResetAllowed(
        { ...options, confirmWorkersStopped: false },
        inventory,
        LOCAL_ENV,
      ),
    /requires/,
  );
  assert.throws(
    () =>
      assertPricingResetAllowed(
        { ...options, confirmDatabase: "wrong_db" },
        inventory,
        LOCAL_ENV,
      ),
    /--confirm-database/,
  );
  assert.doesNotThrow(() =>
    assertPricingResetAllowed(options, inventory, LOCAL_ENV),
  );
});
test("remote database requires separate development override", () => {
  const inventory = {
    billingOperationsReferencingPricing: 0,
    materializedPlans: 0,
  };
  assert.throws(
    () => assertPricingResetAllowed(options, inventory, REMOTE_ENV),
    /Remote database refused/,
  );
  assert.doesNotThrow(() =>
    assertPricingResetAllowed(
      { ...options, allowRemoteDevelopmentDb: true },
      inventory,
      REMOTE_ENV,
    ),
  );
});
test("billing-operation references prevent reset without modifying history", async () => {
  const db = stub({ operations: 2 });
  const inventory = await pricingCatalogueInventory(db);
  assert.equal(inventory.billingOperationsReferencingPricing, 2);
  await assert.rejects(
    clearPricingCatalogueWithinTransaction(db, ["one"], options, LOCAL_ENV),
    /BillingOperation record/,
  );
  assert.equal(db.deletions, 0);
});
test("materialized plans require an additional explicit confirmation", async () => {
  const db = stub({ plans: [plan("one", new Date())] });
  await assert.rejects(
    clearPricingCatalogueWithinTransaction(db, ["one"], options, LOCAL_ENV),
    /--confirm-materialized-plans/,
  );
  assert.equal(db.deletions, 0);
  const result = await clearPricingCatalogueWithinTransaction(
    db,
    ["one"],
    { ...options, confirmMaterializedPlans: true },
    LOCAL_ENV,
  );
  assert.equal(result.deletedPlans, 1);
});
test("catalogue changes after preview abort before deletion", async () => {
  const db = stub();
  await assert.rejects(
    clearPricingCatalogueWithinTransaction(
      db,
      ["different"],
      options,
      LOCAL_ENV,
    ),
    /changed after preview/,
  );
  assert.equal(db.deletions, 0);
});
test("reset deletes only plan-scoped CommerceModelPolicy rows before deleting plans", async () => {
  const db = stub({
    plans: [plan("one"), plan("two")],
    counts: { planScopedCommerceModelPolicies: 3 },
  });
  const inventory = await pricingCatalogueInventory(db);
  assert.equal(inventory.planCount, 2);
  assert.equal(inventory.matchingRetainedBillingPlans, 1);
  assert.equal(inventory.planScopedCommerceModelPolicies, 3);

  const result = await clearPricingCatalogueWithinTransaction(
    db,
    inventory.plans.map(({ id }) => id),
    options,
    LOCAL_ENV,
  );

  assert.equal(result.deletedPlans, 2);
  assert.equal(result.deletedDependentRows.commerceModelPolicies, 3);
  assert.equal(result.deletedChildRowsByCascade.translations, 20);
  assert.deepEqual(db.calls, [
    "commerceModelPolicy.deleteMany",
    "merchantPricingPlan.deleteMany",
  ]);
  assert.equal(db.deletions, 1);
});

test("policy deletion count mismatch aborts before deleting pricing plans", async () => {
  const db = stub({
    counts: { planScopedCommerceModelPolicies: 2 },
    policyDeleteCount: 1,
  });

  await assert.rejects(
    clearPricingCatalogueWithinTransaction(db, ["one"], options, LOCAL_ENV),
    /CommerceModelPolicy deletion count differed from the preview/,
  );
  assert.deepEqual(db.calls, ["commerceModelPolicy.deleteMany"]);
  assert.equal(db.deletions, 0);
});
test("database query failure propagates without disguising the cause", async () => {
  const db = stub({
    onDelete: () => {
      throw new Error("P2003: foreign key restriction");
    },
  });
  await assert.rejects(
    clearPricingCatalogueWithinTransaction(db, ["one"], options, LOCAL_ENV),
    /P2003/,
  );
});
test("empty catalogue is idempotent and leaves operational billing untouched", async () => {
  const db = stub({ plans: [] });
  const inventory = await pricingCatalogueInventory(db);
  assert.equal(inventory.planCount, 0);
  assert.equal(inventory.matchingRetainedBillingPlans, 0);
  const result = await clearPricingCatalogueWithinTransaction(
    db,
    [],
    options,
    LOCAL_ENV,
  );
  assert.equal(result.deletedPlans, 0);
});
