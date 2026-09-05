# Shopify Dashboard Test Data

This utility creates deterministic test data for the Moda Interact Shopify dashboard and can later remove only the rows that it created.

It is intended for development and test environments.

## Files

Place the following files somewhere convenient in the project:

```text
shopify_dashboard_test_data.py
README-shopify-dashboard-test-data.md
```

For example:

```text
scripts/
  shopify_dashboard_test_data.py
  README-shopify-dashboard-test-data.md
```

The commands below assume you are running them from the directory containing the Python script. Adjust the path if you store it elsewhere.

## What the script creates

The comprehensive seed covers the dashboard scenarios currently represented by the Shopify application, including:

- all checkout recovery states:
  - `DETECTED`
  - `MESSAGE_SENT`
  - `ENGAGED`
  - `COMPLETED`
  - `EXPIRED`
  - `CANCELLED`
- current and historical recoveries
- guest recoveries with no customer
- customers with one recovery
- a customer with multiple recoveries
- recoveries with conversations
- recoveries without conversations
- all conversation types
- inbound and outbound WhatsApp messages
- message sender types:
  - `CUSTOMER`
  - `AGENT`
  - `AUTOMATION`
  - `HUMAN`
- message states:
  - `PENDING`
  - `SENT`
  - `DELIVERED`
  - `READ`
  - `FAILED`
- billing usage metrics:
  - `checkout_recovery`
  - `conversation`
  - `agent_message`
  - `whatsapp_message`
- linked and deliberately unlinked usage events
- one current/open billing period
- multiple historical/paid billing periods
- enough customers to exercise customer pagination
- enough usage events to exercise usage pagination

## Safety

The script uses deterministic IDs beginning with:

```text
mi_dash_test
```

The `clean` command removes only rows created with this prefix.

The script does **not**:

- delete the Shop
- delete unrelated customer data
- delete unrelated checkout recoveries
- overwrite an existing `ShopSettings` row
- overwrite an existing `Subscription` row

If the target Shop has no dashboard access configuration, the seed command may create test-owned:

- `ShopSettings`
- `BillingPlan`
- `Subscription`

These are also removed by `clean` because they use the test prefix.

## Requirements

You need:

- Python 3
- access to the target PostgreSQL database
- the `psycopg` Python package

### macOS / Homebrew Python

Modern Homebrew Python installations are usually marked as an externally managed environment.

Do **not** install the dependency globally with:

```bash
python3 -m pip install "psycopg[binary]"
```

If you see:

```text
error: externally-managed-environment
```

create a virtual environment instead.

## First-time setup

From your project directory:

```bash
python3 -m venv .venv
```

Activate it:

```bash
source .venv/bin/activate
```

Upgrade pip:

```bash
python -m pip install --upgrade pip
```

Install PostgreSQL support:

```bash
python -m pip install "psycopg[binary]"
```

You should now see the virtual environment name in your shell prompt, for example:

```text
(.venv) user@machine project %
```

## Database connection

The script reads the database URL from `DATABASE_URL`.

Set it before running the script:

```bash
export DATABASE_URL='postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require'
```

Use the external database URL when running the script from your local machine.

Do not commit database credentials to Git.

You can confirm the variable exists without printing the secret:

```bash
test -n "$DATABASE_URL" && echo "DATABASE_URL is set"
```

## Target Shop

The current development shop ID used during testing is:

```text
cmtlveegh0000qj0iomk8hko7
```

You can target a shop either by its database ID:

```bash
--shop-id cmtlveegh0000qj0iomk8hko7
```

or by Shopify domain:

```bash
--shop-domain kwadwo-e4bf4mc4.myshopify.com
```

The Shop itself must already exist in:

```text
commerce."Shop"
```

The script deliberately does not create or replace the Shop record.

## Create dashboard test data

With the virtual environment active:

```bash
python shopify_dashboard_test_data.py seed \
  --shop-id cmtlveegh0000qj0iomk8hko7
```

Or by domain:

```bash
python shopify_dashboard_test_data.py seed \
  --shop-domain kwadwo-e4bf4mc4.myshopify.com
```

The seed command first removes rows previously created with the same test prefix and then creates a fresh deterministic dataset.

This means the command is safe to rerun while iterating on the dashboard.

## Inspect the created data

Run:

```bash
python shopify_dashboard_test_data.py status \
  --shop-id cmtlveegh0000qj0iomk8hko7
```

The status command reports items such as:

- recovery counts by status
- customer count
- WhatsApp message count
- usage events by metric
- billing periods
- ShopSettings state
- Subscription state

## Remove all generated test data

Run:

```bash
python shopify_dashboard_test_data.py clean \
  --shop-id cmtlveegh0000qj0iomk8hko7
```

This removes only data owned by the script.

The Shop itself remains untouched.

You can verify cleanup with:

```bash
python shopify_dashboard_test_data.py status \
  --shop-id cmtlveegh0000qj0iomk8hko7
```

## Typical workflow

A normal dashboard-development cycle is:

```text
1. Activate Python virtual environment
2. Set DATABASE_URL
3. Seed dashboard test data
4. Start the Shopify app
5. Review dashboard scenarios
6. Modify UI
7. Rerun seed when a clean deterministic dataset is useful
8. Run clean when finished
```

Commands:

```bash
source .venv/bin/activate

export DATABASE_URL='postgresql://...'

python shopify_dashboard_test_data.py seed \
  --shop-id cmtlveegh0000qj0iomk8hko7

python shopify_dashboard_test_data.py status \
  --shop-id cmtlveegh0000qj0iomk8hko7

python shopify_dashboard_test_data.py clean \
  --shop-id cmtlveegh0000qj0iomk8hko7
```

## Useful dashboard scenarios to review

After seeding, review at least:

```text
Dashboard overview
Recovery status breakdown
Current billing period
Historical billing periods
Customer list
Customer pagination
Customer with multiple recoveries
Guest recovery
Recovery with no conversation
Recovery details
Conversation messages
Current usage
Historical usage
Usage pagination
Linked usage events
Unlinked usage events
```

The script prints useful dashboard URLs after a successful seed, including current and historical billing-period IDs.

## Existing ShopSettings or Subscription

The script intentionally does not overwrite existing merchant configuration.

If an existing `ShopSettings` row has:

```text
onboardingCompleted = false
```

the script will warn you rather than changing it.

If an existing subscription is not:

```text
ACTIVE
```

or:

```text
TRIALING
```

the script will also warn you rather than replacing the subscription.

For dashboard-only development, update those rows manually if you deliberately want to bypass onboarding or subscription gating.

## Re-entering the virtual environment

After opening a new terminal:

```bash
source .venv/bin/activate
```

There is no need to reinstall `psycopg` each time.

When finished:

```bash
deactivate
```

## Git

The local virtual environment should not be committed.

Ensure `.gitignore` contains:

```gitignore
.venv/
```

The Python script and this README may be committed if you want the dashboard test-data workflow to be part of the repository.

## Troubleshooting

### `externally-managed-environment`

Use the virtual environment instructions above.

Do not use:

```text
--break-system-packages
```

for this project.

### `DATABASE_URL is required`

Set the variable:

```bash
export DATABASE_URL='postgresql://...'
```

### Cannot connect to PostgreSQL

If the database is hosted on Render and the script is running on your Mac, use the database's external connection URL and ensure SSL is configured as required, commonly:

```text
sslmode=require
```

### Shop was not found

Confirm the Shop exists:

```sql
SELECT "id", "domain", "status"
FROM commerce."Shop"
ORDER BY "domain";
```

Then rerun the script with the correct `--shop-id` or `--shop-domain`.

### Dashboard still shows onboarding

Check:

```sql
SELECT *
FROM shopify."ShopSettings"
WHERE "shopId" = 'cmtlveegh0000qj0iomk8hko7';
```

The dashboard requires the appropriate onboarding state before rendering the normal dashboard.

### Dashboard still shows subscription gating

Check:

```sql
SELECT *
FROM billing."Subscription"
WHERE "shopId" = 'cmtlveegh0000qj0iomk8hko7';
```

For normal dashboard access during development, the current implementation expects an appropriate active/trialing subscription state.

## Important

This utility is intended for **development and test databases**.

Do not point it at production unless the test-data workflow has been explicitly reviewed and approved for that environment.
