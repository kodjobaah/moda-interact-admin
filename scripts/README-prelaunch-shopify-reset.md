# Pre-launch production Shopify test-data reset (temporary)

This procedure is ONLY for the pre-launch testing period. Remove the
`--prelaunch-production-reset` exception before real merchants are admitted.

Run from `moda-interact-admin` with an explicit `DATABASE_URL`. Never commit the
URL, backup, `.sha256` file, or terminal output containing production data.

## Scope

- Deletes **all currently listed Shopify merchants** from Moda's database using
  the existing *per-shop* deletion utility (Shop, installations, sessions,
  customers, billing history, recoveries, conversations, consent evidence,
  merchant settings, and dependent rows). Database foreign keys remain enabled.
- Preserves WooCommerce shops, global pricing catalogues, Admin configuration,
  shared settings, Prisma migrations and database infrastructure.
- **Does not** cancel Shopify subscriptions/uninstall apps, revoke Meta resources,
  clean Redis/BullMQ jobs, or delete R2 assets. Review these separately before
  deletion; R2 assets with known database references still require per-shop
  acknowledgement. Do not indiscriminately flush shared Redis.
- The existing CLI inventory is not exhaustive; restrictive database FKs fail
  the per-shop transaction closed rather than cascading into unrelated data.

## Before running

1. Confirm no real customers or live merchant data exists. This mode must be
   removed before launch.
2. Reconcile or cancel active Shopify test subscriptions and uninstall/reinstall
   the test app as appropriate for a genuinely fresh Shopify-side lifecycle.
3. Pause API/Shopify/Admin/Background/Commerce writers and all queue processors.
   Block incoming webhook processing during the reset window.
4. Identify and clean only shop-owned delayed Redis jobs and R2 objects using
   their established ownership mappings; do **not** flush shared queues/buckets.
5. Ensure local Colima is running, `docker info` succeeds, and `pg_dump`,
   `pg_restore`, `psql`, `shasum`, `npm`, `node` are installed.
6. Ensure local disk can hold a full database backup and Docker image
   `pgvector/pgvector:pg<production-major>` is available. The script uses a
   network-isolated disposable restore container. PostgreSQL extensions or
   incompatibilities may cause this restore to fail and block deletion.

## Preview first

```bash
./delete_shopify_merchants.sh --prelaunch-preview
```

This is read-only and works specifically with the production database named
`moda_interact_postgres_production`. Review the full list of Shopify shops.

## Execute, after an independently reviewed preview

```bash
./delete_shopify_merchants.sh --prelaunch-execute
```

Interactive confirmations include `PRELAUNCH-TEST-ONLY`, the database name,
`STOPPED`, `DELETE-ALL-SHOPIFY`, `EXTERNAL-STATE-REVIEWED`, and each exact shop
name. Immutable audit, prompt, consent, and R2 confirmations remain intact.

The command creates a timestamped **full database** custom-format backup in
`~/moda-backups/` with private permissions and a `.sha256` checksum, then
actually restores the backup into an isolated Docker/Colima PostgreSQL instance.
If any backup or restore check fails, **no deletion begins**. Each shop is then
removed in its own database transaction: a later failure can leave a **partial
reset**. Keep the verified backup so the database can be restored if needed.

Afterward verify Shopify merchants are absent from the Moda database, WooCommerce
shop identities are unchanged, and no merchant-owned activity or retries remain
in Redis, R2 and provider systems before restarting services.

A `pg_dump` backup does not contain PostgreSQL cluster-global roles, Redis,
R2 or Shopify provider data. Do not treat it as a full infrastructure backup.
