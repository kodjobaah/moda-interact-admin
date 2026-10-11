#!/usr/bin/env node

import process from 'node:process';
import { PrismaClient } from '@prisma/client';
import {
  deleteMerchantDatabaseRows,
  merchantInventory,
  parseOptions,
  validateDeletion,
} from './merchant-data-deletion-core.mjs';

const HELP = `
Delete ONE merchant's DEVELOPMENT/TEST database data (including its Shop row).

Read-only preview:
  npm run admin:delete-merchant-data -- status --shop example.myshopify.com

Destructive deletion (development/test only):
  npm run admin:delete-merchant-data -- delete --shop example.myshopify.com \\
    --confirm-shop example.myshopify.com --confirm-test-data \\
    --confirm-workers-stopped

If merchant uploaded Merchant Knowledge files, first handle the R2 objects and
also provide --external-assets-handled. For verified remote DEV databases only,
add --allow-remote-development-db. If the preview shows ARCH-021 agent prompt
records, also pass --confirm-immutable-prompt-purge to authorise temporarily
suspending the two prompt immutability guards inside the rollback-safe transaction.
This needs table-owner privileges; foreign-key triggers are never disabled.

IMPORTANT: This removes the merchant's Shop, billing history, recoveries,
conversations and associated relational data. It is irreversible. It never
removes shared plans/platform settings. It cannot remove R2 objects, Redis/BullMQ
jobs, external Shopify/Meta resources, or unlinked provider webhook receipts.
Stop worker processes before running; use only a disposable/test tenant.
`;

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(HELP.trim());
    return;
  }
  const options = parseOptions(process.argv.slice(2));
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set to the correct development/test database.');
  }
  const prisma = new PrismaClient();
  try {
    const identifier = options.shop.trim();
    const shop = await prisma.shop.findFirst({
      where: { OR: [{ id: identifier }, { domain: identifier.toLowerCase() }] },
      select: { id: true, domain: true, platform: true, status: true },
    });
    if (!shop) throw new Error(`Merchant not found: ${identifier}`);
    const inventory = await merchantInventory(prisma, shop);
    console.log(JSON.stringify({
      action: options.command,
      shop,
      inventory,
      note: 'Counts cover major direct-shop tables; cascade children are additional.',
      externalData: 'R2 assets, Redis/BullMQ jobs and external services are not removed.',
    }, null, 2));
    if (options.command === 'status') return;

    validateDeletion(options, shop, inventory, process.env);
    const deletion = await prisma.$transaction(async (tx) => {
      // Re-read in the transaction; do not delete a different shop if the
      // identity changed between preview and execution.
      const current = await tx.shop.findUnique({
        where: { id: shop.id },
        select: { id: true, domain: true, platform: true },
      });
      if (!current || current.domain !== shop.domain || current.platform !== shop.platform) {
        throw new Error('Merchant identity changed during deletion; transaction aborted.');
      }
      return deleteMerchantDatabaseRows(tx, current, {
        confirmImmutablePromptPurge: options.confirmImmutablePromptPurge,
      });
    }, { maxWait: 15_000, timeout: 120_000 });
    console.log(JSON.stringify({
      result: 'deleted', shopId: shop.id, domain: shop.domain,
      explicitDeletes: deletion,
      note: 'Database cascades remove additional child rows. Check external data separately.',
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  // Print the complete error and stack for local development diagnostics.
  // This may contain database details: do not post the output unredacted.
  console.error('Merchant deletion failed:', error);
  process.exitCode = 1;
});
