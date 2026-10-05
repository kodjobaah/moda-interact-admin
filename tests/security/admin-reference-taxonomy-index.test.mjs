import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test } from "node:test";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const source = (relativePath) =>
  readFile(path.join(repositoryRoot, relativePath), "utf8");

test("Store Categories exposes temporary reference taxonomy index management", async () => {
  const [page, catalogue, panel, creation] = await Promise.all([
    source("src/app/(protected)/system-controls/store-categories/page.tsx"),
    source("src/components/admin/store-categories/store-category-catalog.tsx"),
    source(
      "src/components/admin/store-categories/reference-taxonomy-index-panel.tsx",
    ),
    source(
      "src/components/admin/store-categories/store-category-creation-workspace.tsx",
    ),
  ]);

  assert.match(page, /getReferenceTaxonomyIndexStatus\(\)/);
  assert.match(page, /principal\.role === "SUPER_ADMIN"/);
  assert.match(page, /maxDuration = 300/);
  assert.match(catalogue, /<ReferenceTaxonomyIndexPanel/);
  assert.match(catalogue, /taxonomyIndexStatus\.state === "READY"/);
  assert.match(panel, /Sync taxonomy/);
  assert.match(panel, /Clear search index/);
  assert.match(panel, /href="\/system-controls\/embeddings"/);
  assert.match(panel, /does not remove Store Categories or Category Mappings/);
  assert.match(creation, /disabled=\{!taxonomyReady\}/);
});

test("taxonomy sync resolves the database-backed Reference Taxonomy embedding configuration", async () => {
  const [management, service, taxonomy] = await Promise.all([
    source("src/lib/admin/shopify-taxonomy-index-management.ts"),
    source("src/lib/admin/embedding-configuration.ts"),
    source("src/lib/admin/shopify-taxonomy.ts"),
  ]);

  assert.match(
    management,
    /getEmbeddingRuntimeConfiguration\([\s\S]*CommerceEmbeddingPurpose\.REFERENCE_TAXONOMY/,
  );
  assert.match(management, /SHOPIFY_TAXONOMY_EMBEDDING_DIMENSIONS/);
  assert.match(management, /EMBEDDING_API_KEY: config\.apiKey/);
  assert.match(management, /shell: false/);
  assert.match(service, /openEmbeddingCredential/);
  assert.match(taxonomy, /getEmbeddingRuntimeConfiguration/);
  assert.match(taxonomy, /loadShopifyTaxonomyQueryEmbeddingConfigFromRuntime/);
  assert.doesNotMatch(taxonomy, /process\.env\.EMBEDDING_API_KEY/);
});

test("taxonomy cleanup is namespace-scoped and never flushes shared Redis", async () => {
  const management = await source(
    "src/lib/admin/shopify-taxonomy-index-management.ts",
  );

  assert.match(management, /FT\.DROPINDEX/);
  assert.match(management, /moda:shopify-taxonomy:doc:\*/);
  assert.match(management, /SHOPIFY_TAXONOMY_METADATA_KEY/);
  assert.match(management, /FT\.ALIASDEL/);
  assert.doesNotMatch(management, /FLUSHALL|FLUSHDB/);
  assert.doesNotMatch(management, /redis\.keys\(/);
});

test("taxonomy sync streams bounded child progress through the shared logger", async () => {
  const [management, syncScript] = await Promise.all([
    source("src/lib/admin/shopify-taxonomy-index-management.ts"),
    source("scripts/sync-shopify-taxonomy.mjs"),
  ]);

  assert.match(
    management,
    /@modainteract\/moda-interact-shared\/logging/,
  );
  assert.match(management, /admin\.reference_taxonomy\.sync\.progress/);
  assert.match(management, /stdoutRelay\.write\(chunk\)/);
  assert.match(management, /stderrRelay\.write\(chunk\)/);
  assert.match(management, /MAX_SYNC_LOG_LINE_LENGTH/);
  assert.match(syncScript, /Embedding taxonomy subcategories/);
  assert.match(syncScript, /createCountProgressReporter/);
  assert.match(syncScript, /names\.subcategoryPrefix,\n    "subcategory"/);
});
