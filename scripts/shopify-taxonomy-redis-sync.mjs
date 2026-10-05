import { randomUUID } from "node:crypto";

export const SHOPIFY_TAXONOMY_TOP_ALIAS = "idx:moda:shopify-taxonomy:top";
export const SHOPIFY_TAXONOMY_SUBCATEGORY_ALIAS = "idx:moda:shopify-taxonomy:sub";
export const SHOPIFY_TAXONOMY_METADATA_KEY = "moda:shopify-taxonomy:metadata";
export const DEFAULT_SHOPIFY_TAXONOMY_EMBEDDING_DIMENSIONS = 256;
const MAX_SHOPIFY_TAXONOMY_EMBEDDING_DIMENSIONS = 512;

export function loadTaxonomyEmbeddingConfig(environment = process.env) {
  const provider = environment.EMBEDDING_PROVIDER?.trim();
  const model = environment.EMBEDDING_MODEL?.trim();
  const dimensions = Number(
    environment.SHOPIFY_TAXONOMY_EMBEDDING_DIMENSIONS?.trim() ||
      DEFAULT_SHOPIFY_TAXONOMY_EMBEDDING_DIMENSIONS,
  );
  const indexVersion = environment.EMBEDDING_INDEX_VERSION?.trim();
  const apiKey = environment.EMBEDDING_API_KEY?.trim();

  if (
    provider !== "openai" ||
    !model ||
    !/^text-embedding-3-(?:small|large)$/.test(model) ||
    !Number.isSafeInteger(dimensions) ||
    dimensions <= 0 ||
    dimensions > MAX_SHOPIFY_TAXONOMY_EMBEDDING_DIMENSIONS ||
    !indexVersion ||
    indexVersion.length > 64 ||
    !apiKey
  ) {
    throw new Error(
      "Shopify taxonomy sync requires EMBEDDING_PROVIDER=openai, an OpenAI text-embedding-3 model, EMBEDDING_INDEX_VERSION and EMBEDDING_API_KEY. SHOPIFY_TAXONOMY_EMBEDDING_DIMENSIONS may optionally override the default 256 dimensions (maximum 512).",
    );
  }

  return { provider: "openai", model, dimensions, indexVersion, apiKey };
}

export function vectorToFloat32Buffer(vector, dimensions) {
  if (
    !Array.isArray(vector) ||
    vector.length !== dimensions ||
    !vector.every((value) => typeof value === "number" && Number.isFinite(value))
  ) {
    throw new Error("Embedding provider returned an invalid taxonomy vector.");
  }
  const buffer = Buffer.allocUnsafe(dimensions * Float32Array.BYTES_PER_ELEMENT);
  vector.forEach((value, index) => buffer.writeFloatLE(value, index * 4));
  return buffer;
}

export async function embedTaxonomyTexts(
  texts,
  config,
  { fetchImpl = fetch, batchSize = 100, onProgress } = {},
) {
  const output = [];
  const batchCount = Math.ceil(texts.length / batchSize);
  for (let start = 0; start < texts.length; start += batchSize) {
    const batch = texts.slice(start, start + batchSize);
    const response = await fetchImpl("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        input: batch,
        dimensions: config.dimensions,
      }),
    });
    if (!response.ok) {
      throw new Error(`Embedding request failed with HTTP ${response.status}.`);
    }
    const payload = await response.json();
    if (!Array.isArray(payload?.data) || payload.data.length !== batch.length) {
      throw new Error("Embedding provider returned an unexpected batch size.");
    }
    const sorted = [...payload.data].sort((left, right) => left.index - right.index);
    for (const item of sorted) {
      output.push(vectorToFloat32Buffer(item.embedding, config.dimensions));
    }

    try {
      onProgress?.({
        completed: Math.min(start + batch.length, texts.length),
        total: texts.length,
        batchNumber: Math.floor(start / batchSize) + 1,
        batchCount,
      });
    } catch {
      // Progress reporting is diagnostic only and must not affect synchronization.
    }
  }
  return output;
}

export function categoryRootId(category) {
  return category.ancestors?.[0]?.id ?? category.id;
}

export function buildTaxonomyIndexDocuments(categories) {
  const topLevel = [];
  const subcategories = [];

  for (const category of categories) {
    const document = {
      categoryId: category.id,
      name: category.name,
      fullName: category.fullName,
      parentId: category.parentId ?? "",
      rootId: categoryRootId(category),
      level: String(category.level),
      hasChildren: category.hasChildren ? "1" : "0",
      ancestorsJson: JSON.stringify(category.ancestors ?? []),
    };
    if (category.level === 0) topLevel.push(document);
    else subcategories.push(document);
  }

  if (topLevel.length === 0 || subcategories.length === 0) {
    throw new Error("Shopify taxonomy distribution must contain roots and subcategories.");
  }
  return { topLevel, subcategories };
}

export function createTaxonomyRedisNames() {
  const token = randomUUID().replaceAll("-", "");
  return {
    topIndex: `idx:moda:shopify-taxonomy:top:${token}`,
    subcategoryIndex: `idx:moda:shopify-taxonomy:sub:${token}`,
    topPrefix: `moda:shopify-taxonomy:doc:${token}:top:`,
    subcategoryPrefix: `moda:shopify-taxonomy:doc:${token}:sub:`,
  };
}

export function taxonomyDocumentKey(prefix, categoryId) {
  return `${prefix}${Buffer.from(categoryId, "utf8").toString("base64url")}`;
}

export function indexCreateArguments({ indexName, prefix, dimensions, algorithm }) {
  return [
    "FT.CREATE",
    indexName,
    "ON",
    "HASH",
    "PREFIX",
    1,
    prefix,
    "SCHEMA",
    "categoryId",
    "TAG",
    "name",
    "TEXT",
    "fullName",
    "TEXT",
    "SORTABLE",
    "parentId",
    "TAG",
    "rootId",
    "TAG",
    "level",
    "NUMERIC",
    "hasChildren",
    "TAG",
    "embedding",
    "VECTOR",
    algorithm,
    6,
    "TYPE",
    "FLOAT32",
    "DIM",
    dimensions,
    "DISTANCE_METRIC",
    "COSINE",
  ];
}

function redisMapValue(reply, key) {
  if (reply instanceof Map) return reply.get(key);
  if (reply && typeof reply === "object" && !Array.isArray(reply)) {
    return reply[key];
  }
  if (Array.isArray(reply)) {
    for (let index = 0; index + 1 < reply.length; index += 2) {
      const candidate = Buffer.isBuffer(reply[index])
        ? reply[index].toString("utf8")
        : String(reply[index]);
      if (candidate === key) return reply[index + 1];
    }
  }
  return undefined;
}

export function parseSearchTotal(reply) {
  // RESP2: [total, docId, fields, ...]
  if (Array.isArray(reply) && Number.isFinite(Number(reply[0]))) {
    return Number(reply[0]);
  }

  // RESP3 FT.SEARCH is a map containing total_results. ioredis v6 can
  // expose RESP3 maps either as plain objects or as legacy flat arrays.
  const total = redisMapValue(reply, "total_results");
  if (Number.isFinite(Number(total))) return Number(total);

  throw new Error("Redis Search returned an invalid taxonomy response.");
}

export function estimateRawVectorBytes(documentCount, dimensions) {
  if (
    !Number.isSafeInteger(documentCount) ||
    documentCount < 0 ||
    !Number.isSafeInteger(dimensions) ||
    dimensions <= 0
  ) {
    throw new Error("Taxonomy vector storage estimate requires valid counts and dimensions.");
  }
  return documentCount * dimensions * Float32Array.BYTES_PER_ELEMENT;
}

export function estimateTaxonomyRedisBytes(documentCount, dimensions) {
  const rawVectors = estimateRawVectorBytes(documentCount, dimensions);
  // Redis keeps the vector field in the HASH and RediSearch keeps its own FLAT
  // vector storage. Add a conservative allowance for the remaining HASH fields
  // and index metadata so capacity checks happen before embedding API spend.
  const documentMetadata = documentCount * 512;
  const fixedIndexAllowance = 4 * 1024 * 1024;
  return rawVectors * 2 + documentMetadata + fixedIndexAllowance;
}

export function isPhysicalTaxonomyIndexName(indexName) {
  return /^idx:moda:shopify-taxonomy:(?:top|sub):[0-9a-f]{32}$/.test(
    String(indexName),
  );
}

export function staleTaxonomyIndexNames(indexNames, current = {}) {
  const keep = new Set(
    [current.topIndex, current.subcategoryIndex].filter(Boolean),
  );
  return indexNames
    .map((name) => String(name))
    .filter((name) => isPhysicalTaxonomyIndexName(name) && !keep.has(name));
}

export function parseRedisMemoryInfo(info) {
  if (typeof info !== "string") return null;
  const fields = new Map();
  for (const line of info.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    fields.set(line.slice(0, separator), line.slice(separator + 1));
  }
  const usedMemory = Number(fields.get("used_memory"));
  const maxMemory = Number(fields.get("maxmemory"));
  if (!Number.isFinite(usedMemory) || !Number.isFinite(maxMemory)) return null;
  return { usedMemory, maxMemory };
}

export function redisPipelineFailure(replies, documents, start) {
  if (!Array.isArray(replies)) {
    return {
      categoryId: documents[start]?.categoryId ?? "unknown",
      message: "Redis returned no pipeline response",
    };
  }
  for (let offset = 0; offset < replies.length; offset += 1) {
    const [error] = replies[offset] ?? [];
    if (!error) continue;
    const rawMessage = String(error?.message ?? error).replace(/\s+/g, " ").trim();
    return {
      categoryId: documents[start + offset]?.categoryId ?? "unknown",
      message: rawMessage.slice(0, 600) || "Redis rejected the document",
    };
  }
  return null;
}
