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

test("Shopify taxonomy API is Platform Admin protected and queries Redis rather than a packaged file", async () => {
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
  assert.match(library, /SHOPIFY_TAXONOMY_TOP_INDEX_ALIAS/);
  assert.match(library, /SHOPIFY_TAXONOMY_SUBCATEGORY_INDEX_ALIAS/);
  assert.match(library, /FT\.SEARCH/);
  assert.match(library, /KNN/);
  assert.match(library, /REDIS_URL/);
  assert.doesNotMatch(library, /readFile\(|\.generated\/shopify-taxonomy/);
});

test("taxonomy synchronization is explicit and is not part of dev or build", async () => {
  const packageJson = JSON.parse(await source("package.json"));
  const syncScript = await source("scripts/sync-shopify-taxonomy.mjs");
  const syncRuntime = await source("scripts/shopify-taxonomy-redis-sync.mjs");
  const manifest = JSON.parse(
    await source("src/data/shopify-taxonomy-manifest.json"),
  );
  const nextConfig = await source("next.config.ts");

  assert.equal(manifest.version, "2026-08");
  assert.equal(
    manifest.assetUrl,
    "https://github.com/Shopify/product-taxonomy/releases/download/v2026-08/categories.en.txt.gz",
  );
  assert.equal(manifest.source, "SHOPIFY_STANDARD_PRODUCT_TAXONOMY");
  assert.equal(packageJson.scripts.dev, "next dev");
  assert.equal(
    packageJson.scripts.build,
    "npm run prisma:generate && next build --webpack",
  );
  assert.equal(
    packageJson.scripts["shopify-taxonomy:sync"],
    "node scripts/sync-shopify-taxonomy.mjs",
  );
  assert.equal(packageJson.scripts["shopify-taxonomy:prepare"], undefined);
  assert.equal(packageJson.scripts["shopify-taxonomy:update"], undefined);
  assert.match(syncScript, /Downloading Shopify taxonomy/);
  assert.match(syncScript, /FT\.ALIASUPDATE/);
  assert.match(syncScript, /FT\.DROPINDEX/);
  assert.match(syncScript, /Previous taxonomy indexes were removed/);
  assert.match(syncRuntime, /EMBEDDING_MODEL/);
  assert.match(syncRuntime, /VECTOR/);
  assert.match(syncScript, /algorithm: "FLAT"/);
  assert.doesNotMatch(syncScript, /algorithm: "HNSW"/);
  assert.match(syncScript, /SHOPIFY_TAXONOMY_EMBEDDING_DIMENSIONS/);
  assert.match(syncScript, /cleanupStaleTaxonomyIndexes/);
  assert.doesNotMatch(nextConfig, /outputFileTracingIncludes|\.generated/);
});

test("Store Category taxonomy search is split between top-level authoring and subcategory mappings", async () => {
  const route = await source("src/app/api/admin/shopify-taxonomy/route.ts");
  const library = await source("src/lib/admin/shopify-taxonomy.ts");
  const categoryStep = await source(
    "src/components/admin/store-categories/store-category-category-step.tsx",
  );
  const mappingStep = await source(
    "src/components/admin/store-categories/store-category-mappings-step.tsx",
  );
  const mappingEditor = await source(
    "src/components/admin/store-categories/taxonomy-mapping-editor.tsx",
  );
  const mappingWorkspace = await source(
    "src/components/admin/store-categories/store-category-mapping-workspace.tsx",
  );

  assert.match(route, /scopeValue === "top-level" \|\| scopeValue === "subcategories"/);
  assert.match(route, /const rootId = params\.get\("root"\)/);
  assert.match(route, /resolveShopifyTaxonomyCategory\(id, scope\)/);
  assert.match(route, /scope === "top-level" && parent/);
  assert.match(library, /scope === "top-level"/);
  assert.match(library, /scope === "subcategories"/);
  assert.match(library, /@rootId:/);
  assert.match(categoryStep, /scope="top-level"/);
  assert.match(
    await source("src/components/admin/store-categories/shopify-taxonomy-picker.tsx"),
    /scope !== "top-level" && category\.hasChildren/,
  );
  assert.match(mappingStep, /StoreCategoryMappingWorkspace/);
  assert.match(mappingEditor, /StoreCategoryMappingWorkspace/);
  assert.match(mappingWorkspace, /scope="subcategories"/);
});

test("Store Category mapping UX persists exact IDs plus human-readable reference taxonomy metadata", async () => {
  const picker = await source(
    "src/components/admin/store-categories/shopify-taxonomy-picker.tsx",
  );
  const mappingEditor = await source(
    "src/components/admin/store-categories/taxonomy-mapping-editor.tsx",
  );
  const mappingWorkspace = await source(
    "src/components/admin/store-categories/store-category-mapping-workspace.tsx",
  );
  const reviewStep = await source(
    "src/components/admin/store-categories/store-category-review-step.tsx",
  );

  assert.match(picker, /Search reference taxonomy/);
  assert.match(picker, /Reference taxonomy hierarchy/);
  assert.match(picker, /name="taxonomyCategoryFullName"/);
  assert.match(mappingWorkspace, /<ShopifyTaxonomyPicker/);
  assert.match(mappingEditor, /formData\.set\("taxonomyCategoryFullName", taxonomy\.fullName\)/);
  assert.match(reviewStep, /mapping\.taxonomy\?\.fullName/);
});

test("pins taxonomy Redis clients to RESP2 for stable FT.SEARCH replies", async () => {
  const runtimeSource = await readFile(
    path.join(repositoryRoot, "src/lib/admin/shopify-taxonomy.ts"),
    "utf8",
  );
  const syncSource = await readFile(
    path.join(repositoryRoot, "scripts/sync-shopify-taxonomy.mjs"),
    "utf8",
  );

  assert.match(runtimeSource, /protocol:\s*2/);
  assert.match(syncSource, /protocol:\s*2/);
});

test("Admin taxonomy queries use the active Redis embedding metadata rather than local dimension defaults", async () => {
  const library = await source("src/lib/admin/shopify-taxonomy.ts");
  const embedding = await source("src/lib/admin/shopify-taxonomy-embedding.ts");

  assert.match(library, /loadShopifyTaxonomyQueryEmbeddingConfig/);
  assert.match(library, /embeddingDimensions: metadata\.embeddingDimensions/);
  assert.doesNotMatch(library, /config\.dimensions !== metadata\.embeddingDimensions/);
  assert.match(embedding, /dimensions: embeddingDimensions/);
});


test("taxonomy semantic-search failures are explicit without exposing credentials", async () => {
  const route = await source("src/app/api/admin/shopify-taxonomy/route.ts");
  const library = await source("src/lib/admin/shopify-taxonomy.ts");
  const embedding = await source("src/lib/admin/shopify-taxonomy-embedding.ts");
  const picker = await source(
    "src/components/admin/store-categories/shopify-taxonomy-picker.tsx",
  );

  assert.match(library, /from "\.\/shopify-taxonomy-embedding\.ts"/);
  assert.match(embedding, /"MISSING_API_KEY"/);
  assert.match(embedding, /"INVALID_INDEX_METADATA"/);
  assert.match(route, /admin\.shopify_taxonomy\.unavailable/);
  assert.match(route, /error: "embedding_configuration"/);
  assert.match(route, /reason:\s*error\.detail === "MISSING_API_KEY"/);
  assert.match(route, /"missing_api_key"/);
  assert.match(route, /error: "embedding_request_failed"/);
  assert.match(
    picker,
    /Admin embedding credential is not configured/,
  );
  assert.match(picker, /active index embedding metadata is invalid/);
  assert.match(picker, /could not reach the embedding service/);
  assert.doesNotMatch(route, /EMBEDDING_API_KEY/);
});
