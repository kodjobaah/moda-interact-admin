import { deleteImmutableShopPrompts } from './merchant-prompt-cleanup.mjs';

/**
 * Development-only, single-tenant database deletion. The database's actual foreign
 * keys remain authoritative: an unaccounted-for restriction rolls the transaction
 * back rather than causing broad/unscoped deletion.
 */
export function parseOptions(argv) {
  const [command, ...rest] = argv;
  if (!['status', 'delete'].includes(command)) {
    throw new Error('Expected status or delete. See --help.');
  }
  const values = new Map();
  const flags = new Set([
    '--confirm-test-data', '--confirm-workers-stopped',
    '--external-assets-handled', '--allow-remote-development-db',
    '--confirm-immutable-prompt-purge',
  ]);
  for (let index = 0; index < rest.length; index += 1) {
    const entry = rest[index];
    if (flags.has(entry)) {
      if (values.has(entry)) throw new Error(`Duplicate option ${entry}`);
      values.set(entry, true);
      continue;
    }
    const match = /^(--shop|--confirm-shop)(?:=(.*))?$/.exec(entry);
    if (!match) throw new Error(`Unknown argument: ${entry}`);
    const value = match[2] ?? rest[++index];
    if (!value || value.startsWith('--') || values.has(match[1])) {
      throw new Error(`${match[1]} requires exactly one value.`);
    }
    values.set(match[1], value);
  }
  const shop = values.get('--shop');
  if (!shop) throw new Error('--shop <domain-or-shop-id> is required.');
  return {
    command,
    shop,
    confirmShop: values.get('--confirm-shop'),
    confirmTestData: Boolean(values.get('--confirm-test-data')),
    confirmWorkersStopped: Boolean(values.get('--confirm-workers-stopped')),
    externalAssetsHandled: Boolean(values.get('--external-assets-handled')),
    allowRemoteDevelopmentDb: Boolean(values.get('--allow-remote-development-db')),
    confirmImmutablePromptPurge: Boolean(values.get('--confirm-immutable-prompt-purge')),
  };
}

export function validateDeletion(options, shop, inventory, env) {
  if (options.command !== 'delete') throw new Error('Delete action required.');
  if (!options.confirmTestData) {
    throw new Error('Mutation refused: --confirm-test-data is required.');
  }
  if (!options.confirmWorkersStopped) {
    throw new Error('Mutation refused: stop merchant-related workers and pass --confirm-workers-stopped.');
  }
  if (options.confirmShop !== shop.domain) {
    throw new Error(`Mutation refused: --confirm-shop must exactly match ${shop.domain}.`);
  }
  const environments = [
    env.NODE_ENV, env.MODA_ENVIRONMENT, env.DEPLOYMENT_ENVIRONMENT_NAME,
    env.DEPLOYMENT_ENVIRONMENT, env.RENDER_ENV,
  ].filter(Boolean).map((value) => String(value).trim().toLowerCase());
  if (environments.some((value) => value === 'production' || value === 'prod')) {
    throw new Error('Production merchant deletion is not supported by this development utility.');
  }
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL must be set to the development/test database.');
  let address;
  try { address = new URL(env.DATABASE_URL); }
  catch { throw new Error('DATABASE_URL is not a valid PostgreSQL URL.'); }
  if (!['postgresql:', 'postgres:'].includes(address.protocol)) {
    throw new Error('DATABASE_URL must use PostgreSQL.');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(address.hostname);
  if (!local && !options.allowRemoteDevelopmentDb) {
    throw new Error('Remote database refused. Use --allow-remote-development-db only for a verified non-production database.');
  }
  if (inventory.commerceAgentPrompts > 0 && !options.confirmImmutablePromptPurge) {
    throw new Error('Merchant has immutable ARCH-021 prompt records. Inspect the preview, then pass --confirm-immutable-prompt-purge to remove them from a disposable development/test database.');
  }
  if (inventory.merchantKnowledgeUploadedAssets > 0 && !options.externalAssetsHandled) {
    throw new Error('Merchant has uploaded knowledge assets. Delete/retain the R2 objects deliberately, then pass --external-assets-handled.');
  }
}

// Counts are a preview of major direct-shop tables, not an exhaustive foreign-key
// audit. Cascade dependants (e.g. messages and chunks) are included on deletion.
export async function merchantInventory(db, shop) {
  const scoped = { shopId: shop.id };
  const counters = {
    sessions: ['session', { shop: shop.domain }],
    customers: ['customer', scoped],
    checkoutRecoveries: ['checkoutRecovery', scoped],
    conversations: ['conversation', { OR: [scoped, { checkoutRecovery: { is: scoped } }] }],
    billingPeriods: ['billingPeriod', scoped],
    usageEvents: ['usageEvent', scoped],
    billingOperations: ['billingOperation', scoped],
    usageReservations: ['usageReservation', scoped],
    recoveryCreditPurchases: ['recoveryCreditPurchase', scoped],
    recoveryCreditRefunds: ['recoveryCreditRefund', scoped],
    promotionalCreditGrants: ['promotionalCreditGrant', scoped],
    merchantSupportThreads: ['merchantSupportThread', scoped],
    commerceAuditEvents: ['commerceAuditEvent', scoped],
    billingAuditEvents: ['billingAuditEvent', scoped],
    commerceAgentConfigurations: ['commerceAgentConfiguration', scoped],
    commerceAgentPrompts: ['commerceAgentPrompt', scoped],
    commerceAgentPromptRevisions: ['commerceAgentPromptRevision', { prompt: { is: scoped } }],
    commerceModelAvailability: ['commerceModelAvailability', scoped],
    commerceStudioMerchantAccess: ['commerceStudioMerchantAccess', scoped],
    merchantKnowledgeSources: ['merchantKnowledgeSource', scoped],
    merchantKnowledgeUploadedAssets: ['merchantKnowledgeUploadedAsset', scoped],
  };
  const entries = await Promise.all(Object.entries(counters).map(async ([key, [delegate, where]]) => [
    key, await db[delegate].count({ where }),
  ]));
  return Object.fromEntries(entries);
}

const byShop = (shopId) => ({ where: { shopId } });

/** Only shop-owned rows are explicitly removed. Global catalogue rows survive. */
export async function deleteMerchantDatabaseRows(tx, shop, { confirmImmutablePromptPurge = false } = {}) {
  const shopId = shop.id;
  const removed = {};
  const erase = async (name, args) => {
    const result = await tx[name].deleteMany(args);
    removed[name] = result.count;
  };

  // Unlinked receipts can retain provider payloads; linked receipts must be
  // deleted before the BillingOperation FK would be set null by a cascade.
  await erase('wooCommerceBillingWebhookReceipt', {
    where: { billingOperation: { is: { shopId } } },
  });
  await erase('billingAuditEvent', byShop(shopId));

  // Some audit rows have no shopId themselves but reference shop-owned objects.
  await erase('commerceAuditEvent', { where: { OR: [
    { shopId },
    { merchantActor: { is: { shopId } } },
    { merchantAccess: { is: { shopId } } },
    { agentConfiguration: { is: { shopId } } },
    { modelAvailability: { is: { shopId } } },
    { modelCatalogueEntry: { is: { availability: { is: { shopId } } } } },
    { agentPrompt: { is: { shopId } } },
    { agentPromptRevision: { is: { prompt: { is: { shopId } } } } },
  ] } });
  await erase('commerceExternalConnectionAudit', byShop(shopId));
  await erase('commerceExternalCredential', byShop(shopId));
  await erase('commerceStudioMerchantAccess', byShop(shopId));
  await erase('commerceShopProfile', byShop(shopId));
  await erase('commerceAgentConfiguration', byShop(shopId));
  await deleteImmutableShopPrompts(tx, shopId, erase, confirmImmutablePromptPurge);
  await erase('commerceModelCatalogueEntry', {
    where: { availability: { is: { shopId } } },
  });
  await erase('commerceModelAvailability', byShop(shopId));

  // Source revisions reference uploaded assets with RESTRICT, so sources and
  // their cascading revisions/chunks must be removed before uploaded assets.
  await erase('merchantKnowledgeSource', byShop(shopId));
  await erase('merchantKnowledgeUploadedAsset', byShop(shopId));

  // These are not linked by an FK. Remove only requests for translations tied
  // to this merchant's support messages, before support messages cascade away.
  removed.merchantTranslationReconciliationRequest = await tx.$executeRaw`
    DELETE FROM support."MerchantTranslationReconciliationRequest" AS request
    USING support."MerchantMessageTranslation" AS translation,
          support."MerchantSupportMessage" AS message,
          support."MerchantSupportThread" AS thread
    WHERE request."translationId" = translation."id"
      AND translation."messageId" = message."id"
      AND message."threadId" = thread."id"
      AND thread."shopId" = ${shopId}
  `;

  // FK restrictions between grants/reservations, purchases/refunds, and
  // subscriptions/billing periods require explicit ordering.
  await erase('merchantPromotionSelection', byShop(shopId));
  await erase('usageReservation', byShop(shopId));
  await erase('promotionalCreditGrant', byShop(shopId));
  await erase('promotionCampaignEvent', {
    where: { campaign: { is: { targetShopId: shopId } } },
  });
  await erase('promotionCampaign', { where: { targetShopId: shopId } });
  await erase('recoveryCreditRefund', byShop(shopId));
  await erase('recoveryCreditPurchase', byShop(shopId));
  await erase('billingPeriod', byShop(shopId));

  // The database enforces remaining CASCADE / SET NULL / RESTRICT relations.
  // On any unhandled restriction, Prisma rolls the WHOLE transaction back.
  await tx.shop.delete({ where: { id: shopId } });
  removed.shop = 1;
  await erase('session', { where: { shop: shop.domain } });
  return removed;
}
