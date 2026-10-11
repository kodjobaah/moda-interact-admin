#!/usr/bin/env node
import process from 'node:process';
import { PrismaClient } from '@prisma/client';
import {
  parsePricingResetOptions, databaseIdentity, assertPricingResetAllowed,
  pricingCatalogueInventory, clearPricingCatalogueWithinTransaction,
} from './clear-merchant-pricing-core.mjs';

const HELP = `
Reset the entire MerchantPricing catalogue in a verified DEVELOPMENT/TEST database.
This deletes all MerchantPricingPlan records and cascading translations, highlights,
usage-price definitions/tiers and plan-feature links for ALL shops. It does NOT
remove BillingPlan, subscriptions, billing operations, charges or merchant records.

Read-only preview:
  npm run admin:clear-merchant-pricing -- status

Delete all plans (only after backup and stopping relevant workers):
  npm run admin:clear-merchant-pricing -- delete \\
    --confirm-test-data --confirm-delete-all-pricing --confirm-workers-stopped \\
    --confirm-database DATABASE_NAME

For a verified remote development database, add --allow-remote-development-db.
If materialized plans exist, inspect retained BillingPlan/subscription state and
add --confirm-materialized-plans for disposable test data only.

Refuses production and any linked BillingOperation rows. Foreign keys and
validation triggers stay enabled. Any failure rolls the transaction back.
`;

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(HELP.trim());
    return;
  }
  const options = parsePricingResetOptions(process.argv.slice(2));
  const db = databaseIdentity(process.env);
  const prisma = new PrismaClient();
  try {
    const inventory = await pricingCatalogueInventory(prisma);
    console.log(JSON.stringify({
      action: options.command,
      database: { name: db.database, host: db.host },
      catalogue: {
        ...inventory,
        plans: inventory.plans.slice(0, 50),
        ...(inventory.plans.length > 50 ? { additionalPlansNotShown: inventory.plans.length - 50 } : {}),
      },
      note: 'BillingPlan/subscriptions/charges and all merchant data are retained.',
    }, null, 2));
    if (options.command === 'status') return;
    assertPricingResetAllowed(options, inventory, process.env);
    const result = await prisma.$transaction(
      (tx) => clearPricingCatalogueWithinTransaction(
        tx, inventory.plans.map((plan) => plan.id), options, process.env,
      ),
      { maxWait: 15_000, timeout: 120_000, isolationLevel: 'Serializable' },
    );
    console.log(JSON.stringify({
      result: 'deleted', ...result,
      note: 'Only MerchantPricing catalogue and cascading child rows were removed. Operational billing records remain.',
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  // Local diagnostic only. Prisma messages can contain database details:
  // redact secrets and customer data before sharing this error.
  console.error('MerchantPricing reset failed:', error);
  process.exitCode = 1;
});
