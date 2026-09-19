# Moda Interact Manual Seed Data Guide

This README documents the manual development/test seed utilities used for merchant pricing plans and promotion fixtures.

Keep this file alongside:

```text
scripts/
├── seed-manual-merchant-pricing.mjs
└── seed-manual-promotion.mjs
```

The commands below assume you are running them from:

```bash
cd /Users/kwadwoadomafriyie/project/moda-interact-workspace/moda-interact-admin
```

These scripts are intended for **development/manual testing data only**.

---

# 1. Safety flags

Both seed utilities require an explicit confirmation flag before changing data:

```text
--confirm-test-data
```

Example:

```bash
npm run admin:seed-merchant-pricing -- \
  seed free \
  --confirm-test-data
```

or:

```bash
npm run admin:seed-promotion -- \
  seed global \
  --confirm-test-data
```

If this flag is omitted, the mutation should be rejected.

---

# 2. Merchant pricing plan seed utility

NPM command:

```bash
npm run admin:seed-merchant-pricing -- ...
```

Underlying script:

```text
scripts/seed-manual-merchant-pricing.mjs
```

## 2.1 Purpose

The MerchantPricingPlan seeder creates development catalogue plans incrementally so the Admin and merchant billing flows can be exercised manually.

The intended catalogue order is:

```text
Free
  ↓
Starter
  ↓
Growth
  ↓
Scale
```

The current manual-test included recovery-credit quantities are:

| Plan | Recurring price | Included recovery credits |
|---|---:|---:|
| Free | £0 | 0* |
| Starter | £35 | 2 |
| Growth | £75 | 5 |
| Scale | £149 | 6 |

`*` The Free plan's lifetime free recovery allowance is modelled separately from `MerchantPricingPlan.includedRecoveryCredits`. Therefore the MerchantPricing catalogue value is `0`, while the platform's lifetime-free entitlement may still provide the merchant's free recovery conversations.

Each seeded plan supports the following catalogue features:

```text
checkout_recovery
ai_conversations
order_support
product_search
```

Every seeded plan also contains these three usage-event handles:

```text
bronze-top-up-free
silver-top-up
gold-top-up
```

with admin labels:

```text
Bronze Top Up Free
Silver Top Up
Gold Top Up
```

---

# 3. Inspect MerchantPricing seed status

Run:

```bash
npm run admin:seed-merchant-pricing -- status
```

Use this before seeding or deleting data.

It is especially useful after a failed database operation to confirm whether the transaction rolled back and which test plans currently exist.

---

# 4. Seed MerchantPricing plans incrementally

## 4.1 Seed Free

```bash
npm run admin:seed-merchant-pricing -- \
  seed free \
  --confirm-test-data
```

After seeding, inspect the Admin UI before continuing.

## 4.2 Seed Starter

```bash
npm run admin:seed-merchant-pricing -- \
  seed starter \
  --confirm-test-data
```

## 4.3 Seed Growth

```bash
npm run admin:seed-merchant-pricing -- \
  seed growth \
  --confirm-test-data
```

## 4.4 Seed Scale

```bash
npm run admin:seed-merchant-pricing -- \
  seed scale \
  --confirm-test-data
```

---

# 5. Seed the next missing plan

Once the preceding plan exists, use:

```bash
npm run admin:seed-merchant-pricing -- \
  seed next \
  --confirm-test-data
```

Repeated runs progress through:

```text
Free → Starter → Growth → Scale
```

This is the preferred command when manually validating each plan before creating the next one.

---

# 6. Seed all MerchantPricing plans

To create the full catalogue in sequence:

```bash
npm run admin:seed-merchant-pricing -- \
  seed all \
  --confirm-test-data
```

For manual UI testing, incremental seeding is usually preferable because it lets you inspect each stage separately.

---

# 7. Delete MerchantPricing seed data

## 7.1 Delete a specific plan

Example:

```bash
npm run admin:seed-merchant-pricing -- \
  delete scale \
  --confirm-test-data
```

Other valid plan names:

```text
free
starter
growth
scale
```

## 7.2 Delete the most recently seeded plan

```bash
npm run admin:seed-merchant-pricing -- \
  delete last \
  --confirm-test-data
```

Repeated use removes the catalogue in reverse order:

```text
Scale → Growth → Starter → Free
```

## 7.3 Delete all MerchantPricing seed plans

```bash
npm run admin:seed-merchant-pricing -- \
  delete all \
  --confirm-test-data
```

The script targets only deterministic manual-test catalogue rows.

---

# 8. Materialised MerchantPricing plans

A MerchantPricingPlan may already have been materialised into operational billing state.

Normal cleanup should refuse to remove materialised test data.

For disposable development data, the explicit override is:

```bash
npm run admin:seed-merchant-pricing -- \
  delete all \
  --confirm-test-data \
  --force-materialized-test-data
```

Use this only when you understand the consequences.

This flag concerns deletion of the seeded MerchantPricing catalogue rows. It should not be treated as permission to silently destroy unrelated merchant billing history.

---

# 9. Important Shopify contract caveat

The MerchantPricing catalogue and Shopify subscription contract are separate sources of data.

For billing reconciliation to succeed, provider-sensitive MerchantPricing fields must describe the **same subscription contract Shopify currently reports**.

The Admin reconciliation screen validates, among other things:

```text
Shopify plan handle
usage-event handle
pricing type
currency
usage-event unit price / tier contract
```

For example, the following handles existing in both systems is not sufficient:

```text
bronze-top-up-free
silver-top-up
gold-top-up
```

Their pricing contracts must also match.

If the Admin UI displays errors such as:

```text
Usage meter bronze-top-up-free does not match the catalogue fixed-unit price.
Usage meter silver-top-up does not match the catalogue fixed-unit price.
Usage meter gold-top-up does not match the catalogue fixed-unit price.
```

do **not** use "Repair mapping" simply to force the subscription through.

First compare the seeded MerchantPricing usage events with Shopify's real active subscription.

Shopify remains authoritative for the provider subscription contract.

This means that a local test catalogue with invented GBP prices will not validate against a Shopify subscription whose real usage items are USD or use different unit prices.

Before using seeded MerchantPricing data for reconciliation testing, verify that the provider-facing fields match the actual Shopify subscription.

---

# 10. MerchantPricing transaction timeout

The MerchantPricing seeder performs many writes in one Prisma interactive transaction, including:

```text
MerchantPricingPlan
translations
features
feature mappings
usage events
catalogue ordering
```

The seed utility should use a transaction configuration equivalent to:

```js
{
  maxWait: 10_000,
  timeout: 20_000,
}
```

If you see:

```text
Transaction already closed
The timeout for this transaction was 5000 ms
```

then the transaction-timeout correction has not been applied to the version of the seed script you are running.

---

# 11. Promotion seed utility

NPM command:

```bash
npm run admin:seed-promotion -- ...
```

Underlying script:

```text
scripts/seed-manual-promotion.mjs
```

## 11.1 Purpose

The manual promotion seeder creates individual promotions for manual Admin and merchant UI testing.

It supports the three real promotion scopes:

```text
GLOBAL
PLAN
SHOP
```

The command accepts:

```text
global
plan
tiered
shop
```

`tiered` is an alias for the database `PLAN` scope.

---

# 12. Inspect promotion seed status

Run:

```bash
npm run admin:seed-promotion -- status
```

This displays the manual promotion fixtures currently present, including useful information such as:

```text
scope
target
lifecycle state
credit quantity
translation count
grant count
```

Use this before creating or deleting fixtures.

---

# 13. Seed a GLOBAL promotion

Create a promotion available globally to otherwise eligible merchants:

```bash
npm run admin:seed-promotion -- \
  seed global \
  --confirm-test-data
```

The default manual-test quantity is:

```text
3 recovery credits
```

Override it with:

```bash
npm run admin:seed-promotion -- \
  seed global \
  --quantity 10 \
  --confirm-test-data
```

---

# 14. Seed a PLAN / tier-specific promotion

Example for the Free plan:

```bash
npm run admin:seed-promotion -- \
  seed tiered \
  --plan free \
  --confirm-test-data
```

Equivalent command:

```bash
npm run admin:seed-promotion -- \
  seed plan \
  --plan free \
  --confirm-test-data
```

Example for Growth:

```bash
npm run admin:seed-promotion -- \
  seed plan \
  --plan growth \
  --quantity 7 \
  --confirm-test-data
```

The plan selector may resolve against the available operational BillingPlan identifiers/handles used by the script.

Typical values are:

```text
free
starter
growth
scale
```

The default PLAN promotion quantity is:

```text
5 recovery credits
```

---

# 15. Seed a SHOP-specific promotion

Example:

```bash
npm run admin:seed-promotion -- \
  seed shop \
  --shop kwadwo-e4bf4mc4.myshopify.com \
  --confirm-test-data
```

Override the quantity:

```bash
npm run admin:seed-promotion -- \
  seed shop \
  --shop kwadwo-e4bf4mc4.myshopify.com \
  --quantity 12 \
  --confirm-test-data
```

The default SHOP promotion quantity is:

```text
8 recovery credits
```

The shop argument may use the supported Shopify domain or internal Shop identifier accepted by the script.

---

# 16. Promotion lifecycle states

Promotion fixtures can be created in different lifecycle states.

Supported manual states include:

```text
draft
scheduled
running
expired
closed
```

The default is:

```text
running
```

Examples:

```bash
npm run admin:seed-promotion -- \
  seed global \
  --state expired \
  --confirm-test-data
```

```bash
npm run admin:seed-promotion -- \
  seed shop \
  --shop kwadwo-e4bf4mc4.myshopify.com \
  --state scheduled \
  --quantity 8 \
  --confirm-test-data
```

These states are useful for validating whether the merchant UI correctly shows or suppresses promotions.

---

# 17. Promotion translations

Each manual promotion fixture is intended to contain translations for all supported merchant locales:

```text
cs
da
de
en
es
fi
fr
it
ja
ko
nb
nl
pl
pt-BR
pt-PT
sv
th
tr
zh-Hans
zh-Hant
```

This allows the merchant UI to be tested in different languages without the promotion disappearing simply because a translation row is missing.

---

# 18. Promotion selection is intentionally not pre-created

The promotion seed utility creates the promotion catalogue fixture but does not initially select it for the merchant.

It creates the campaign and translations, allowing you to exercise the real merchant selection flow.

The normal application flow should then create state such as:

```text
PromotionalCreditGrant
MerchantPromotionSelection
```

when the merchant selects the promotion.

This is intentional because manual testing should exercise the actual application behaviour rather than bypassing it with pre-created selections.

---

# 19. Useful combined promotion test

Create all three eligible promotion scopes for the same merchant.

## Global

```bash
npm run admin:seed-promotion -- \
  seed global \
  --quantity 3 \
  --confirm-test-data
```

## Plan

```bash
npm run admin:seed-promotion -- \
  seed tiered \
  --plan free \
  --quantity 5 \
  --confirm-test-data
```

## Shop

```bash
npm run admin:seed-promotion -- \
  seed shop \
  --shop kwadwo-e4bf4mc4.myshopify.com \
  --quantity 8 \
  --confirm-test-data
```

This produces a useful manual test state:

```text
GLOBAL  → 3 credits
PLAN    → 5 credits
SHOP    → 8 credits
```

You can then inspect how the merchant UI presents multiple simultaneously eligible promotion scopes.

---

# 20. Delete promotion fixtures

## 20.1 Delete GLOBAL

```bash
npm run admin:seed-promotion -- \
  delete global \
  --confirm-test-data
```

## 20.2 Delete PLAN/tier promotion

```bash
npm run admin:seed-promotion -- \
  delete tiered \
  --plan free \
  --confirm-test-data
```

or:

```bash
npm run admin:seed-promotion -- \
  delete plan \
  --plan growth \
  --confirm-test-data
```

## 20.3 Delete SHOP promotion

```bash
npm run admin:seed-promotion -- \
  delete shop \
  --shop kwadwo-e4bf4mc4.myshopify.com \
  --confirm-test-data
```

## 20.4 Delete all manual promotion fixtures

```bash
npm run admin:seed-promotion -- \
  delete all \
  --confirm-test-data
```

The manual seeder should only target fixtures using its dedicated manual-test identifier namespace and must not delete unrelated production/development campaigns.

---

# 21. Promotions that have already been used

A promotion may have been selected and its promotional credits may have been reserved or committed.

Normal deletion should refuse destructive cleanup when the fixture has meaningful usage.

For deliberate development cleanup, use the explicit override:

```bash
npm run admin:seed-promotion -- \
  delete shop \
  --shop kwadwo-e4bf4mc4.myshopify.com \
  --confirm-test-data \
  --force-used-test-data
```

or, where appropriate:

```bash
npm run admin:seed-promotion -- \
  delete all \
  --confirm-test-data \
  --force-used-test-data
```

Use this only for disposable manual-test data.

---

# 22. Suggested manual workflow

A useful development sequence is:

```bash
# 1. Inspect pricing catalogue
npm run admin:seed-merchant-pricing -- status

# 2. Seed Free
npm run admin:seed-merchant-pricing -- \
  seed free \
  --confirm-test-data

# 3. Inspect Admin pricing UI manually

# 4. Add next catalogue plan
npm run admin:seed-merchant-pricing -- \
  seed next \
  --confirm-test-data

# 5. Repeat until required catalogue exists

# 6. Inspect promotion fixtures
npm run admin:seed-promotion -- status

# 7. Add a global promotion
npm run admin:seed-promotion -- \
  seed global \
  --quantity 3 \
  --confirm-test-data

# 8. Add plan promotion
npm run admin:seed-promotion -- \
  seed tiered \
  --plan free \
  --quantity 5 \
  --confirm-test-data

# 9. Add shop promotion
npm run admin:seed-promotion -- \
  seed shop \
  --shop kwadwo-e4bf4mc4.myshopify.com \
  --quantity 8 \
  --confirm-test-data

# 10. Manually test the Admin and merchant UI

# 11. Remove promotion fixtures
npm run admin:seed-promotion -- \
  delete all \
  --confirm-test-data

# 12. Remove pricing fixtures if required
npm run admin:seed-merchant-pricing -- \
  delete all \
  --confirm-test-data
```

---

# 23. Before deleting test data

Always run:

```bash
npm run admin:seed-merchant-pricing -- status
npm run admin:seed-promotion -- status
```

before destructive cleanup.

If the data has been materialised, selected, reserved, committed, or otherwise used by a merchant workflow, review the state before using any force-delete option.

---

# 24. Commands quick reference

## MerchantPricing

```bash
npm run admin:seed-merchant-pricing -- status

npm run admin:seed-merchant-pricing -- \
  seed free --confirm-test-data

npm run admin:seed-merchant-pricing -- \
  seed starter --confirm-test-data

npm run admin:seed-merchant-pricing -- \
  seed growth --confirm-test-data

npm run admin:seed-merchant-pricing -- \
  seed scale --confirm-test-data

npm run admin:seed-merchant-pricing -- \
  seed next --confirm-test-data

npm run admin:seed-merchant-pricing -- \
  seed all --confirm-test-data

npm run admin:seed-merchant-pricing -- \
  delete last --confirm-test-data

npm run admin:seed-merchant-pricing -- \
  delete all --confirm-test-data
```

## Promotions

```bash
npm run admin:seed-promotion -- status

npm run admin:seed-promotion -- \
  seed global --confirm-test-data

npm run admin:seed-promotion -- \
  seed tiered --plan free --confirm-test-data

npm run admin:seed-promotion -- \
  seed shop \
  --shop kwadwo-e4bf4mc4.myshopify.com \
  --confirm-test-data

npm run admin:seed-promotion -- \
  delete global --confirm-test-data

npm run admin:seed-promotion -- \
  delete tiered \
  --plan free \
  --confirm-test-data

npm run admin:seed-promotion -- \
  delete shop \
  --shop kwadwo-e4bf4mc4.myshopify.com \
  --confirm-test-data

npm run admin:seed-promotion -- \
  delete all \
  --confirm-test-data
```

---

# 25. Scope of these scripts

These utilities are intended to create controlled database state for manual development testing.

They do not replace:

- Shopify subscription creation;
- Shopify App Pricing configuration;
- provider billing reconciliation;
- real promotion selection flows;
- production migrations;
- automated system tests.

Where Shopify owns a provider contract, Shopify remains authoritative.
