/**
 * Restricted, single-shop cleanup for a disposable development/test database.
 *
 * The ARCH-021 guards intentionally prohibit deleting prompt revisions and
 * lineages during normal runtime. For an explicitly confirmed merchant purge,
 * disable ONLY those two application guards within the caller's transaction;
 * leave PostgreSQL foreign keys and all other triggers enabled. PostgreSQL DDL
 * is transactional: a failed delete rolls back the disabled-guard state too.
 *
 * Do not use outside a Prisma interactive transaction. Callers must already
 * reject production and require exact-shop / worker-stop confirmation.
 */
const REVISION_GUARD = 'ALTER TABLE commerce."CommerceAgentPromptRevision" DISABLE TRIGGER arch021_agent_prompt_revision_guard';
const LINEAGE_GUARD = 'ALTER TABLE commerce."CommerceAgentPrompt" DISABLE TRIGGER arch021_agent_prompt_guard';
const RESTORE_REVISION = 'ALTER TABLE commerce."CommerceAgentPromptRevision" ENABLE ALWAYS TRIGGER arch021_agent_prompt_revision_guard';
const RESTORE_LINEAGE = 'ALTER TABLE commerce."CommerceAgentPrompt" ENABLE TRIGGER arch021_agent_prompt_guard';

function verifyGuards(rows) {
  const expected = new Map([
    ['CommerceAgentPromptRevision/arch021_agent_prompt_revision_guard', 'A'],
    ['CommerceAgentPrompt/arch021_agent_prompt_guard', 'O'],
  ]);
  if (!Array.isArray(rows) || rows.length !== expected.size) {
    throw new Error('ARCH-021 prompt trigger inspection failed; merchant deletion refused.');
  }
  for (const row of rows) {
    const key = `${row.tableName}/${row.triggerName}`;
    if (expected.get(key) !== row.enabledState || row.internal !== false) {
      throw new Error(`ARCH-021 prompt trigger ${key} differs from the expected enabled state; merchant deletion refused.`);
    }
    expected.delete(key);
  }
  if (expected.size) {
    throw new Error('ARCH-021 prompt triggers are missing; merchant deletion refused.');
  }
}

export async function deleteImmutableShopPrompts(tx, shopId, erase, confirmed) {
  const where = { shopId };
  const revisions = { where: { prompt: { is: where } } };
  const count = await tx.commerceAgentPrompt.count({ where });
  if (count === 0) {
    await erase('commerceAgentPromptRevision', revisions);
    await erase('commerceAgentPrompt', { where });
    return;
  }
  if (!confirmed) {
    throw new Error('ARCH-021 prompt purge not confirmed: pass --confirm-immutable-prompt-purge.');
  }

  // Validate that these are exactly the guards installed by the inspected
  // migrations. If a later migration changes guard names/modes, fail closed.
  const guards = await tx.$queryRaw`
    SELECT c.relname AS "tableName", t.tgname AS "triggerName",
           t.tgenabled AS "enabledState", t.tgisinternal AS "internal"
    FROM pg_catalog.pg_trigger AS t
    JOIN pg_catalog.pg_class AS c ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'commerce' AND (
      (c.relname = 'CommerceAgentPromptRevision' AND t.tgname = 'arch021_agent_prompt_revision_guard') OR
      (c.relname = 'CommerceAgentPrompt' AND t.tgname = 'arch021_agent_prompt_guard')
    )
  `;
  verifyGuards(guards);

  // ALTER TABLE locks only these two tables. Fail quickly if another session
  // is active rather than waiting on a live shared development database.
  await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
  await tx.$executeRawUnsafe(REVISION_GUARD);
  await tx.$executeRawUnsafe(LINEAGE_GUARD);

  // A failure inside this region aborts the caller's Prisma transaction; that
  // rollback restores the two guards. On success restore their precise modes
  // before the transaction commits. Do not catch a transaction-aborted error
  // and try to run more SQL against it.
  await erase('commerceAgentPromptRevision', revisions);
  await erase('commerceAgentPrompt', { where });
  await tx.$executeRawUnsafe(RESTORE_REVISION);
  await tx.$executeRawUnsafe(RESTORE_LINEAGE);
}
