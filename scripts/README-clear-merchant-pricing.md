# Clear the Merchant Pricing catalogue (development/test only)

`admin:clear-merchant-pricing` resets **all** `billing.MerchantPricingPlan`
records, rather than only deterministic test-seed plans.

Deleting each plan cascades through its translations, feature assignments,
merchant-facing highlights and translations, usage-event pricing definitions and
tiers. It does **not** delete `BillingPlan`, subscriptions, billing periods,
financial operations, refunds, charges, audits, merchant shops or platform features.

## Inspect the target first

```bash
cd moda-interact-admin
npm run admin:clear-merchant-pricing -- status
```

The read-only preview prints the PostgreSQL host and database name (never the
password), total plans, child-table counts, materialized-plan counts and the
number of linked BillingOperations. It also reports the number of matching
retained `BillingPlan` records.

## Delete (verified disposable development/test database only)

Back up the selected database, verify the connection, and stop *all services and
workers that can register/reconcile pricing plans* before resetting the catalogue.
Use the exact database name displayed by the status command:

```bash
npm run admin:clear-merchant-pricing -- delete \
  --confirm-test-data \
  --confirm-delete-all-pricing \
  --confirm-workers-stopped \
  --confirm-database DATABASE_NAME
```

For a **verified remote development/test** database, additionally pass
`--allow-remote-development-db`. If the preview shows previously materialized
plans, inspect what will remain in `BillingPlan` and provider subscriptions,
then explicitly pass `--confirm-materialized-plans` for *disposable* data.

Any `BillingOperation` referencing a MerchantPricing plan or a pricing usage
entry **blocks the entire reset**. Those operations are protected financial
records; this script does not delete them, detach their foreign keys or weaken
constraints. Resolve that separate historical-data decision before retrying.

The script runs within one serializable Prisma transaction and verifies that
the catalogue becomes empty. PostgreSQL foreign keys and architecture
validation triggers remain enabled. A failure rolls back the deletion.

## Scope and limitations

- This is a catalogue reset across **all** merchants, not one shop's deletion.
- Deleting the catalogue does **not** remove Shopify/WooCommerce provider plans.
- Existing `BillingPlan`, subscriptions, entitlement counters and historical
  transactions are intentionally retained. Their handles may remain in use.
- A later production migration may seed default catalogue records again; this
  script changes no migration or bootstrap behaviour.
- The full operation has not been verified against a live PostgreSQL database
  unless you run and inspect it in your test environment.
- Errors are printed in full locally; redact details before sharing logs.
