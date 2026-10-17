/**
 * Explicitly confirmed, single-shop audit cleanup for disposable development/test data.
 *
 * Audit rows are immutable during normal operation. Suspend only the two known
 * application immutability triggers inside the caller's transaction. Foreign-key
 * triggers remain enabled, and any failure rolls back the whole transaction.
 */
const AUDIT_EVENT_GUARD = 'ALTER TABLE commerce."CommerceAuditEvent" DISABLE TRIGGER arch021_audit_immutable';
const EXTERNAL_AUDIT_GUARD = 'ALTER TABLE commerce."CommerceExternalConnectionAudit" DISABLE TRIGGER "CommerceExternalConnectionAudit_immutable_trigger"';
const RESTORE_AUDIT_EVENT_GUARD = 'ALTER TABLE commerce."CommerceAuditEvent" ENABLE TRIGGER arch021_audit_immutable';
const RESTORE_EXTERNAL_AUDIT_GUARD = 'ALTER TABLE commerce."CommerceExternalConnectionAudit" ENABLE TRIGGER "CommerceExternalConnectionAudit_immutable_trigger"';

export function commerceAuditEventShopWhere(shopId) {
  return { OR: [
    { shopId },
    { merchantActor: { is: { shopId } } },
    { merchantAccess: { is: { shopId } } },
    { agentConfiguration: { is: { shopId } } },
    { modelAvailability: { is: { shopId } } },
    { modelCatalogueEntry: { is: { availability: { is: { shopId } } } } },
    { agentPrompt: { is: { shopId } } },
    { agentPromptRevision: { is: { prompt: { is: { shopId } } } } },
  ] };
}

export function commerceExternalAuditShopWhere(shopId) {
  return { shopId };
}

function verifyGuards(rows) {
  const expected = new Map([
    ['CommerceAuditEvent/arch021_audit_immutable', 'O'],
    ['CommerceExternalConnectionAudit/CommerceExternalConnectionAudit_immutable_trigger', 'O'],
  ]);
  if (!Array.isArray(rows) || rows.length !== expected.size) {
    throw new Error('Commerce audit trigger inspection failed; merchant deletion refused.');
  }
  for (const row of rows) {
    const key = `${row.tableName}/${row.triggerName}`;
    if (expected.get(key) !== row.enabledState || row.internal !== false) {
      throw new Error(`Commerce audit trigger ${key} differs from the expected enabled state; merchant deletion refused.`);
    }
    expected.delete(key);
  }
  if (expected.size) {
    throw new Error('Commerce audit triggers are missing; merchant deletion refused.');
  }
}

export async function deleteImmutableShopAudits(tx, shopId, erase, confirmed) {
  const commerceAuditWhere = commerceAuditEventShopWhere(shopId);
  const externalAuditWhere = commerceExternalAuditShopWhere(shopId);
  const [commerceAuditCount, externalAuditCount] = await Promise.all([
    tx.commerceAuditEvent.count({ where: commerceAuditWhere }),
    tx.commerceExternalConnectionAudit.count({ where: externalAuditWhere }),
  ]);

  if (commerceAuditCount + externalAuditCount > 0 && !confirmed) {
    throw new Error('Immutable commerce audit purge not confirmed: pass --confirm-immutable-audit-purge.');
  }

  if (commerceAuditCount + externalAuditCount > 0) {
    const guards = await tx.$queryRaw`
      SELECT c.relname AS "tableName", t.tgname AS "triggerName",
             t.tgenabled AS "enabledState", t.tgisinternal AS "internal"
      FROM pg_catalog.pg_trigger AS t
      JOIN pg_catalog.pg_class AS c ON c.oid = t.tgrelid
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'commerce' AND (
        (c.relname = 'CommerceAuditEvent' AND t.tgname = 'arch021_audit_immutable') OR
        (c.relname = 'CommerceExternalConnectionAudit' AND t.tgname = 'CommerceExternalConnectionAudit_immutable_trigger')
      )
    `;
    verifyGuards(guards);

    await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
    await tx.$executeRawUnsafe(AUDIT_EVENT_GUARD);
    await tx.$executeRawUnsafe(EXTERNAL_AUDIT_GUARD);
  }

  await erase('commerceAuditEvent', { where: commerceAuditWhere });
  await erase('commerceExternalConnectionAudit', { where: externalAuditWhere });

  if (commerceAuditCount + externalAuditCount > 0) {
    await tx.$executeRawUnsafe(RESTORE_AUDIT_EVENT_GUARD);
    await tx.$executeRawUnsafe(RESTORE_EXTERNAL_AUDIT_GUARD);
  }
}