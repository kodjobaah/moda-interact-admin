import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_SHOPIFY_TAXONOMY_EMBEDDING_DIMENSIONS,
  SHOPIFY_TAXONOMY_SUBCATEGORY_ALIAS,
  SHOPIFY_TAXONOMY_TOP_ALIAS,
  buildTaxonomyIndexDocuments,
  estimateRawVectorBytes,
  estimateTaxonomyRedisBytes,
  indexCreateArguments,
  loadTaxonomyEmbeddingConfig,
  parseRedisMemoryInfo,
  parseSearchTotal,
  redisPipelineFailure,
  staleTaxonomyIndexNames,
  taxonomyDocumentKey,
  vectorToFloat32Buffer,
} from "../../scripts/shopify-taxonomy-redis-sync.mjs";

const categories = [
  {
    id: "gid://shopify/TaxonomyCategory/aa",
    level: 0,
    name: "Apparel & Accessories",
    fullName: "Apparel & Accessories",
    parentId: null,
    hasChildren: true,
    ancestors: [],
  },
  {
    id: "gid://shopify/TaxonomyCategory/aa-1",
    level: 1,
    name: "Clothing",
    fullName: "Apparel & Accessories > Clothing",
    parentId: "gid://shopify/TaxonomyCategory/aa",
    hasChildren: false,
    ancestors: [
      { id: "gid://shopify/TaxonomyCategory/aa", name: "Apparel & Accessories" },
    ],
  },
];

test("sync separates top-level categories from subcategories for two Redis vector indexes", () => {
  const documents = buildTaxonomyIndexDocuments(categories);

  assert.equal(documents.topLevel.length, 1);
  assert.equal(documents.subcategories.length, 1);
  assert.equal(documents.topLevel[0]?.rootId, "gid://shopify/TaxonomyCategory/aa");
  assert.equal(documents.subcategories[0]?.rootId, "gid://shopify/TaxonomyCategory/aa");
  assert.equal(SHOPIFY_TAXONOMY_TOP_ALIAS, "idx:moda:shopify-taxonomy:top");
  assert.equal(
    SHOPIFY_TAXONOMY_SUBCATEGORY_ALIAS,
    "idx:moda:shopify-taxonomy:sub",
  );
});

test("sync creates memory-efficient FLAT schemas for both taxonomy indexes", () => {
  const top = indexCreateArguments({
    indexName: "top-next",
    prefix: "top:",
    dimensions: 3,
    algorithm: "FLAT",
  });
  const sub = indexCreateArguments({
    indexName: "sub-next",
    prefix: "sub:",
    dimensions: 3,
    algorithm: "FLAT",
  });

  assert.ok(top.includes("FLAT"));
  assert.ok(sub.includes("FLAT"));
  assert.ok(!sub.includes("HNSW"));
  assert.ok(top.includes("COSINE"));
  assert.ok(sub.includes("rootId"));
});

test("sync stores vectors as FLOAT32 and category IDs in deterministic Redis keys", () => {
  const vector = vectorToFloat32Buffer([1, 2], 2);
  assert.equal(vector.byteLength, 8);
  assert.equal(
    taxonomyDocumentKey("taxonomy:", "gid://shopify/TaxonomyCategory/aa"),
    "taxonomy:Z2lkOi8vc2hvcGlmeS9UYXhvbm9teUNhdGVnb3J5L2Fh",
  );
});


test("sync uses a compact taxonomy-specific embedding dimension by default", () => {
  const config = loadTaxonomyEmbeddingConfig({
    EMBEDDING_PROVIDER: "openai",
    EMBEDDING_MODEL: "text-embedding-3-small",
    EMBEDDING_INDEX_VERSION: "v1",
    EMBEDDING_API_KEY: "test-key",
  });

  assert.equal(DEFAULT_SHOPIFY_TAXONOMY_EMBEDDING_DIMENSIONS, 256);
  assert.equal(config.dimensions, 256);
});

test("sync allows a bounded taxonomy dimension override without reusing the global vector width", () => {
  const config = loadTaxonomyEmbeddingConfig({
    EMBEDDING_PROVIDER: "openai",
    EMBEDDING_MODEL: "text-embedding-3-small",
    EMBEDDING_DIMENSIONS: "1536",
    SHOPIFY_TAXONOMY_EMBEDDING_DIMENSIONS: "384",
    EMBEDDING_INDEX_VERSION: "v1",
    EMBEDDING_API_KEY: "test-key",
  });

  assert.equal(config.dimensions, 384);
});

test("sync estimates raw vectors and HASH plus FLAT Redis storage", () => {
  assert.equal(estimateRawVectorBytes(14_606, 256), 14_956_544);
  assert.equal(estimateTaxonomyRedisBytes(14_606, 256), 41_585_664);
});


test("sync accepts Redis Search totals from RESP2 and RESP3 reply shapes", () => {
  assert.equal(parseSearchTotal([14_580]), 14_580);
  assert.equal(
    parseSearchTotal(["total_results", 14_580, "results", []]),
    14_580,
  );
  assert.equal(
    parseSearchTotal({ total_results: 14_580, results: [] }),
    14_580,
  );
  assert.equal(
    parseSearchTotal(new Map([["total_results", 14_580], ["results", []]])),
    14_580,
  );
});

test("sync parses Redis memory info for preflight capacity checks", () => {
  assert.deepEqual(
    parseRedisMemoryInfo("# Memory\r\nused_memory:10485760\r\nmaxmemory:67108864\r\n"),
    { usedMemory: 10_485_760, maxMemory: 67_108_864 },
  );
});

test("sync removes only stale physical taxonomy indexes while preserving the active pair", () => {
  const current = {
    topIndex: "idx:moda:shopify-taxonomy:top:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    subcategoryIndex:
      "idx:moda:shopify-taxonomy:sub:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  };
  const stale = staleTaxonomyIndexNames(
    [
      current.topIndex,
      current.subcategoryIndex,
      "idx:moda:shopify-taxonomy:top:cccccccccccccccccccccccccccccccc",
      "idx:moda:shopify-taxonomy:sub:dddddddddddddddddddddddddddddddd",
      SHOPIFY_TAXONOMY_TOP_ALIAS,
      "unrelated-index",
    ],
    current,
  );

  assert.deepEqual(stale, [
    "idx:moda:shopify-taxonomy:top:cccccccccccccccccccccccccccccccc",
    "idx:moda:shopify-taxonomy:sub:dddddddddddddddddddddddddddddddd",
  ]);
});

test("sync reports the exact Redis pipeline rejection and category", () => {
  const documents = [
    { categoryId: "gid://shopify/TaxonomyCategory/aa" },
    { categoryId: "gid://shopify/TaxonomyCategory/aa-1" },
  ];
  const failure = redisPipelineFailure(
    [[null, 1], [new Error("OOM command not allowed when used memory > maxmemory"), null]],
    documents,
    0,
  );

  assert.deepEqual(failure, {
    categoryId: "gid://shopify/TaxonomyCategory/aa-1",
    message: "OOM command not allowed when used memory > maxmemory",
  });
});
