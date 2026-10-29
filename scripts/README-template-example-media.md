# Seed template-editor example images (test / development only)

## What this does

This developer-operated script creates three original PNG example assets (`LOGO`,
`SQUARE_LOGO`, `COVER_IMAGE`), uploads each to **the dedicated public ShopBrand R2
bucket**, reads it back through the public domain to verify the SHA-256 digest,
and atomically publishes their metadata into the environment-specific
`public."PlatformConfiguration"` row keyed `whatsapp.templateSamples`.
An append-only `PlatformConfigurationAudit` entry records changes.

No merchant `Shop`, `ShopBrand`, checkout, or WhatsApp template is seeded or
modified. Re-running with identical images retains the existing manifest
revision. Objects are content-addressed and existing example objects are not
removed automatically. This is deliberately separate from the live merchant
`shop-brands/{domain}/...` key namespace.

The Admin template authoring editor automatically reads the manifest after page
load (and via **Refresh examples**). It offers the three media roles even if a
particular sample is unavailable. **Only the semantic media role is saved** to
the immutable template definition. Actual customer delivery resolves the
individual merchant's verified READY ShopBrand image again. This seeder does
**not** supply the distinct Meta sample upload handle used during Meta template
registration; provider submission remains blocked until that separate capability
is implemented.

## Prerequisites

- Work in the `moda-interact-admin` repository with npm dependencies installed
  and Prisma Client generated (`npm ci && npm run prisma:generate`).
- The target database must have a name containing `test` or `development` and be
  a disposable development/test database. This command refuses production.
- Supply `DATABASE_URL`, `MODA_CONFIG_UNSEAL_KEY`, and, where required,
  `MODA_CONFIG_UNSEAL_ACTIVE_KEY_ID` in the CLI process environment. The script
  reads existing sealed `merchant.knowledge.r2` credentials in the **selected**
  environment, using the canonical Shared unsealer. These credentials must be
  authorized by R2 to upload/HEAD objects in the *separate* bucket configured by
  `shopBrand.publicMedia`; do not assume read/write access across buckets.
- `shopBrand.publicMedia` must specify the correct bucket name and HTTPS public
  origin, and the public R2 domain must serve files from that bucket.
- The seeder never writes credentials into the sample manifest or Admin browser.

Example using an environment already exported in your terminal:

```sh
npm run admin:seed-template-media -- --environment test --confirm
```

Or with Node loading your local `.env` explicitly (Node 22+):

```sh
node --env-file=.env --import tsx scripts/seed-template-example-media.mjs \
  --environment test --confirm
```

To derive **all three** sample images from one image (PNG, JPEG or WebP;
20 MiB maximum input, 40 million pixels maximum), run:

```sh
npm run admin:seed-template-media -- --environment test --confirm \
  --source-image "$HOME/Downloads/AI-Checkout-Recovery-for-Shopify-listing.png"
```

The script generates three **distinct PNG outputs** from that source:

- `LOGO`: 1200 × 630, entire image fitted inside the frame with padding where needed.
- `SQUARE_LOGO`: 512 × 512, cropped from the top-left to retain the branding
  position in the supplied marketing image.
- `COVER_IMAGE`: 1200 × 630, centre-cropped to fill the frame.

It then uploads, verifies and publishes all three through the same existing R2
and PostgreSQL flow. The source file itself is not saved in PostgreSQL, and no
merchant media is changed. A single-source seed is repeatable: unchanged
images produce unchanged R2 object keys and a no-op manifest update.

Alternatively, to use individually supplied images (PNG only; 8-bit RGB or
RGBA, under 4 MiB each, total pixels at most 40 million):

```sh
npm run admin:seed-template-media -- --environment test --confirm \
  --logo ./assets/example-logo.png \
  --square-logo ./assets/example-square-logo.png \
  --cover-image ./assets/example-cover.png
```

The `--source-image` option cannot be combined with the per-role flags.
You may override one image with a per-role flag and use the generated defaults for the others.
The script validates each PNG, verifies the R2 object upload, then verifies the
public URL's bytes before publishing a database reference. If an upload or public
read fails, **no new database manifest is published**; previously uploaded
content-addressed objects may remain harmlessly in R2.

## Verify database state

```sql
SELECT "environment", "key", "version", "value"->>'schemaVersion' AS "schemaVersion",
       "value"->'assets'->'LOGO'->>'objectKey' AS "logoKey",
       "value"->'assets'->'SQUARE_LOGO'->>'objectKey' AS "squareKey",
       "value"->'assets'->'COVER_IMAGE'->>'objectKey' AS "coverKey"
FROM public."PlatformConfiguration"
WHERE "environment" = 'test' AND "key" = 'whatsapp.templateSamples';
```

Expected R2 prefix: `template-samples/test/{logo|square_logo|cover_image}/sha256-<digest>.png`.

## Test

```sh
npm run test:template-sample-seed:unit
npm run test:arch049-admin-media:unit
npm run test:arch047-admin-authoring:unit
npx tsc --noEmit
npm run build
```

The seed script does not run as part of a deployment or standard DB migration;
it must be explicitly invoked after the public R2 bucket is ready.
