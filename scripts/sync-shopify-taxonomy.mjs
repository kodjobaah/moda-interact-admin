import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { gunzipSync } from "node:zlib";
import Redis from "ioredis";

import { parseShopifyTaxonomyText } from "./shopify-taxonomy-distribution.mjs";
import {
  SHOPIFY_TAXONOMY_METADATA_KEY,
  SHOPIFY_TAXONOMY_SUBCATEGORY_ALIAS,
  SHOPIFY_TAXONOMY_TOP_ALIAS,
  buildTaxonomyIndexDocuments,
  createTaxonomyRedisNames,
  embedTaxonomyTexts,
  estimateRawVectorBytes,
  estimateTaxonomyRedisBytes,
  indexCreateArguments,
  loadTaxonomyEmbeddingConfig,
  parseRedisMemoryInfo,
  redisPipelineFailure,
  staleTaxonomyIndexNames,
  parseSearchTotal,
  taxonomyDocumentKey,
} from "./shopify-taxonomy-redis-sync.mjs";

const manifestPath = path.join(
  process.cwd(),
  "src/data/shopify-taxonomy-manifest.json",
);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

const FETCH_TIMEOUT_MS = 15_000;
const MAX_COMPRESSED_BYTES = 1024 * 1024;
const MAX_DECOMPRESSED_BYTES = 16 * 1024 * 1024;
const REDIS_TIMEOUT_MS = 5_000;
const INDEX_WAIT_TIMEOUT_MS = 30_000;
const PIPELINE_BATCH_SIZE = 250;

function fail(message) {
  throw new Error(`Shopify taxonomy sync failed: ${message}`);
}

function redisUrl() {
  const value = process.env.REDIS_URL?.trim();
  if (!value) fail("REDIS_URL is not configured");
  return value;
}

async function downloadTaxonomy() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(manifest.assetUrl, {
      redirect: "follow",
      signal: controller.signal,
      headers: { Accept: "application/octet-stream" },
    });
    if (!response.ok) fail(`download returned HTTP ${response.status}`);

    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_COMPRESSED_BYTES) {
      fail("compressed taxonomy asset exceeds the size limit");
    }

    const compressed = new Uint8Array(await response.arrayBuffer());
    if (compressed.byteLength > MAX_COMPRESSED_BYTES) {
      fail("compressed taxonomy asset exceeds the size limit");
    }
    const decompressed = gunzipSync(Buffer.from(compressed), {
      maxOutputLength: MAX_DECOMPRESSED_BYTES,
    });
    const snapshot = parseShopifyTaxonomyText(
      decompressed.toString("utf8"),
      manifest.version,
      manifest.assetUrl,
    );
    return {
      snapshot,
      sourceSha256: createHash("sha256").update(compressed).digest("hex"),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function ensureRedisSearch(redis) {
  try {
    await redis.call("FT._LIST");
  } catch {
    fail("REDIS_URL does not expose Redis Search / vector index commands");
  }
}

function formatMiB(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

function createCountProgressReporter(label, total, interval = 1_000) {
  let nextThreshold = Math.min(interval, total);

  return ({ completed, batchNumber, batchCount }) => {
    if (completed < nextThreshold && completed < total) return;

    const percentage = total > 0 ? Math.round((completed / total) * 100) : 100;
    process.stdout.write(
      `${label}: ${completed}/${total} (${percentage}%; batch ${batchNumber}/${batchCount}).\n`,
    );

    while (nextThreshold <= completed && nextThreshold < total) {
      nextThreshold = Math.min(nextThreshold + interval, total);
    }
  };
}

async function inspectRedisMemory(redis, estimatedRedisBytes, rawVectorBytes) {
  let memory;
  try {
    memory = parseRedisMemoryInfo(await redis.call("INFO", "memory"));
  } catch {
    process.stdout.write(
      "Redis memory preflight was unavailable; continuing with document-level error reporting.\n",
    );
    return;
  }
  if (!memory || memory.maxMemory <= 0) return;

  const available = Math.max(0, memory.maxMemory - memory.usedMemory);
  process.stdout.write(
    `Redis memory headroom is ${formatMiB(available)} MiB; taxonomy vectors use ${formatMiB(rawVectorBytes)} MiB raw and are estimated to require about ${formatMiB(estimatedRedisBytes)} MiB in Redis with HASH + FLAT index storage.\n`,
  );
  if (available < estimatedRedisBytes) {
    fail(
      `Redis does not have enough configured memory for the taxonomy index estimate: ` +
        `${formatMiB(estimatedRedisBytes)} MiB estimated, ${formatMiB(available)} MiB available. ` +
        `Reduce SHOPIFY_TAXONOMY_EMBEDDING_DIMENSIONS or increase Redis capacity before retrying.`,
    );
  }
}

async function cleanupStaleTaxonomyIndexes(redis, current) {
  let indexNames;
  try {
    indexNames = await redis.call("FT._LIST");
  } catch {
    return 0;
  }
  const stale = staleTaxonomyIndexNames(Array.isArray(indexNames) ? indexNames : [], current);
  for (const indexName of stale) {
    await dropIndex(redis, indexName);
  }
  return stale.length;
}

async function createIndex(redis, args) {
  await redis.call(...args);
}

async function writeDocuments(redis, documents, vectors, prefix, label) {
  if (documents.length !== vectors.length) {
    fail("taxonomy document/vector counts do not match");
  }

  const reportProgress = createCountProgressReporter(
    `Writing ${label} taxonomy documents to Redis`,
    documents.length,
  );
  const batchCount = Math.ceil(documents.length / PIPELINE_BATCH_SIZE);

  for (let start = 0; start < documents.length; start += PIPELINE_BATCH_SIZE) {
    const pipeline = redis.pipeline();
    const end = Math.min(start + PIPELINE_BATCH_SIZE, documents.length);
    for (let index = start; index < end; index += 1) {
      const document = documents[index];
      pipeline.hset(
        taxonomyDocumentKey(prefix, document.categoryId),
        "categoryId",
        document.categoryId,
        "name",
        document.name,
        "fullName",
        document.fullName,
        "parentId",
        document.parentId,
        "rootId",
        document.rootId,
        "level",
        document.level,
        "hasChildren",
        document.hasChildren,
        "ancestorsJson",
        document.ancestorsJson,
        "embedding",
        vectors[index],
      );
    }
    const replies = await pipeline.exec();
    const rejection = redisPipelineFailure(replies, documents, start);
    if (rejection) {
      fail(
        `Redis rejected taxonomy document ${rejection.categoryId} ` +
          `(${start + 1}-${end} of ${documents.length}): ${rejection.message}`,
      );
    }

    reportProgress({
      completed: end,
      total: documents.length,
      batchNumber: Math.floor(start / PIPELINE_BATCH_SIZE) + 1,
      batchCount,
    });
  }
}

async function indexDocumentCount(redis, indexName) {
  const reply = await redis.call(
    "FT.SEARCH",
    indexName,
    "*",
    "LIMIT",
    0,
    0,
    "DIALECT",
    2,
  );
  return parseSearchTotal(reply);
}

async function waitForIndex(redis, indexName, expectedCount) {
  const deadline = Date.now() + INDEX_WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const count = await indexDocumentCount(redis, indexName);
    if (count === expectedCount) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  fail(`${indexName} did not reach ${expectedCount} indexed documents`);
}

async function smokeVectorSearch(redis, indexName, vector) {
  const reply = await redis.call(
    "FT.SEARCH",
    indexName,
    "(*)=>[KNN 1 @embedding $queryVector AS vectorScore]",
    "PARAMS",
    2,
    "queryVector",
    vector,
    "RETURN",
    2,
    "categoryId",
    "vectorScore",
    "LIMIT",
    0,
    1,
    "DIALECT",
    2,
  );
  if (parseSearchTotal(reply) < 1) fail(`${indexName} vector smoke search returned no results`);
}

async function dropIndex(redis, indexName) {
  if (!indexName) return;
  try {
    await redis.call("FT.DROPINDEX", indexName, "DD");
  } catch (error) {
    const message = String(error?.message ?? error);
    if (!/Unknown Index name|no such index/i.test(message)) throw error;
  }
}

async function deleteAlias(redis, alias) {
  try {
    await redis.call("FT.ALIASDEL", alias);
  } catch (error) {
    const message = String(error?.message ?? error);
    if (!/Alias does not exist|Unknown alias/i.test(message)) throw error;
  }
}

async function restoreAlias(redis, alias, previousIndex) {
  if (previousIndex) await redis.call("FT.ALIASUPDATE", alias, previousIndex);
  else await deleteAlias(redis, alias);
}

async function replaceAliases(redis, previous, next) {
  let topUpdated = false;
  let subcategoryUpdated = false;
  try {
    await redis.call("FT.ALIASUPDATE", SHOPIFY_TAXONOMY_TOP_ALIAS, next.topIndex);
    topUpdated = true;
    await redis.call(
      "FT.ALIASUPDATE",
      SHOPIFY_TAXONOMY_SUBCATEGORY_ALIAS,
      next.subcategoryIndex,
    );
    subcategoryUpdated = true;
  } catch (error) {
    if (subcategoryUpdated) {
      await restoreAlias(
        redis,
        SHOPIFY_TAXONOMY_SUBCATEGORY_ALIAS,
        previous.subcategoryIndex,
      ).catch(() => {});
    }
    if (topUpdated) {
      await restoreAlias(redis, SHOPIFY_TAXONOMY_TOP_ALIAS, previous.topIndex).catch(
        () => {},
      );
    }
    throw error;
  }
}

function oldIndexMetadata(raw) {
  return {
    topIndex: raw.topIndex?.trim() || null,
    subcategoryIndex: raw.subcategoryIndex?.trim() || null,
  };
}

async function persistMetadata(redis, input) {
  await redis.hset(
    SHOPIFY_TAXONOMY_METADATA_KEY,
    "taxonomyVersion",
    input.taxonomyVersion,
    "sourceUrl",
    input.sourceUrl,
    "sourceSha256",
    input.sourceSha256,
    "embeddingProvider",
    input.embeddingProvider,
    "embeddingModel",
    input.embeddingModel,
    "embeddingDimensions",
    String(input.embeddingDimensions),
    "embeddingIndexVersion",
    input.embeddingIndexVersion,
    "topLevelCount",
    String(input.topLevelCount),
    "subcategoryCount",
    String(input.subcategoryCount),
    "topIndex",
    input.topIndex,
    "subcategoryIndex",
    input.subcategoryIndex,
    "syncedAt",
    input.syncedAt,
  );
}

const config = loadTaxonomyEmbeddingConfig();
const redis = new Redis(redisUrl(), {
  // ioredis v6 negotiates RESP3 by default, while FT.SEARCH has a different
  // RESP3 map reply. Keep taxonomy search on the stable RESP2 array contract.
  protocol: 2,
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  connectTimeout: REDIS_TIMEOUT_MS,
  commandTimeout: REDIS_TIMEOUT_MS,
});

const names = createTaxonomyRedisNames();
let topCreated = false;
let subcategoryCreated = false;
let aliasesReplaced = false;
let previousMetadata = {};

try {
  await redis.connect();
  await ensureRedisSearch(redis);
  process.stdout.write("Connected to Redis and verified Redis Search support.\n");
  previousMetadata = await redis.hgetall(SHOPIFY_TAXONOMY_METADATA_KEY);
  const previous = oldIndexMetadata(previousMetadata);
  const staleIndexCount = await cleanupStaleTaxonomyIndexes(redis, previous);
  process.stdout.write(
    `Stale taxonomy index cleanup complete: removed ${staleIndexCount} index${staleIndexCount === 1 ? "" : "es"}.\n`,
  );

  process.stdout.write(
    `Downloading Shopify taxonomy ${manifest.version} from the pinned release...\n`,
  );
  const { snapshot, sourceSha256 } = await downloadTaxonomy();
  const { topLevel, subcategories } = buildTaxonomyIndexDocuments(snapshot.categories);
  const documentCount = topLevel.length + subcategories.length;
  process.stdout.write(
    `Downloaded and parsed Shopify taxonomy ${snapshot.version}: ${topLevel.length} top-level categories, ${subcategories.length} subcategories.\n`,
  );
  const rawVectorBytes = estimateRawVectorBytes(documentCount, config.dimensions);
  const estimatedRedisBytes = estimateTaxonomyRedisBytes(
    documentCount,
    config.dimensions,
  );
  process.stdout.write(
    `Taxonomy embeddings use ${config.dimensions} dimensions (${formatMiB(rawVectorBytes)} MiB raw FLOAT32; about ${formatMiB(estimatedRedisBytes)} MiB estimated Redis storage with HASH + FLAT indexes).\n`,
  );
  await inspectRedisMemory(redis, estimatedRedisBytes, rawVectorBytes);

  process.stdout.write(
    `Embedding ${topLevel.length} top-level categories and ${subcategories.length} subcategories with ${config.model} at ${config.dimensions} dimensions...\n`,
  );
  const topVectors = await embedTaxonomyTexts(
    topLevel.map((document) => document.fullName),
    config,
    {
      onProgress: createCountProgressReporter(
        "Embedding top-level taxonomy categories",
        topLevel.length,
      ),
    },
  );
  const subcategoryVectors = await embedTaxonomyTexts(
    subcategories.map((document) => document.fullName),
    config,
    {
      onProgress: createCountProgressReporter(
        "Embedding taxonomy subcategories",
        subcategories.length,
      ),
    },
  );
  process.stdout.write("Taxonomy embedding generation complete.\n");

  process.stdout.write("Creating replacement Redis vector indexes.\n");
  await createIndex(
    redis,
    indexCreateArguments({
      indexName: names.topIndex,
      prefix: names.topPrefix,
      dimensions: config.dimensions,
      algorithm: "FLAT",
    }),
  );
  topCreated = true;
  await createIndex(
    redis,
    indexCreateArguments({
      indexName: names.subcategoryIndex,
      prefix: names.subcategoryPrefix,
      dimensions: config.dimensions,
      algorithm: "FLAT",
    }),
  );
  subcategoryCreated = true;
  process.stdout.write(
    `Created replacement indexes ${names.topIndex} and ${names.subcategoryIndex}.\n`,
  );

  await writeDocuments(redis, topLevel, topVectors, names.topPrefix, "top-level");
  await writeDocuments(
    redis,
    subcategories,
    subcategoryVectors,
    names.subcategoryPrefix,
    "subcategory",
  );
  process.stdout.write("Redis taxonomy document writes complete.\n");

  process.stdout.write("Waiting for Redis Search to index replacement documents.\n");
  await waitForIndex(redis, names.topIndex, topLevel.length);
  await waitForIndex(redis, names.subcategoryIndex, subcategories.length);
  process.stdout.write("Redis Search replacement indexes reached expected document counts.\n");

  process.stdout.write("Running vector smoke searches against replacement indexes.\n");
  await smokeVectorSearch(redis, names.topIndex, topVectors[0]);
  await smokeVectorSearch(redis, names.subcategoryIndex, subcategoryVectors[0]);
  process.stdout.write("Replacement index vector smoke searches passed.\n");

  await replaceAliases(redis, previous, names);
  aliasesReplaced = true;
  process.stdout.write("Switched stable taxonomy aliases to the replacement indexes.\n");
  try {
    await persistMetadata(redis, {
      taxonomyVersion: snapshot.version,
      sourceUrl: manifest.assetUrl,
      sourceSha256,
      embeddingProvider: config.provider,
      embeddingModel: config.model,
      embeddingDimensions: config.dimensions,
      embeddingIndexVersion: config.indexVersion,
      topLevelCount: topLevel.length,
      subcategoryCount: subcategories.length,
      topIndex: names.topIndex,
      subcategoryIndex: names.subcategoryIndex,
      syncedAt: new Date().toISOString(),
    });
    process.stdout.write("Persisted active taxonomy index metadata.\n");
  } catch (error) {
    await restoreAlias(redis, SHOPIFY_TAXONOMY_TOP_ALIAS, previous.topIndex).catch(
      () => {},
    );
    await restoreAlias(
      redis,
      SHOPIFY_TAXONOMY_SUBCATEGORY_ALIAS,
      previous.subcategoryIndex,
    ).catch(() => {});
    aliasesReplaced = false;
    throw error;
  }

  if (previous.topIndex && previous.topIndex !== names.topIndex) {
    await dropIndex(redis, previous.topIndex);
  }
  if (
    previous.subcategoryIndex &&
    previous.subcategoryIndex !== names.subcategoryIndex
  ) {
    await dropIndex(redis, previous.subcategoryIndex);
  }

  process.stdout.write(
    `Shopify taxonomy ${snapshot.version} synchronized to Redis: ${topLevel.length} top-level categories, ${subcategories.length} subcategories.\n`,
  );
  process.stdout.write(
    "Previous taxonomy indexes were removed after the replacement passed validation.\n",
  );
} catch (error) {
  if (!aliasesReplaced) {
    if (topCreated) await dropIndex(redis, names.topIndex).catch(() => {});
    if (subcategoryCreated) {
      await dropIndex(redis, names.subcategoryIndex).catch(() => {});
    }
  }
  throw error;
} finally {
  await redis.quit().catch(() => redis.disconnect());
}
