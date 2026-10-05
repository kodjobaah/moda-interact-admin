const EMBEDDING_TIMEOUT_MS = 10_000;
export const DEFAULT_SHOPIFY_TAXONOMY_EMBEDDING_DIMENSIONS = 256;
const MAX_SHOPIFY_TAXONOMY_EMBEDDING_DIMENSIONS = 512;

export type ShopifyTaxonomyIndexEmbeddingMetadata = {
  embeddingProvider: "openai";
  embeddingModel: string;
  embeddingDimensions: number;
  embeddingIndexVersion: string;
};

export type ShopifyTaxonomyEmbeddingConfig = {
  provider: "openai";
  model: string;
  dimensions: number;
  indexVersion: string;
  apiKey: string;
};

export type ShopifyTaxonomyEmbeddingConfigurationCode =
  | "MISSING_API_KEY"
  | "MISSING_DATABASE_CONFIGURATION"
  | "RUNTIME_CONFIGURATION_UNAVAILABLE"
  | "INDEX_CONFIGURATION_MISMATCH"
  | "INVALID_CONFIGURATION"
  | "INVALID_INDEX_METADATA";

export class ShopifyTaxonomyEmbeddingConfigurationError extends Error {
  readonly code: ShopifyTaxonomyEmbeddingConfigurationCode;

  constructor(
    code: ShopifyTaxonomyEmbeddingConfigurationCode = "INVALID_CONFIGURATION",
    message = "Reference taxonomy embedding configuration is invalid.",
  ) {
    super(message);
    this.name = "ShopifyTaxonomyEmbeddingConfigurationError";
    this.code = code;
  }
}

export class ShopifyTaxonomyEmbeddingError extends Error {
  constructor(message = "Reference taxonomy embedding request failed.") {
    super(message);
    this.name = "ShopifyTaxonomyEmbeddingError";
  }
}

export function loadShopifyTaxonomyEmbeddingConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ShopifyTaxonomyEmbeddingConfig {
  const provider = environment.EMBEDDING_PROVIDER?.trim();
  const model = environment.EMBEDDING_MODEL?.trim();
  const dimensionsValue =
    environment.SHOPIFY_TAXONOMY_EMBEDDING_DIMENSIONS?.trim() ||
    String(DEFAULT_SHOPIFY_TAXONOMY_EMBEDDING_DIMENSIONS);
  const indexVersion = environment.EMBEDDING_INDEX_VERSION?.trim();
  const apiKey = environment.EMBEDDING_API_KEY?.trim();

  const dimensions = Number(dimensionsValue);
  if (!apiKey) {
    throw new ShopifyTaxonomyEmbeddingConfigurationError(
      "MISSING_API_KEY",
      "Reference taxonomy semantic search requires EMBEDDING_API_KEY.",
    );
  }
  if (
    provider !== "openai" ||
    !model ||
    !/^text-embedding-3-(?:small|large)$/.test(model) ||
    !Number.isSafeInteger(dimensions) ||
    dimensions <= 0 ||
    dimensions > MAX_SHOPIFY_TAXONOMY_EMBEDDING_DIMENSIONS ||
    !indexVersion ||
    indexVersion.length > 64
  ) {
    throw new ShopifyTaxonomyEmbeddingConfigurationError();
  }

  return {
    provider: "openai",
    model,
    dimensions,
    indexVersion,
    apiKey,
  };
}

export function loadShopifyTaxonomyQueryEmbeddingConfig(
  metadata: ShopifyTaxonomyIndexEmbeddingMetadata,
  environment: NodeJS.ProcessEnv = process.env,
): ShopifyTaxonomyEmbeddingConfig {
  const apiKey = environment.EMBEDDING_API_KEY?.trim();
  const {
    embeddingProvider,
    embeddingModel,
    embeddingDimensions,
    embeddingIndexVersion,
  } = metadata;

  if (!apiKey) {
    throw new ShopifyTaxonomyEmbeddingConfigurationError(
      "MISSING_API_KEY",
      "Reference taxonomy semantic search requires EMBEDDING_API_KEY.",
    );
  }
  if (
    embeddingProvider !== "openai" ||
    !/^text-embedding-3-(?:small|large)$/.test(embeddingModel) ||
    !Number.isSafeInteger(embeddingDimensions) ||
    embeddingDimensions <= 0 ||
    embeddingDimensions > MAX_SHOPIFY_TAXONOMY_EMBEDDING_DIMENSIONS ||
    !embeddingIndexVersion ||
    embeddingIndexVersion.length > 64
  ) {
    throw new ShopifyTaxonomyEmbeddingConfigurationError(
      "INVALID_INDEX_METADATA",
      "Reference taxonomy index embedding metadata is invalid.",
    );
  }

  return {
    provider: "openai",
    model: embeddingModel,
    dimensions: embeddingDimensions,
    indexVersion: embeddingIndexVersion,
    apiKey,
  };
}


export type ShopifyTaxonomyRuntimeEmbeddingConfiguration = {
  embeddingProvider: string;
  embeddingModel: string;
  embeddingDimensions: number;
  embeddingIndexVersion: string;
  apiKey: string;
};

export function loadShopifyTaxonomyQueryEmbeddingConfigFromRuntime(
  metadata: ShopifyTaxonomyIndexEmbeddingMetadata,
  runtime: ShopifyTaxonomyRuntimeEmbeddingConfiguration,
): ShopifyTaxonomyEmbeddingConfig {
  const {
    embeddingProvider,
    embeddingModel,
    embeddingDimensions,
    embeddingIndexVersion,
  } = metadata;

  if (
    embeddingProvider !== "openai" ||
    !/^text-embedding-3-(?:small|large)$/.test(embeddingModel) ||
    !Number.isSafeInteger(embeddingDimensions) ||
    embeddingDimensions <= 0 ||
    embeddingDimensions > MAX_SHOPIFY_TAXONOMY_EMBEDDING_DIMENSIONS ||
    !embeddingIndexVersion ||
    embeddingIndexVersion.length > 64
  ) {
    throw new ShopifyTaxonomyEmbeddingConfigurationError(
      "INVALID_INDEX_METADATA",
      "Reference taxonomy index embedding metadata is invalid.",
    );
  }

  if (
    runtime.embeddingProvider !== "openai" ||
    !/^text-embedding-3-(?:small|large)$/.test(runtime.embeddingModel) ||
    !Number.isSafeInteger(runtime.embeddingDimensions) ||
    runtime.embeddingDimensions <= 0 ||
    runtime.embeddingDimensions > MAX_SHOPIFY_TAXONOMY_EMBEDDING_DIMENSIONS ||
    !runtime.embeddingIndexVersion ||
    runtime.embeddingIndexVersion.length > 64 ||
    !runtime.apiKey.trim()
  ) {
    throw new ShopifyTaxonomyEmbeddingConfigurationError(
      "RUNTIME_CONFIGURATION_UNAVAILABLE",
      "Reference taxonomy embedding runtime configuration is unavailable.",
    );
  }

  if (
    runtime.embeddingProvider !== embeddingProvider ||
    runtime.embeddingModel !== embeddingModel ||
    runtime.embeddingDimensions !== embeddingDimensions ||
    runtime.embeddingIndexVersion !== embeddingIndexVersion
  ) {
    throw new ShopifyTaxonomyEmbeddingConfigurationError(
      "INDEX_CONFIGURATION_MISMATCH",
      "Reference taxonomy search index was built with a different embedding configuration.",
    );
  }

  return {
    provider: "openai",
    model: runtime.embeddingModel,
    dimensions: runtime.embeddingDimensions,
    indexVersion: runtime.embeddingIndexVersion,
    apiKey: runtime.apiKey,
  };
}

export function shopifyTaxonomyVectorBuffer(vector: number[]): Buffer {
  const buffer = Buffer.allocUnsafe(vector.length * Float32Array.BYTES_PER_ELEMENT);
  vector.forEach((value, index) => buffer.writeFloatLE(value, index * 4));
  return buffer;
}

export async function embedShopifyTaxonomyQuery(
  text: string,
  config: ShopifyTaxonomyEmbeddingConfig = loadShopifyTaxonomyEmbeddingConfig(),
): Promise<number[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EMBEDDING_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        input: text,
        dimensions: config.dimensions,
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) throw new ShopifyTaxonomyEmbeddingError();
    const payload = (await response.json()) as {
      data?: Array<{ embedding?: unknown }>;
    };
    const vector = payload.data?.[0]?.embedding;
    if (
      !Array.isArray(vector) ||
      vector.length !== config.dimensions ||
      !vector.every(
        (value): value is number =>
          typeof value === "number" && Number.isFinite(value),
      )
    ) {
      throw new ShopifyTaxonomyEmbeddingError(
        "Reference taxonomy embedding response is invalid.",
      );
    }
    return vector;
  } catch (error) {
    if (
      error instanceof ShopifyTaxonomyEmbeddingError ||
      error instanceof ShopifyTaxonomyEmbeddingConfigurationError
    ) {
      throw error;
    }
    throw new ShopifyTaxonomyEmbeddingError();
  } finally {
    clearTimeout(timeout);
  }
}
