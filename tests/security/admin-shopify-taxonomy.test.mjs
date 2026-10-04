import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test } from "node:test";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

async function source(relativePath) {
  return readFile(path.join(repositoryRoot, relativePath), "utf8");
}

test("Shopify taxonomy API is Platform Admin protected and server-only", async () => {
  const route = await source("src/app/api/admin/shopify-taxonomy/route.ts");
  const library = await source("src/lib/admin/shopify-taxonomy.ts");
  const picker = await source(
    "src/components/admin/store-categories/shopify-taxonomy-picker.tsx",
  );

  assert.match(route, /await requirePlatformAdminRead\(\)/);
  assert.match(route, /PlatformAdminUnauthorizedError/);
  assert.match(route, /export const runtime = "nodejs"/);
  assert.match(route, /Cache-Control": "no-store"/);
  assert.match(picker, /\/api\/admin\/shopify-taxonomy/);
  assert.doesNotMatch(picker, /github\.com|raw\.githubusercontent\.com/);
  assert.match(library, /releases\/download\/v\$\{SHOPIFY_TAXONOMY_VERSION\}/);
});

test("Shopify taxonomy download is pinned, bounded, and parsed from gzip distribution data", async () => {
  const library = await source("src/lib/admin/shopify-taxonomy.ts");

  assert.match(library, /SHOPIFY_TAXONOMY_VERSION = "2026-08"/);
  assert.match(library, /categories\.en\.json\.gz/);
  assert.match(library, /SHOPIFY_TAXONOMY_FETCH_TIMEOUT_MS = 10_000/);
  assert.match(library, /SHOPIFY_TAXONOMY_MAX_COMPRESSED_BYTES/);
  assert.match(library, /SHOPIFY_TAXONOMY_MAX_DECOMPRESSED_BYTES/);
  assert.match(library, /gunzipSync/);
  assert.match(library, /maxOutputLength/);
  assert.match(library, /cataloguePromise/);
});

test("Store Category mapping UX uses searchable taxonomy selection but persists Shopify taxonomy IDs", async () => {
  const picker = await source(
    "src/components/admin/store-categories/shopify-taxonomy-picker.tsx",
  );
  const mappingEditor = await source(
    "src/components/admin/store-categories/taxonomy-mapping-editor.tsx",
  );
  const authoringStep = await source(
    "src/components/admin/store-categories/store-category-mappings-step.tsx",
  );
  const reviewStep = await source(
    "src/components/admin/store-categories/store-category-review-step.tsx",
  );

  assert.match(picker, /Search Shopify taxonomy/);
  assert.match(picker, /Shopify taxonomy hierarchy/);
  assert.match(picker, /Advanced taxonomy ID/);
  assert.match(picker, /name \? <input type="hidden" name=\{name\} value=\{selectedId\}/);
  assert.match(mappingEditor, /<ShopifyTaxonomyPicker/);
  assert.match(authoringStep, /<ShopifyTaxonomyPicker/);
  assert.match(reviewStep, /<ShopifyTaxonomyCategoryLabel/);
  assert.doesNotMatch(mappingEditor, /Shopify taxonomy category ID\s*<input/);
});
