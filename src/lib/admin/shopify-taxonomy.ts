import { CommerceEmbeddingPurpose } from "@prisma/client";
import Redis from "ioredis";

import {
  embedShopifyTaxonomyQuery,
  loadShopifyTaxonomyQueryEmbeddingConfigFromRuntime,
  shopifyTaxonomyVectorBuffer,
  ShopifyTaxonomyEmbeddingConfigurationError,
  ShopifyTaxonomyEmbeddingError,
} from "./shopify-taxonomy-embedding.ts";
import {
  EMBEDDING_CONFIGURATION_ERRORS,
  getEmbeddingRuntimeConfiguration,
} from "./embedding-configuration.ts";
import { EMBEDDING_CREDENTIAL_ENCRYPTION_UNAVAILABLE } from "./embedding-configuration-crypto.ts";

export const SHOPIFY_TAXONOMY_TOP_INDEX_ALIAS =
  "idx:moda:shopify-taxonomy:top";
export const SHOPIFY_TAXONOMY_SUBCATEGORY_INDEX_ALIAS =
  "idx:moda:shopify-taxonomy:sub";
export const SHOPIFY_TAXONOMY_METADATA_KEY =
  "moda:shopify-taxonomy:metadata";

const SHOPIFY_TAXONOMY_DEFAULT_LIMIT = 10;
const SHOPIFY_TAXONOMY_MAX_LIMIT = 10;
const REDIS_OPERATION_TIMEOUT_MS = 2_500;
const MAX_BROWSE_RESULTS = 250;

export type ShopifyTaxonomyAncestor = {
  id: string;
  name: string;
};

export type ShopifyTaxonomyCategory = {
  id: string;
  level: number;
  name: string;
  fullName: string;
  parentId: string | null;
  hasChildren: boolean;
  ancestors: ShopifyTaxonomyAncestor[];
};

export type ShopifyTaxonomySearchScope = "all" | "top-level" | "subcategories";

export type ShopifyTaxonomyMetadata = {
  taxonomyVersion: string;
  sourceUrl: string;
  sourceSha256: string;
  embeddingProvider: "openai";
  embeddingModel: string;
  embeddingDimensions: number;
  embeddingIndexVersion: string;
  topLevelCount: number;
  subcategoryCount: number;
  syncedAt: string;
};

type ScoredCategory = {
  category: ShopifyTaxonomyCategory;
  score: number;
};

export type ShopifyTaxonomyUnavailableCode =
  | "UNAVAILABLE"
  | "EMBEDDING_CONFIGURATION"
  | "EMBEDDING_REQUEST_FAILED";

export class ShopifyTaxonomyUnavailableError extends Error {
  readonly code: ShopifyTaxonomyUnavailableCode;
  readonly detail: string | null;

  constructor(
    message = "Reference taxonomy search is unavailable.",
    code: ShopifyTaxonomyUnavailableCode = "UNAVAILABLE",
    detail: string | null = null,
  ) {
    super(message);
    this.name = "ShopifyTaxonomyUnavailableError";
    this.code = code;
    this.detail = detail;
  }
}

export class ShopifyTaxonomyInvalidQueryError extends Error {
  constructor(message = "Reference taxonomy query is invalid.") {
    super(message);
    this.name = "ShopifyTaxonomyInvalidQueryError";
  }
}

function parseLimit(value: string | null): number {
  if (value === null || value === "") return SHOPIFY_TAXONOMY_DEFAULT_LIMIT;
  if (!/^\d+$/.test(value)) throw new ShopifyTaxonomyInvalidQueryError();
  const parsed = Number(value);
  if (parsed < 1 || parsed > SHOPIFY_TAXONOMY_MAX_LIMIT) {
    throw new ShopifyTaxonomyInvalidQueryError();
  }
  return parsed;
}

function scalar(value: unknown): string {
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function parseAncestors(value: string): ShopifyTaxonomyAncestor[] {
  if (!value) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new ShopifyTaxonomyUnavailableError(
      "Reference taxonomy index contains invalid ancestor metadata.",
    );
  }
  if (!Array.isArray(parsed)) {
    throw new ShopifyTaxonomyUnavailableError(
      "Reference taxonomy index contains invalid ancestor metadata.",
    );
  }
  return parsed.map((ancestor) => {
    if (!ancestor || typeof ancestor !== "object") {
      throw new ShopifyTaxonomyUnavailableError(
        "Reference taxonomy index contains invalid ancestor metadata.",
      );
    }
    const candidate = ancestor as Record<string, unknown>;
    const id = scalar(candidate.id).trim();
    const name = scalar(candidate.name).trim();
    if (!id || !name) {
      throw new ShopifyTaxonomyUnavailableError(
        "Reference taxonomy index contains invalid ancestor metadata.",
      );
    }
    return { id, name };
  });
}

function parseCategory(fields: Record<string, string>): ShopifyTaxonomyCategory {
  const id = fields.categoryId?.trim();
  const name = fields.name?.trim();
  const fullName = fields.fullName?.trim();
  const level = Number(fields.level);
  if (!id || !name || !fullName || !Number.isSafeInteger(level) || level < 0) {
    throw new ShopifyTaxonomyUnavailableError(
      "Reference taxonomy index contains an invalid category document.",
    );
  }
  return {
    id,
    name,
    fullName,
    level,
    parentId: fields.parentId?.trim() || null,
    hasChildren: fields.hasChildren === "1",
    ancestors: parseAncestors(fields.ancestorsJson ?? "[]"),
  };
}

export function parseRedisSearchReply(reply: unknown): ScoredCategory[] {
  if (!Array.isArray(reply) || reply.length < 1) {
    throw new ShopifyTaxonomyUnavailableError(
      "Reference taxonomy search returned an invalid response.",
    );
  }

  const results: ScoredCategory[] = [];
  for (let index = 1; index < reply.length; index += 2) {
    const fieldsValue = reply[index + 1];
    if (!Array.isArray(fieldsValue)) continue;
    const fields: Record<string, string> = {};
    for (let fieldIndex = 0; fieldIndex < fieldsValue.length; fieldIndex += 2) {
      const field = scalar(fieldsValue[fieldIndex]);
      if (!field) continue;
      fields[field] = scalar(fieldsValue[fieldIndex + 1]);
    }
    results.push({
      category: parseCategory(fields),
      score: Number.isFinite(Number(fields.vectorScore))
        ? Number(fields.vectorScore)
        : 0,
    });
  }
  return results;
}

export function escapeRedisTagValue(value: string): string {
  return value.replace(/([\\,.<>{}\[\]"':;!@#$%^&*()\-+=~|\/\s])/g, "\\$1");
}

export function buildShopifyTaxonomyVectorQuery(input: {
  limit: number;
  rootId?: string | null;
}): string {
  const filter = input.rootId
    ? `(@rootId:{${escapeRedisTagValue(input.rootId)}})`
    : "(*)";
  return `${filter}=>[KNN ${input.limit} @embedding $queryVector AS vectorScore]`;
}

let cachedRedis: Redis | null = null;
let cachedRedisUrl: string | null = null;

function getRedis(): Redis {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    throw new ShopifyTaxonomyUnavailableError(
      "Reference taxonomy search requires REDIS_URL.",
    );
  }

  if (cachedRedis && cachedRedisUrl === redisUrl) return cachedRedis;
  cachedRedis?.disconnect();
  cachedRedisUrl = redisUrl;
  cachedRedis = new Redis(redisUrl, {
    // ioredis v6 defaults to RESP3. FT.SEARCH uses a map in RESP3, whereas
    // this bounded adapter intentionally consumes the stable RESP2 array form.
    protocol: 2,
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: REDIS_OPERATION_TIMEOUT_MS,
    commandTimeout: REDIS_OPERATION_TIMEOUT_MS,
  });
  return cachedRedis;
}

async function ensureRedisReady(redis: Redis): Promise<void> {
  if (redis.status === "ready") return;
  if (redis.status === "wait" || redis.status === "end") {
    await redis.connect();
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      redis.off("ready", onReady);
      redis.off("error", onError);
    };
    redis.once("ready", onReady);
    redis.once("error", onError);
  });
}

function requiredMetadataString(
  metadata: Record<string, string>,
  field: string,
): string {
  const value = metadata[field]?.trim();
  if (!value) {
    throw new ShopifyTaxonomyUnavailableError(
      "Reference taxonomy index has not been synchronized.",
    );
  }
  return value;
}

export function parseShopifyTaxonomyMetadata(
  metadata: Record<string, string>,
): ShopifyTaxonomyMetadata {
  const embeddingProvider = requiredMetadataString(metadata, "embeddingProvider");
  const embeddingDimensions = Number(
    requiredMetadataString(metadata, "embeddingDimensions"),
  );
  const topLevelCount = Number(requiredMetadataString(metadata, "topLevelCount"));
  const subcategoryCount = Number(
    requiredMetadataString(metadata, "subcategoryCount"),
  );

  if (
    embeddingProvider !== "openai" ||
    !Number.isSafeInteger(embeddingDimensions) ||
    embeddingDimensions <= 0 ||
    !Number.isSafeInteger(topLevelCount) ||
    topLevelCount <= 0 ||
    !Number.isSafeInteger(subcategoryCount) ||
    subcategoryCount <= 0
  ) {
    throw new ShopifyTaxonomyUnavailableError(
      "Reference taxonomy index metadata is invalid.",
    );
  }

  return {
    taxonomyVersion: requiredMetadataString(metadata, "taxonomyVersion"),
    sourceUrl: requiredMetadataString(metadata, "sourceUrl"),
    sourceSha256: requiredMetadataString(metadata, "sourceSha256"),
    embeddingProvider: "openai",
    embeddingModel: requiredMetadataString(metadata, "embeddingModel"),
    embeddingDimensions,
    embeddingIndexVersion: requiredMetadataString(
      metadata,
      "embeddingIndexVersion",
    ),
    topLevelCount,
    subcategoryCount,
    syncedAt: requiredMetadataString(metadata, "syncedAt"),
  };
}

async function readMetadata(redis: Redis): Promise<ShopifyTaxonomyMetadata> {
  const metadata = await redis.hgetall(SHOPIFY_TAXONOMY_METADATA_KEY);
  return parseShopifyTaxonomyMetadata(metadata);
}

const CATEGORY_RETURN_FIELDS = [
  "categoryId",
  "name",
  "fullName",
  "parentId",
  "level",
  "hasChildren",
  "ancestorsJson",
] as const;

async function callSearch(
  redis: Redis,
  indexName: string,
  query: string,
  options: {
    limit: number;
    vector?: Buffer;
    sortByFullName?: boolean;
  },
): Promise<ScoredCategory[]> {
  const args: Array<string | number | Buffer> = [indexName, query];
  if (options.vector) {
    args.push("PARAMS", 2, "queryVector", options.vector);
  }
  if (options.sortByFullName) args.push("SORTBY", "fullName", "ASC");
  args.push(
    "RETURN",
    options.vector ? CATEGORY_RETURN_FIELDS.length + 1 : CATEGORY_RETURN_FIELDS.length,
    ...CATEGORY_RETURN_FIELDS,
  );
  if (options.vector) args.push("vectorScore");
  args.push("LIMIT", 0, options.limit, "DIALECT", 2);

  const reply = await redis.call("FT.SEARCH", ...args);
  return parseRedisSearchReply(reply);
}

async function withRedis<T>(operation: (redis: Redis) => Promise<T>): Promise<T> {
  const redis = getRedis();
  try {
    await ensureRedisReady(redis);
    return await operation(redis);
  } catch (error) {
    if (
      error instanceof ShopifyTaxonomyInvalidQueryError ||
      error instanceof ShopifyTaxonomyUnavailableError
    ) {
      throw error;
    }
    throw new ShopifyTaxonomyUnavailableError();
  }
}

async function searchIndex(
  redis: Redis,
  indexName: string,
  queryVector: Buffer,
  limit: number,
  rootId: string | null,
): Promise<ScoredCategory[]> {
  return callSearch(
    redis,
    indexName,
    buildShopifyTaxonomyVectorQuery({ limit, rootId }),
    { limit, vector: queryVector },
  );
}

async function queryEmbeddingConfigFromIndex(metadata: ShopifyTaxonomyMetadata) {
  let runtime;
  try {
    runtime = await getEmbeddingRuntimeConfiguration(
      CommerceEmbeddingPurpose.REFERENCE_TAXONOMY,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === EMBEDDING_CONFIGURATION_ERRORS.notConfigured) {
      throw new ShopifyTaxonomyEmbeddingConfigurationError(
        "MISSING_DATABASE_CONFIGURATION",
        "Reference taxonomy embedding configuration is not configured for this Commerce environment.",
      );
    }
    if (message === EMBEDDING_CREDENTIAL_ENCRYPTION_UNAVAILABLE) {
      throw new ShopifyTaxonomyEmbeddingConfigurationError(
        "RUNTIME_CONFIGURATION_UNAVAILABLE",
        "Reference taxonomy embedding credential could not be decrypted.",
      );
    }
    throw error;
  }

  return loadShopifyTaxonomyQueryEmbeddingConfigFromRuntime(
    {
      embeddingProvider: metadata.embeddingProvider,
      embeddingModel: metadata.embeddingModel,
      embeddingDimensions: metadata.embeddingDimensions,
      embeddingIndexVersion: metadata.embeddingIndexVersion,
    },
    runtime,
  );
}

export async function searchShopifyTaxonomy(input: {
  query: string;
  limitValue?: string | null;
  scope?: ShopifyTaxonomySearchScope;
  rootId?: string | null;
}): Promise<{ version: string; categories: ShopifyTaxonomyCategory[] }> {
  const query = input.query.trim();
  if (!query || query.length > 200) throw new ShopifyTaxonomyInvalidQueryError();
  const limit = parseLimit(input.limitValue ?? null);
  const scope = input.scope ?? "all";

  return withRedis(async (redis) => {
    const metadata = await readMetadata(redis);
    let vector: number[];
    try {
      vector = await embedShopifyTaxonomyQuery(
        query,
        await queryEmbeddingConfigFromIndex(metadata),
      );
    } catch (error) {
      if (error instanceof ShopifyTaxonomyEmbeddingConfigurationError) {
        throw new ShopifyTaxonomyUnavailableError(
          error.message,
          "EMBEDDING_CONFIGURATION",
          error.code,
        );
      }
      if (error instanceof ShopifyTaxonomyEmbeddingError) {
        throw new ShopifyTaxonomyUnavailableError(
          error.message,
          "EMBEDDING_REQUEST_FAILED",
        );
      }
      throw error;
    }
    const vectorBuffer = shopifyTaxonomyVectorBuffer(vector);

    if (scope === "top-level") {
      const results = await searchIndex(
        redis,
        SHOPIFY_TAXONOMY_TOP_INDEX_ALIAS,
        vectorBuffer,
        limit,
        null,
      );
      return { version: metadata.taxonomyVersion, categories: results.map((r) => r.category) };
    }

    if (scope === "subcategories") {
      const results = await searchIndex(
        redis,
        SHOPIFY_TAXONOMY_SUBCATEGORY_INDEX_ALIAS,
        vectorBuffer,
        limit,
        input.rootId?.trim() || null,
      );
      return { version: metadata.taxonomyVersion, categories: results.map((r) => r.category) };
    }

    const [top, subcategories] = await Promise.all([
      searchIndex(
        redis,
        SHOPIFY_TAXONOMY_TOP_INDEX_ALIAS,
        vectorBuffer,
        limit,
        null,
      ),
      searchIndex(
        redis,
        SHOPIFY_TAXONOMY_SUBCATEGORY_INDEX_ALIAS,
        vectorBuffer,
        limit,
        input.rootId?.trim() || null,
      ),
    ]);
    const categories = [...top, ...subcategories]
      .sort(
        (left, right) =>
          left.score - right.score ||
          left.category.fullName.localeCompare(right.category.fullName),
      )
      .slice(0, limit)
      .map((result) => result.category);
    return { version: metadata.taxonomyVersion, categories };
  });
}

async function resolveFromIndex(
  redis: Redis,
  indexName: string,
  id: string,
): Promise<ShopifyTaxonomyCategory | null> {
  const results = await callSearch(
    redis,
    indexName,
    `@categoryId:{${escapeRedisTagValue(id)}}`,
    { limit: 1 },
  );
  return results[0]?.category ?? null;
}

export async function resolveShopifyTaxonomyCategory(
  id: string,
  scope: ShopifyTaxonomySearchScope = "all",
): Promise<{ version: string; category: ShopifyTaxonomyCategory | null }> {
  const normalizedId = id.trim();
  if (!normalizedId || normalizedId.length > 255) {
    throw new ShopifyTaxonomyInvalidQueryError();
  }

  return withRedis(async (redis) => {
    const metadata = await readMetadata(redis);

    if (scope === "top-level") {
      return {
        version: metadata.taxonomyVersion,
        category: await resolveFromIndex(
          redis,
          SHOPIFY_TAXONOMY_TOP_INDEX_ALIAS,
          normalizedId,
        ),
      };
    }

    if (scope === "subcategories") {
      return {
        version: metadata.taxonomyVersion,
        category: await resolveFromIndex(
          redis,
          SHOPIFY_TAXONOMY_SUBCATEGORY_INDEX_ALIAS,
          normalizedId,
        ),
      };
    }

    const top = await resolveFromIndex(
      redis,
      SHOPIFY_TAXONOMY_TOP_INDEX_ALIAS,
      normalizedId,
    );
    if (top) return { version: metadata.taxonomyVersion, category: top };
    return {
      version: metadata.taxonomyVersion,
      category: await resolveFromIndex(
        redis,
        SHOPIFY_TAXONOMY_SUBCATEGORY_INDEX_ALIAS,
        normalizedId,
      ),
    };
  });
}

export async function browseShopifyTaxonomy(
  parentId: string | null,
): Promise<{
  version: string;
  parent: ShopifyTaxonomyCategory | null;
  breadcrumbs: ShopifyTaxonomyAncestor[];
  categories: ShopifyTaxonomyCategory[];
}> {
  const normalizedParentId = parentId?.trim() || null;

  return withRedis(async (redis) => {
    const metadata = await readMetadata(redis);
    if (!normalizedParentId) {
      const categories = await callSearch(
        redis,
        SHOPIFY_TAXONOMY_TOP_INDEX_ALIAS,
        "*",
        { limit: MAX_BROWSE_RESULTS, sortByFullName: true },
      );
      return {
        version: metadata.taxonomyVersion,
        parent: null,
        breadcrumbs: [],
        categories: categories.map((result) => result.category),
      };
    }

    const resolved = await resolveShopifyTaxonomyCategory(normalizedParentId);
    if (!resolved.category) {
      throw new ShopifyTaxonomyInvalidQueryError(
        "Reference taxonomy parent category was not found.",
      );
    }
    const categories = await callSearch(
      redis,
      SHOPIFY_TAXONOMY_SUBCATEGORY_INDEX_ALIAS,
      `@parentId:{${escapeRedisTagValue(normalizedParentId)}}`,
      { limit: MAX_BROWSE_RESULTS, sortByFullName: true },
    );
    return {
      version: metadata.taxonomyVersion,
      parent: resolved.category,
      breadcrumbs: [
        ...resolved.category.ancestors,
        { id: resolved.category.id, name: resolved.category.name },
      ],
      categories: categories.map((result) => result.category),
    };
  });
}

export function resetShopifyTaxonomyRedisForTests() {
  cachedRedis?.disconnect();
  cachedRedis = null;
  cachedRedisUrl = null;
}
