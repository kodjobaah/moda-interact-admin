# MerchantPricing pagination/test seed

This is a development/test-only fixture for the MerchantPricing admin catalogue.

It creates 20 plans by default. Every seeded plan:

- is `PAID_METERED`;
- is appended after the current catalogue rather than overwriting existing plans;
- is inactive by default so the fixture does not alter active-portfolio economics;
- has a unique handle prefixed with `ui-pagination-seed-`;
- has all 20 MerchantPricing locales;
- has two highlights translated into all 20 locales;
- varies `featured`, allowance, recurring price and usage-pricing shape;
- cycles through fixed, graduated, volume and no-usage-event examples.

The supported locales used by the fixture are:

`cs`, `da`, `de`, `en`, `es`, `fi`, `fr`, `it`, `ja`, `ko`, `nb`, `nl`,
`pl`, `pt-BR`, `pt-PT`, `sv`, `th`, `tr`, `zh-Hans`, `zh-Hant`.

## Install

Copy:

```text
seed-merchant-pricing-pagination.mjs
```

to:

```text
moda-interact-admin/scripts/seed-merchant-pricing-pagination.mjs
```

Then from `moda-interact-admin`:

```bash
npm run prisma:generate

node scripts/seed-merchant-pricing-pagination.mjs \
  --confirm-test-data
```

The explicit confirmation flag exists to make it harder to seed the wrong database by mistake.

## Seed another amount

For 50 plans:

```bash
node scripts/seed-merchant-pricing-pagination.mjs \
  --count=50 \
  --confirm-test-data
```

`--count` accepts 1–100.

## Re-running

The script is idempotent for its own fixture data. Before creating the requested rows it deletes only MerchantPricing plans whose handle starts with:

```text
ui-pagination-seed-
```

Relations such as translations, highlights, highlight translations, usage events and usage tiers are deleted through the schema's cascade relationships.

## Clean up

```bash
node scripts/seed-merchant-pricing-pagination.mjs \
  --cleanup \
  --confirm-test-data
```

This does not delete ordinary MerchantPricing plans.

## Why the plans are inactive

The purpose of this fixture is primarily list/pagination/filter/detail/edit testing. Making 20 synthetic plans active would change the portfolio that the economics validator evaluates and could interfere with unrelated tests.

You can activate individual fixture rows through the admin UI when you specifically want to exercise activation and economics behaviour.
