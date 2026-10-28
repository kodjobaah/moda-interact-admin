# Delete one merchant's development/test database data

`npm run admin:delete-merchant-data` is a deliberate, development-only tenant reset utility.
It is **not** a production merchant offboarding, legal retention or GDPR erasure workflow.
It deletes the selected `commerce.Shop` row plus related database rows; PostgreSQL
foreign keys cascade other child records. Global plan/catalogue/admin configuration
is preserved. A newly installed merchant would be provisioned afresh.

## Inspect without deleting

```bash
cd moda-interact-admin
npm run admin:delete-merchant-data -- status --shop example.myshopify.com
npm run admin:delete-merchant-data -- status --shop shop.example.com
```

The preview covers selected merchant-owned tables (including customers,
recoveries, conversations, usage, billing, support and knowledge) and prints
counts, not customer details. Additional cascade child rows are not counted.

## Delete exactly one development/test shop

**Back up the dev database, stop API/Background/Shopify/Woo/Commerce workers,
and verify `DATABASE_URL` before deletion.** The script does not stop running
services itself. Never run this against a production database.

```bash
npm run admin:delete-merchant-data -- delete \
  --shop example.myshopify.com \
  --confirm-shop example.myshopify.com \
  --confirm-test-data \
  --confirm-workers-stopped
```

For WooCommerce, pass the store's canonical domain in the same options:

```bash
npm run admin:delete-merchant-data -- status --shop shop.example.com
npm run admin:delete-merchant-data -- delete \\
  --shop shop.example.com \\
  --confirm-shop shop.example.com \\
  --confirm-test-data \\
  --confirm-workers-stopped
```

For Shopify, use the shop's `.myshopify.com` domain as shown in the first
example. The command resolves either provider domain to one `Shop` record and
removes its shop-owned installation data. Always run `status` first and review
the platform and preview counts; the confirmation domain must match exactly.

If the database is a verified **remote development/test** instance, also pass
`--allow-remote-development-db`. The command refuses remote databases otherwise,
and refuses environments explicitly marked `production` or `prod`. Environment
checks cannot independently prove that a connection is safe: verify the DB
host and name yourself. Exact-domain confirmation is always required, even if
`--shop` is a shop ID.

If the preview reports `commerceAgentPrompts > 0`, deletion requires an extra
`--confirm-immutable-prompt-purge` flag. This authorises the script to suspend
**only** the two ARCH-021 prompt immutability guards during the transaction.
The revision guard is restored in its original `ENABLE ALWAYS` mode. The
lineage guard is restored in its original enabled mode. This requires
PostgreSQL table-owner privileges and briefly locks the protected tables, so
stop all writers in this disposable development/test environment first.
Foreign-key triggers are not disabled. A transaction rollback restores the
original trigger states and any deleted rows; normal production prompt
immutability is unchanged. This is NOT a production data-erasure mechanism.

If the preview reports `commerceAuditEvents > 0` or
`commerceExternalConnectionAudits > 0`, deletion also requires
`--confirm-immutable-audit-purge`. This authorises suspension of only the
`CommerceAuditEvent` and `CommerceExternalConnectionAudit` application
immutability triggers inside the same transaction. The script verifies the
expected trigger names and enabled states first, uses a short lock timeout, and
restores both triggers before commit. Foreign-key triggers remain enabled, and
any failure rolls back the audit deletions and trigger changes with the rest of
the transaction. This permanently removes that merchant's audit history and is
appropriate only for explicitly disposable development/test data. It is not a
way to erase retained production audit records.

If the preview shows uploaded Merchant Knowledge assets, delete/retain their
R2 objects deliberately before deleting the database records and pass
`--external-assets-handled`. The tool deliberately does not contain storage
credentials or issue remote object deletions.

## What this does *not* remove

- Redis/BullMQ waiting, active, delayed or retried jobs; ensure workers are
  stopped and queues are cleared separately in disposable environments.
- R2 or other object-storage blobs (Merchant Knowledge, media, etc.).
- Provider-side Shopify/Meta/WooCommerce records or webhook subscriptions.
- `WooCommerceBillingWebhookReceipt` records lacking a billing-operation link,
  or other global/orphaned records without a reliable tenant foreign key.
- Shared billing plans, promotional campaigns for other shops, model/provider
  catalogue entries or platform/admin settings.
- Global translation batches potentially shared by multiple merchants.

If any unexpected database FK restriction occurs, the transaction fails and
rolls back. Investigate the restriction; **do not disable foreign keys or cascade
by manually clearing unrelated rows**. The source schema is authoritative.

## Validation

```bash
node --test tests/security/admin-delete-merchant-data.test.mjs
npm test
```

A real disposable-PostgreSQL integration test is still needed before treating
this as a verified full tenant wipe across every installed migration.
