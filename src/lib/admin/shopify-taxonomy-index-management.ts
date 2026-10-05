import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import { createLogger } from "@modainteract/moda-interact-shared/logging";
import { CommerceEmbeddingPurpose, type CommerceEnvironment } from "@prisma/client";
import Redis from "ioredis";

import { resolveDeploymentEnvironmentName } from "../auth/environment.ts";

import {
  getEmbeddingRuntimeConfiguration,
  type EmbeddingRuntimeConfiguration,
} from "./embedding-configuration.ts";
import { resolveCommerceEnvironment } from "./openrouter-credential-environment.ts";
import {
  parseShopifyTaxonomyMetadata,
  SHOPIFY_TAXONOMY_METADATA_KEY,
  SHOPIFY_TAXONOMY_SUBCATEGORY_INDEX_ALIAS,
  SHOPIFY_TAXONOMY_TOP_INDEX_ALIAS,
  type ShopifyTaxonomyMetadata,
} from "./shopify-taxonomy.ts";

const REDIS_OPERATION_TIMEOUT_MS = 5_000;
const TAXONOMY_MANAGEMENT_LOCK_KEY = "moda:shopify-taxonomy:management-lock";
const TAXONOMY_MANAGEMENT_LOCK_MS = 15 * 60 * 1000;
const TAXONOMY_DOCUMENT_PATTERN = "moda:shopify-taxonomy:doc:*";
const PHYSICAL_INDEX_PREFIXES = [
  "idx:moda:shopify-taxonomy:top:",
  "idx:moda:shopify-taxonomy:sub:",
] as const;
const MAX_SYNC_OUTPUT_BYTES = 32 * 1024;
const MAX_SYNC_LOG_LINE_LENGTH = 4 * 1024;

const taxonomyIndexLogger = createLogger({
  serviceNamespace: "moda-interact",
  serviceName: "moda-interact-admin",
  environment: resolveDeploymentEnvironmentName(),
});

export type ReferenceTaxonomyIndexState =
  | "READY"
  | "NOT_LOADED"
  | "REQUIRES_SYNC"
  | "EMBEDDING_NOT_CONFIGURED"
  | "REDIS_UNAVAILABLE";

export type ReferenceTaxonomyEmbeddingStatus = {
  provider: string;
  model: string;
  dimensions: number;
  indexVersion: string;
  editVersion: number;
};

export type ReferenceTaxonomyIndexStatus = {
  environment: CommerceEnvironment;
  state: ReferenceTaxonomyIndexState;
  redisIndexPresent: boolean;
  embedding: ReferenceTaxonomyEmbeddingStatus | null;
  index: ShopifyTaxonomyMetadata | null;
};

function redisUrl(): string {
  const value = process.env.REDIS_URL?.trim();
  if (!value) throw new Error("Reference taxonomy Redis is not configured.");
  return value;
}

function createRedis(): Redis {
  return new Redis(redisUrl(), {
    protocol: 2,
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: REDIS_OPERATION_TIMEOUT_MS,
    commandTimeout: REDIS_OPERATION_TIMEOUT_MS,
  });
}

async function ensureRedisReady(redis: Redis): Promise<void> {
  if (redis.status === "ready") return;
  if (redis.status === "wait" || redis.status === "end") {
    await redis.connect();
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      redis.off("ready", ready);
      redis.off("error", error);
    };
    const ready = () => {
      cleanup();
      resolve();
    };
    const error = (cause: Error) => {
      cleanup();
      reject(cause);
    };
    redis.once("ready", ready);
    redis.once("error", error);
  });
}

function normalizedIndexNames(reply: unknown): string[] {
  if (!Array.isArray(reply)) return [];
  return reply.map((value) =>
    Buffer.isBuffer(value) ? value.toString("utf8") : String(value),
  );
}

function isPhysicalTaxonomyIndex(name: string): boolean {
  return PHYSICAL_INDEX_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function embeddingStatus(row: {
  embeddingProvider: string;
  embeddingModel: string;
  embeddingDimensions: number;
  embeddingIndexVersion: string;
  editVersion: number;
}): ReferenceTaxonomyEmbeddingStatus {
  return {
    provider: row.embeddingProvider,
    model: row.embeddingModel,
    dimensions: row.embeddingDimensions,
    indexVersion: row.embeddingIndexVersion,
    editVersion: row.editVersion,
  };
}

function indexMatchesEmbedding(
  index: ShopifyTaxonomyMetadata,
  embedding: ReferenceTaxonomyEmbeddingStatus,
): boolean {
  return (
    index.embeddingProvider === embedding.provider &&
    index.embeddingModel === embedding.model &&
    index.embeddingDimensions === embedding.dimensions &&
    index.embeddingIndexVersion === embedding.indexVersion
  );
}

export async function getReferenceTaxonomyIndexStatus(): Promise<ReferenceTaxonomyIndexStatus> {
  const environment = resolveCommerceEnvironment();
  const { prisma } = await import("@/lib/prisma");
  const configuration = await prisma.commerceEmbeddingConfiguration.findUnique({
    where: {
      environment_purpose: {
        environment,
        purpose: CommerceEmbeddingPurpose.REFERENCE_TAXONOMY,
      },
    },
    select: {
      embeddingProvider: true,
      embeddingModel: true,
      embeddingDimensions: true,
      embeddingIndexVersion: true,
      editVersion: true,
    },
  });
  const embedding = configuration ? embeddingStatus(configuration) : null;

  let redis: Redis;
  try {
    redis = createRedis();
    await ensureRedisReady(redis);
  } catch {
    return {
      environment,
      state: configuration ? "REDIS_UNAVAILABLE" : "EMBEDDING_NOT_CONFIGURED",
      redisIndexPresent: false,
      embedding,
      index: null,
    };
  }

  try {
    const [rawMetadata, rawIndexes] = await Promise.all([
      redis.hgetall(SHOPIFY_TAXONOMY_METADATA_KEY),
      redis.call("FT._LIST"),
    ]);
    const redisIndexPresent = normalizedIndexNames(rawIndexes).some(
      isPhysicalTaxonomyIndex,
    );

    if (!configuration) {
      return {
        environment,
        state: "EMBEDDING_NOT_CONFIGURED",
        redisIndexPresent,
        embedding: null,
        index: null,
      };
    }

    if (Object.keys(rawMetadata).length === 0) {
      return {
        environment,
        state: redisIndexPresent ? "REQUIRES_SYNC" : "NOT_LOADED",
        redisIndexPresent,
        embedding,
        index: null,
      };
    }

    let index: ShopifyTaxonomyMetadata;
    try {
      index = parseShopifyTaxonomyMetadata(rawMetadata);
    } catch {
      return {
        environment,
        state: "REQUIRES_SYNC",
        redisIndexPresent: true,
        embedding,
        index: null,
      };
    }

    return {
      environment,
      state: indexMatchesEmbedding(index, embedding)
        ? "READY"
        : "REQUIRES_SYNC",
      redisIndexPresent: true,
      embedding,
      index,
    };
  } catch {
    return {
      environment,
      state: "REDIS_UNAVAILABLE",
      redisIndexPresent: false,
      embedding,
      index: null,
    };
  } finally {
    await redis.quit().catch(() => redis.disconnect());
  }
}

function validateTaxonomyEmbeddingConfiguration(
  config: EmbeddingRuntimeConfiguration,
): void {
  if (
    config.embeddingProvider !== "openai" ||
    !/^text-embedding-3-(?:small|large)$/.test(config.embeddingModel) ||
    !Number.isSafeInteger(config.embeddingDimensions) ||
    config.embeddingDimensions < 1 ||
    config.embeddingDimensions > 512 ||
    !config.embeddingIndexVersion.trim() ||
    config.embeddingIndexVersion.length > 64 ||
    !config.apiKey.trim()
  ) {
    throw new Error(
      "Reference taxonomy embedding configuration is not supported by the taxonomy index.",
    );
  }
}

function appendBounded(current: string, chunk: Buffer | string): string {
  const next = `${current}${chunk.toString()}`;
  return next.length <= MAX_SYNC_OUTPUT_BYTES
    ? next
    : next.slice(next.length - MAX_SYNC_OUTPUT_BYTES);
}

type SyncOutputStream = "stdout" | "stderr";

function boundedSyncLogLine(line: string): string {
  const normalized = line.trim();
  return normalized.length <= MAX_SYNC_LOG_LINE_LENGTH
    ? normalized
    : `${normalized.slice(0, MAX_SYNC_LOG_LINE_LENGTH)}…`;
}

function createSyncOutputRelay(syncRunId: string, stream: SyncOutputStream) {
  let pending = "";

  const emit = (line: string) => {
    const message = boundedSyncLogLine(line);
    if (!message) return;

    const fields = { syncRunId, stream, message };
    if (stream === "stderr") {
      taxonomyIndexLogger.warn("admin.reference_taxonomy.sync.progress", fields);
    } else {
      taxonomyIndexLogger.info("admin.reference_taxonomy.sync.progress", fields);
    }
  };

  return {
    write(chunk: Buffer | string) {
      pending += chunk.toString();
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? "";
      for (const line of lines) emit(line);
    },
    flush() {
      if (pending) emit(pending);
      pending = "";
    },
  };
}

function lastOutputLine(stdout: string, stderr: string): string {
  const combined = `${stderr}\n${stdout}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return combined.at(-1) ?? "Reference taxonomy synchronization failed.";
}

async function runTaxonomySyncScript(
  config: EmbeddingRuntimeConfiguration,
  syncRunId: string,
): Promise<void> {
  const script = path.join(process.cwd(), "scripts", "sync-shopify-taxonomy.mjs");
  const startedAt = Date.now();

  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      cwd: process.cwd(),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        EMBEDDING_PROVIDER: config.embeddingProvider,
        EMBEDDING_MODEL: config.embeddingModel,
        SHOPIFY_TAXONOMY_EMBEDDING_DIMENSIONS: String(
          config.embeddingDimensions,
        ),
        EMBEDDING_INDEX_VERSION: config.embeddingIndexVersion,
        EMBEDDING_API_KEY: config.apiKey,
      },
    });
    const stdoutRelay = createSyncOutputRelay(syncRunId, "stdout");
    const stderrRelay = createSyncOutputRelay(syncRunId, "stderr");
    let stdout = "";
    let stderr = "";
    let settled = false;

    taxonomyIndexLogger.info("admin.reference_taxonomy.sync.child.started", {
      syncRunId,
      pid: child.pid ?? null,
    });

    child.stdout.on("data", (chunk) => {
      stdout = appendBounded(stdout, chunk);
      stdoutRelay.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = appendBounded(stderr, chunk);
      stderrRelay.write(chunk);
    });
    child.once("error", (cause) => {
      stdoutRelay.flush();
      stderrRelay.flush();
      if (settled) return;
      settled = true;
      taxonomyIndexLogger.error("admin.reference_taxonomy.sync.child.failed", {
        syncRunId,
        durationMs: Date.now() - startedAt,
        cause,
      });
      reject(new Error("Reference taxonomy synchronization could not be started."));
    });
    child.once("close", (code, signal) => {
      stdoutRelay.flush();
      stderrRelay.flush();
      if (settled) return;
      settled = true;

      const durationMs = Date.now() - startedAt;
      if (code === 0) {
        taxonomyIndexLogger.info("admin.reference_taxonomy.sync.child.completed", {
          syncRunId,
          durationMs,
          exitCode: code,
        });
        resolve();
        return;
      }

      const reason = lastOutputLine(stdout, stderr);
      taxonomyIndexLogger.error("admin.reference_taxonomy.sync.child.failed", {
        syncRunId,
        durationMs,
        exitCode: code,
        signal: signal ?? null,
        reason,
      });
      reject(new Error(reason));
    });
  });
}

async function withManagementLock<T>(operation: () => Promise<T>): Promise<T> {
  const redis = createRedis();
  await ensureRedisReady(redis);
  const token = randomUUID();
  const acquired = await redis.set(
    TAXONOMY_MANAGEMENT_LOCK_KEY,
    token,
    "PX",
    TAXONOMY_MANAGEMENT_LOCK_MS,
    "NX",
  );
  if (acquired !== "OK") {
    await redis.quit().catch(() => redis.disconnect());
    throw new Error("Reference taxonomy index management is already in progress.");
  }
  try {
    return await operation();
  } finally {
    await redis
      .eval(
        'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end',
        1,
        TAXONOMY_MANAGEMENT_LOCK_KEY,
        token,
      )
      .catch(() => {});
    await redis.quit().catch(() => redis.disconnect());
  }
}

export async function syncReferenceTaxonomyIndex(): Promise<ReferenceTaxonomyIndexStatus> {
  const config = await getEmbeddingRuntimeConfiguration(
    CommerceEmbeddingPurpose.REFERENCE_TAXONOMY,
  );
  validateTaxonomyEmbeddingConfiguration(config);
  redisUrl();

  const syncRunId = randomUUID();
  const startedAt = Date.now();
  taxonomyIndexLogger.info("admin.reference_taxonomy.sync.started", {
    syncRunId,
    embeddingProvider: config.embeddingProvider,
    embeddingModel: config.embeddingModel,
    embeddingDimensions: config.embeddingDimensions,
    embeddingIndexVersion: config.embeddingIndexVersion,
  });

  try {
    return await withManagementLock(async () => {
      taxonomyIndexLogger.info("admin.reference_taxonomy.sync.lock.acquired", {
        syncRunId,
      });
      await runTaxonomySyncScript(config, syncRunId);
      const status = await getReferenceTaxonomyIndexStatus();
      taxonomyIndexLogger.info("admin.reference_taxonomy.sync.completed", {
        syncRunId,
        durationMs: Date.now() - startedAt,
        state: status.state,
        taxonomyVersion: status.index?.taxonomyVersion ?? null,
        topLevelCount: status.index?.topLevelCount ?? null,
        subcategoryCount: status.index?.subcategoryCount ?? null,
      });
      return status;
    });
  } catch (cause) {
    taxonomyIndexLogger.error("admin.reference_taxonomy.sync.failed", {
      syncRunId,
      durationMs: Date.now() - startedAt,
      cause,
    });
    throw cause;
  }
}

async function deleteAlias(redis: Redis, alias: string): Promise<void> {
  try {
    await redis.call("FT.ALIASDEL", alias);
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    if (!/Alias does not exist|Unknown alias/i.test(message)) throw error;
  }
}

async function dropIndex(redis: Redis, indexName: string): Promise<void> {
  try {
    await redis.call("FT.DROPINDEX", indexName, "DD");
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    if (!/Unknown Index name|no such index/i.test(message)) throw error;
  }
}

async function deleteOrphanDocuments(redis: Redis): Promise<void> {
  let cursor = "0";
  do {
    const reply = (await redis.scan(
      cursor,
      "MATCH",
      TAXONOMY_DOCUMENT_PATTERN,
      "COUNT",
      500,
    )) as [string, string[]];
    cursor = reply[0];
    const keys = reply[1];
    if (keys.length > 0) await redis.unlink(...keys);
  } while (cursor !== "0");
}

export async function clearReferenceTaxonomyIndex(): Promise<ReferenceTaxonomyIndexStatus> {
  redisUrl();
  return withManagementLock(async () => {
    const redis = createRedis();
    await ensureRedisReady(redis);
    try {
      await deleteAlias(redis, SHOPIFY_TAXONOMY_TOP_INDEX_ALIAS);
      await deleteAlias(redis, SHOPIFY_TAXONOMY_SUBCATEGORY_INDEX_ALIAS);
      const indexNames = normalizedIndexNames(await redis.call("FT._LIST"));
      for (const indexName of indexNames.filter(isPhysicalTaxonomyIndex)) {
        await dropIndex(redis, indexName);
      }
      await deleteOrphanDocuments(redis);
      await redis.del(SHOPIFY_TAXONOMY_METADATA_KEY);
    } finally {
      await redis.quit().catch(() => redis.disconnect());
    }
    return getReferenceTaxonomyIndexStatus();
  });
}
