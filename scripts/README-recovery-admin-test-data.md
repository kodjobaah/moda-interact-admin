# Recovery admin test data

This fixture is designed for the Tenant Directory → Recovery Logs workflow.

Default target:

```text
kwadwo-e4bf4mc4.myshopify.com
```

The script looks up the current `Shop.id` by domain, so it still works if the database is reset and the tenant receives a different cuid.

## What it creates

The default fixture creates:

- 10 realistic test customers;
- 31 checkout recoveries;
- a separate recovery conversation for almost every recovery;
- varied recovery states:
  - `DETECTED`
  - `MESSAGE_SENT`
  - `ENGAGED`
  - `COMPLETED`
  - `EXPIRED`
  - `CANCELLED`
- varied conversation outcomes:
  - `IN_PROGRESS`
  - `RECOVERED`
  - `NO_RESPONSE`
  - `DECLINED`
  - `EXPIRED`
- lifecycle/status-history rows for each recovery;
- realistic cart line items and GBP totals;
- realistic WhatsApp-style customer, automation and agent messages.

It intentionally includes three useful pagination cases from the current admin code:

- 10 customers → customer page size is 8, so there are multiple customer pages.
- Amelia Carter has 11 recoveries → recovery page size is 8, so there are multiple recovery pages.
- Amelia's newest recovery has 47 conversation messages → message page size is 20, so the drawer has three message pages.

The fixture uses only `example.com` email addresses and reserved-looking test phone values.

## Install

Copy:

```text
seed-recovery-admin-test-data.mjs
```

to:

```text
moda-interact-admin/scripts/seed-recovery-admin-test-data.mjs
```

From `moda-interact-admin`, ensure the Prisma client is generated:

```bash
npm run prisma:generate
```

Then seed:

```bash
node scripts/seed-recovery-admin-test-data.mjs \
  --shop=kwadwo-e4bf4mc4.myshopify.com \
  --confirm-test-data
```

The explicit confirmation flag is required so this is not accidentally run against a database you did not intend to modify.

The script prints:

- the resolved `Shop.id`;
- the Recovery Logs URL;
- a direct URL to the seeded 47-message recovery conversation.

## Re-running

The script is idempotent for its own fixture rows. Before reseeding, it removes only rows identified by these fixture prefixes:

```text
admin-recovery-seed-customer-
admin-recovery-seed-checkout-
admin-recovery-seed-message-
```

It does not delete the tenant or ordinary customers/recoveries.

## Cleanup only

```bash
node scripts/seed-recovery-admin-test-data.mjs \
  --shop=kwadwo-e4bf4mc4.myshopify.com \
  --cleanup \
  --confirm-test-data
```

Deleting the seeded recoveries cascades through their seeded conversations, messages and lifecycle history according to the existing Prisma relationships.
