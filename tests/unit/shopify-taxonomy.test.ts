import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildShopifyTaxonomyVectorQuery,
  escapeRedisTagValue,
  parseRedisSearchReply,
  parseShopifyTaxonomyMetadata,
} from "../../src/lib/admin/shopify-taxonomy.ts";
import {
  DEFAULT_SHOPIFY_TAXONOMY_EMBEDDING_DIMENSIONS,
  loadShopifyTaxonomyEmbeddingConfig,
  loadShopifyTaxonomyQueryEmbeddingConfig,
  loadShopifyTaxonomyQueryEmbeddingConfigFromRuntime,
  shopifyTaxonomyVectorBuffer,
  ShopifyTaxonomyEmbeddingConfigurationError,
} from "../../src/lib/admin/shopify-taxonomy-embedding.ts";

const categoryFields = [
  "categoryId",
  "gid://shopify/TaxonomyCategory/aa-1-9",
  "name",
  "Shirts & Tops",
  "fullName",
  "Apparel & Accessories > Clothing > Shirts & Tops",
  "parentId",
  "gid://shopify/TaxonomyCategory/aa-1",
  "level",
  "2",
  "hasChildren",
  "0",
  "ancestorsJson",
  JSON.stringify([
    { id: "gid://shopify/TaxonomyCategory/aa", name: "Apparel & Accessories" },
    { id: "gid://shopify/TaxonomyCategory/aa-1", name: "Clothing" },
  ]),
  "vectorScore",
  "0.125",
];

test("parses Redis Search taxonomy documents into the Admin category contract", () => {
  const parsed = parseRedisSearchReply([1, "doc-key", categoryFields]);

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.score, 0.125);
  assert.deepEqual(parsed[0]?.category, {
    id: "gid://shopify/TaxonomyCategory/aa-1-9",
    level: 2,
    name: "Shirts & Tops",
    fullName: "Apparel & Accessories > Clothing > Shirts & Tops",
    parentId: "gid://shopify/TaxonomyCategory/aa-1",
    hasChildren: false,
    ancestors: [
      { id: "gid://shopify/TaxonomyCategory/aa", name: "Apparel & Accessories" },
      { id: "gid://shopify/TaxonomyCategory/aa-1", name: "Clothing" },
    ],
  });
});

test("builds bounded KNN queries and escapes exact root taxonomy tags", () => {
  assert.equal(
    buildShopifyTaxonomyVectorQuery({
      limit: 10,
      rootId: "gid://shopify/TaxonomyCategory/aa",
    }),
    String.raw`(@rootId:{gid\:\/\/shopify\/TaxonomyCategory\/aa})=>[KNN 10 @embedding $queryVector AS vectorScore]`,
  );
  assert.equal(escapeRedisTagValue("aa-1"), "aa\\-1");
});

test("validates the active Redis taxonomy metadata contract", () => {
  const metadata = parseShopifyTaxonomyMetadata({
    taxonomyVersion: "2026-08",
    sourceUrl: "https://example.test/categories.en.txt.gz",
    sourceSha256: "abc123",
    embeddingProvider: "openai",
    embeddingModel: "text-embedding-3-small",
    embeddingDimensions: "1536",
    embeddingIndexVersion: "v1",
    topLevelCount: "26",
    subcategoryCount: "5000",
    syncedAt: "2026-10-05T00:00:00.000Z",
  });

  assert.equal(metadata.embeddingDimensions, 1536);
  assert.equal(metadata.topLevelCount, 26);
  assert.equal(metadata.subcategoryCount, 5000);
});


test("uses the same compact taxonomy embedding dimensions for Admin queries", () => {
  const config = loadShopifyTaxonomyEmbeddingConfig({
    NODE_ENV: "test",
    EMBEDDING_PROVIDER: "openai",
    EMBEDDING_MODEL: "text-embedding-3-small",
    EMBEDDING_DIMENSIONS: "1536",
    EMBEDDING_INDEX_VERSION: "v1",
    EMBEDDING_API_KEY: "test-key",
  } as NodeJS.ProcessEnv);

  assert.equal(DEFAULT_SHOPIFY_TAXONOMY_EMBEDDING_DIMENSIONS, 256);
  assert.equal(config.dimensions, 256);
});

test("uses the active Redis index embedding metadata for Admin query vectors", () => {
  const config = loadShopifyTaxonomyQueryEmbeddingConfig(
    {
      embeddingProvider: "openai",
      embeddingModel: "text-embedding-3-small",
      embeddingDimensions: 384,
      embeddingIndexVersion: "v1",
    },
    {
      NODE_ENV: "test",
      EMBEDDING_API_KEY: "test-key",
      EMBEDDING_MODEL: "text-embedding-3-large",
      SHOPIFY_TAXONOMY_EMBEDDING_DIMENSIONS: "256",
      EMBEDDING_INDEX_VERSION: "v2",
    } as NodeJS.ProcessEnv,
  );

  assert.equal(config.model, "text-embedding-3-small");
  assert.equal(config.dimensions, 384);
  assert.equal(config.indexVersion, "v1");
  assert.equal(config.apiKey, "test-key");
});

test("reports a missing Admin embedding credential explicitly for semantic taxonomy search", () => {
  assert.throws(
    () =>
      loadShopifyTaxonomyQueryEmbeddingConfig(
        {
          embeddingProvider: "openai",
          embeddingModel: "text-embedding-3-small",
          embeddingDimensions: 384,
          embeddingIndexVersion: "v1",
        },
        { NODE_ENV: "test" } as NodeJS.ProcessEnv,
      ),
    (error: unknown) => {
      assert.ok(error instanceof ShopifyTaxonomyEmbeddingConfigurationError);
      assert.equal(error.code, "MISSING_API_KEY");
      return true;
    },
  );
});

test("distinguishes invalid active index embedding metadata from a missing credential", () => {
  assert.throws(
    () =>
      loadShopifyTaxonomyQueryEmbeddingConfig(
        {
          embeddingProvider: "openai",
          embeddingModel: "text-embedding-3-small",
          embeddingDimensions: 2048,
          embeddingIndexVersion: "v1",
        },
        { NODE_ENV: "test", EMBEDDING_API_KEY: "test-key" } as NodeJS.ProcessEnv,
      ),
    (error: unknown) => {
      assert.ok(error instanceof ShopifyTaxonomyEmbeddingConfigurationError);
      assert.equal(error.code, "INVALID_INDEX_METADATA");
      return true;
    },
  );
});


test("uses the database runtime embedding configuration when it matches the active Redis index", () => {
  const config = loadShopifyTaxonomyQueryEmbeddingConfigFromRuntime(
    {
      embeddingProvider: "openai",
      embeddingModel: "text-embedding-3-small",
      embeddingDimensions: 384,
      embeddingIndexVersion: "reference-taxonomy-v1",
    },
    {
      embeddingProvider: "openai",
      embeddingModel: "text-embedding-3-small",
      embeddingDimensions: 384,
      embeddingIndexVersion: "reference-taxonomy-v1",
      apiKey: "database-secret",
    },
  );

  assert.equal(config.model, "text-embedding-3-small");
  assert.equal(config.dimensions, 384);
  assert.equal(config.indexVersion, "reference-taxonomy-v1");
  assert.equal(config.apiKey, "database-secret");
});

test("requires a Redis taxonomy re-sync when the database embedding configuration changes", () => {
  assert.throws(
    () =>
      loadShopifyTaxonomyQueryEmbeddingConfigFromRuntime(
        {
          embeddingProvider: "openai",
          embeddingModel: "text-embedding-3-small",
          embeddingDimensions: 384,
          embeddingIndexVersion: "reference-taxonomy-v1",
        },
        {
          embeddingProvider: "openai",
          embeddingModel: "text-embedding-3-small",
          embeddingDimensions: 512,
          embeddingIndexVersion: "reference-taxonomy-v2",
          apiKey: "database-secret",
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof ShopifyTaxonomyEmbeddingConfigurationError);
      assert.equal(error.code, "INDEX_CONFIGURATION_MISMATCH");
      return true;
    },
  );
});

test("encodes query vectors as Redis FLOAT32 blobs", () => {
  const buffer = shopifyTaxonomyVectorBuffer([1.5, -2.25]);
  assert.equal(buffer.byteLength, 8);
  assert.equal(buffer.readFloatLE(0), 1.5);
  assert.equal(buffer.readFloatLE(4), -2.25);
});
