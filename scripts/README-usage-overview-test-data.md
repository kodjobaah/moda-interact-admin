# Usage Overview manual test data

This guide covers the fixture used to exercise the merchant **Usage overview** page and the pages reached from it.

Run commands from:

```bash
cd /Users/kwadwoadomafriyie/project/moda-interact-workspace/moda-interact-admin
```

The script is:

```text
scripts/seed-usage-overview-test-data.mjs
```

The npm command is:

```bash
npm run admin:seed-usage-overview -- ...
```

## Safety

Mutating commands require:

```text
--confirm-test-data
```

The fixture is shop-scoped and uses deterministic IDs beginning with:

```text
manual-usage-overview-
```

It does not create or alter a Shopify subscription. The target shop must already have a Moda `Subscription` projected from Shopify.

## Check current fixture state

```bash
npm run admin:seed-usage-overview -- \
  status \
  --shop eugene-bdx7mzhn.myshopify.com
```

The `--shop` value may be either the Shopify domain or Moda's internal `Shop.id`.

## Seed PostgreSQL test data

```bash
npm run admin:seed-usage-overview -- \
  seed \
  --shop eugene-bdx7mzhn.myshopify.com \
  --confirm-test-data
```

This creates:

- 11 named test customers;
- one guest customer grouping;
- 13 checkout recoveries;
- all six recovery statuses: `COMPLETED`, `ENGAGED`, `MESSAGE_SENT`, `DETECTED`, `EXPIRED`, and `CANCELLED`;
- recovery conversations;
- messages covering `DELIVERED`, `SENT`, and `FAILED` display states;
- linked recovery usage events;
- 27 current-period usage events;
- three closed billing periods containing 16, 11, and 7 usage events respectively;
- enough customer groups to exercise Recovery breakdown pagination;
- enough current usage rows to exercise Billable usage pagination.

If the shop already has an OPEN billing period, the fixture places current usage in that real period. If there is no OPEN period, the script creates a fixture OPEN period for display testing but does not assign it to `Subscription.billingPeriodId`.

## Seed Pending Recoveries as well

Pending Recoveries is not read from PostgreSQL. The merchant page reads BullMQ state from Redis.

To exercise that section, run:

```bash
npm run admin:seed-usage-overview -- \
  seed \
  --shop eugene-bdx7mzhn.myshopify.com \
  --confirm-test-data \
  --with-pending
```

`REDIS_URL` must be configured.

This creates 12 fixture jobs on:

```text
pending-recovery-candidates
```

using the real job name:

```text
evaluate-pending-recovery
```

They are deliberately scheduled about seven days into the future, so the live recovery worker should leave them in BullMQ's `delayed` state during normal manual testing.

The merchant UI renders that state as **Scheduled**.

The 12 rows are enough to exercise:

- Pending Recoveries table rendering;
- Last activity;
- Recovery scheduled;
- Status badge;
- Last updated;
- Refresh;
- Previous / Next pagination;
- Page 1 / Page 2.

The fixture intentionally does **not** manufacture BullMQ `active` jobs. An `active` job is owned by a running worker, and forcing that state would risk causing test data to enter the real recovery workflow.

## Manual test sequence

After seeding, open the merchant application at `/app`.

### Usage Overview

Verify:

- Current usage is non-zero and renders a chart/legend;
- Past paid usage is non-zero;
- the past-bill dropdown contains the three fixture closed periods;
- Pending Recoveries renders rows when `--with-pending` was used;
- Pending Recoveries Previous/Next works;
- Refresh completes and preserves the fixture jobs.

### View current bill

Click **View current bill**.

Verify the bill dashboard shows populated:

- Abandoned checkouts;
- Recovered checkouts;
- Recovery rate;
- Recovered revenue, including multiple currencies;
- Messages sent;
- Recovery breakdown chart;
- all recovery status legend entries;
- more than ten customer groups, so Previous/Next pagination can be exercised;
- a customer details dialog;
- multiple recoveries for at least one customer;
- conversation messages;
- linked billable actions.

Then click **View all usage for this bill**.

Verify:

- 27 current usage events exist;
- page size defaults to 10;
- Previous/Next works;
- page sizes 10, 25, 50, and 100 can be selected;
- Recovery and Customer columns are populated rather than all showing `Unlinked`;
- Quantity, idempotency key, and Recorded columns are populated.

### Past monthly bills

Return to `/app` and select one of the seeded past bills from **View a past monthly bill**.

Then click **View all usage for this bill** and verify the selected closed period is used.

The three seeded periods contain different event counts:

```text
Past bill 1: 16 events
Past bill 2: 11 events
Past bill 3:  7 events
```

This lets you verify both paginated and non-paginated past bills.

On the Billable usage page, use **Select a past bill** to switch directly between closed periods and confirm the page resets to page 1.

## Delete the fixture

```bash
npm run admin:seed-usage-overview -- \
  delete \
  --shop eugene-bdx7mzhn.myshopify.com \
  --confirm-test-data
```

This removes only fixture-owned:

- UsageEvents;
- fixture BillingPeriods;
- ConversationMessages;
- Conversations;
- CheckoutRecoveries;
- Customers;
- Pending Recovery BullMQ jobs and their Redis indexes when `REDIS_URL` is available.

An existing merchant OPEN BillingPeriod that was merely reused is never deleted.

## Re-seeding

`seed` is deterministic. Before recreating the fixture, it removes the previous fixture data for that shop.

Therefore you can repeatedly run:

```bash
npm run admin:seed-usage-overview -- \
  seed \
  --shop eugene-bdx7mzhn.myshopify.com \
  --confirm-test-data \
  --with-pending
```

without accumulating duplicate fixture rows.

## Important implementation observation

In the current snapshot, choosing a current or past bill changes the selected `BillingPeriod` and the link used by **View all usage for this bill**. The Billable usage page correctly filters `UsageEvent` rows by that period.

However, the intermediate dashboard reached by **View current bill** / a past-bill selection currently builds its performance statistics and Recovery breakdown from all checkout recoveries for the shop rather than filtering those recoveries to the selected billing period.

The fixture therefore lets you observe that behaviour clearly. If the intended product behaviour is for the entire bill dashboard to be period-specific, that is an application change rather than a seed-data issue.
