/**
 * Development/test-only MerchantPricing catalogue reset. No merchant, subscription,
 * financial-history or platform configuration rows are deleted by this module.
 */
const DELETE_FLAG = '--confirm-delete-all-pricing';
const TEST_FLAG = '--confirm-test-data';
const WORKERS_FLAG = '--confirm-workers-stopped';
const MATERIALIZED_FLAG = '--confirm-materialized-plans';
const REMOTE_FLAG = '--allow-remote-development-db';

export function parsePricingResetOptions(argv) {
  const [command, ...rest] = argv;
  if (command !== 'status' && command !== 'delete') {
    throw new Error('Expected status or delete. See --help.');
  }
  const switches = new Set([DELETE_FLAG, TEST_FLAG, WORKERS_FLAG, MATERIALIZED_FLAG, REMOTE_FLAG]);
  const values = new Map();
  for (let index = 0; index < rest.length; index += 1) {
    const option = rest[index];
    if (switches.has(option)) {
      if (values.has(option)) throw new Error(`Duplicate option: ${option}`);
      values.set(option, true);
      continue;
    }
    const match = /^(--confirm-database)(?:=(.*))?$/.exec(option);
    if (!match) throw new Error(`Unknown argument: ${option}`);
    const value = match[2] ?? rest[++index];
    if (!value || value.startsWith('--') || values.has(match[1])) {
      throw new Error('--confirm-database requires exactly one database name.');
    }
    values.set(match[1], value);
  }
  if (command === 'status' && values.size > 0) {
    throw new Error('status is read-only and takes no confirmation flags.');
  }
  return {
    command,
    confirmDeleteAllPricing: Boolean(values.get(DELETE_FLAG)),
    confirmTestData: Boolean(values.get(TEST_FLAG)),
    confirmWorkersStopped: Boolean(values.get(WORKERS_FLAG)),
    confirmMaterializedPlans: Boolean(values.get(MATERIALIZED_FLAG)),
    allowRemoteDevelopmentDb: Boolean(values.get(REMOTE_FLAG)),
    confirmDatabase: values.get('--confirm-database'),
  };
}

export function databaseIdentity(env) {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  let url;
  try { url = new URL(env.DATABASE_URL); }
  catch { throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.'); }
  if (!['postgresql:', 'postgres:'].includes(url.protocol)) {
    throw new Error('DATABASE_URL must use PostgreSQL.');
  }
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!database || database.includes('/')) {
    throw new Error('DATABASE_URL must identify exactly one database.');
  }
  return {
    database,
    host: url.hostname,
    isLocal: ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname),
  };
}

export function assertPricingResetAllowed(options, inventory, env) {
  if (options.command !== 'delete') throw new Error('Deletion requires the delete command.');
  const activeEnvironments = [
    env.NODE_ENV, env.MODA_ENVIRONMENT, env.DEPLOYMENT_ENVIRONMENT_NAME,
    env.DEPLOYMENT_ENVIRONMENT, env.RENDER_ENV,
  ].filter(Boolean).map((value) => String(value).trim().toLowerCase());
  if (activeEnvironments.some((value) => ['production', 'prod'].includes(value))) {
    throw new Error('Production MerchantPricing deletion is not supported.');
  }
  const identity = databaseIdentity(env);
  if (!options.confirmTestData || !options.confirmDeleteAllPricing || !options.confirmWorkersStopped) {
    throw new Error('Deletion requires --confirm-test-data, --confirm-delete-all-pricing and --confirm-workers-stopped.');
  }
  if (options.confirmDatabase !== identity.database) {
    throw new Error(`Deletion requires --confirm-database ${identity.database} (verify the database first).`);
  }
  if (!identity.isLocal && !options.allowRemoteDevelopmentDb) {
    throw new Error('Remote database refused. --allow-remote-development-db is required for verified non-production databases.');
  }
  if (inventory.billingOperationsReferencingPricing > 0) {
    throw new Error(
      `Deletion refused: ${inventory.billingOperationsReferencingPricing} BillingOperation record(s) reference MerchantPricing plans or usage events. ` +
      'Preserve those financial records; resolve the dependency in a separate reviewed task.',
    );
  }
  if (inventory.materializedPlans > 0 && !options.confirmMaterializedPlans) {
    throw new Error(
      `Deletion refused: ${inventory.materializedPlans} plan(s) were materialized. ` +
      'Inspect retained BillingPlan/subscription state and use --confirm-materialized-plans only for disposable test data.',
    );
  }
}

export async function pricingCatalogueInventory(db) {
  const plans = await db.merchantPricingPlan.findMany({
    select: { id: true, displayName: true, shopifyPlanHandle: true, materializedAt: true },
    orderBy: [{ cataloguePosition: 'asc' }, { id: 'asc' }],
  });
  const [
    translations, highlights, highlightTranslations, usageEvents, usageTiers,
    features, billingOperationsReferencingPricing, billingPlans,
  ] = await Promise.all([
    db.merchantPricingPlanTranslation.count(),
    db.merchantPricingPlanHighlight.count(),
    db.merchantPricingPlanHighlightTranslation.count(),
    db.merchantPricingUsageEvent.count(),
    db.merchantPricingUsageTier.count(),
    db.merchantPricingPlanFeature.count(),
    db.billingOperation.count({ where: { OR: [
      { merchantPricingPlanId: { not: null } },
      { merchantPricingUsageEventId: { not: null } },
    ] } }),
    plans.length ? db.billingPlan.count({
      where: { shopifyPlanHandle: { in: plans.map((plan) => plan.shopifyPlanHandle) } },
    }) : Promise.resolve(0),
  ]);
  return {
    planCount: plans.length,
    materializedPlans: plans.filter((plan) => plan.materializedAt !== null).length,
    translations,
    highlights,
    highlightTranslations,
    usageEvents,
    usageTiers,
    features,
    billingOperationsReferencingPricing,
    matchingRetainedBillingPlans: billingPlans,
    plans,
  };
}

/** Execute only within the caller's Prisma transaction. */
export async function clearPricingCatalogueWithinTransaction(tx, expectedPlanIds, options, env) {
  const inventory = await pricingCatalogueInventory(tx);
  assertPricingResetAllowed(options, inventory, env);
  const currentIds = inventory.plans.map((plan) => plan.id);
  if (JSON.stringify(currentIds) !== JSON.stringify(expectedPlanIds)) {
    throw new Error('MerchantPricing catalogue changed after preview; deletion cancelled.');
  }
  const result = await tx.merchantPricingPlan.deleteMany({});
  if (result.count !== inventory.planCount) {
    throw new Error('MerchantPricing deletion count differed from the preview; transaction cancelled.');
  }
  if (await tx.merchantPricingPlan.count() !== 0) {
    throw new Error('MerchantPricing catalogue is not empty; transaction cancelled.');
  }
  return { deletedPlans: result.count, deletedChildRowsByCascade: {
    translations: inventory.translations,
    highlights: inventory.highlights,
    highlightTranslations: inventory.highlightTranslations,
    usageEvents: inventory.usageEvents,
    usageTiers: inventory.usageTiers,
    features: inventory.features,
  } };
}
