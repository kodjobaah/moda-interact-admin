import { CommerceEmbeddingPurpose } from "@prisma/client";

const PURPOSES = new Set<CommerceEmbeddingPurpose>([
  CommerceEmbeddingPurpose.MERCHANT_KNOWLEDGE,
  CommerceEmbeddingPurpose.REFERENCE_TAXONOMY,
]);

export type EmbeddingConfigurationInput = {
  purpose: CommerceEmbeddingPurpose;
  embeddingProvider: string;
  embeddingModel: string;
  embeddingDimensions: number;
  embeddingIndexVersion: string;
  operationId: string;
  reason: string;
  expectedEditVersion?: number;
  secret?: string;
};

function requiredTrimmedString(
  value: unknown,
  field: string,
  maximum: number,
): string {
  if (typeof value !== "string") throw new Error(`${field} is invalid.`);
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maximum) {
    throw new Error(`${field} is invalid.`);
  }
  return trimmed;
}

export function validateEmbeddingPurpose(
  value: unknown,
): CommerceEmbeddingPurpose {
  if (typeof value !== "string" || !PURPOSES.has(value as CommerceEmbeddingPurpose)) {
    throw new Error("purpose is invalid.");
  }
  return value as CommerceEmbeddingPurpose;
}

export function validateEmbeddingCredentialSecret(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Embedding credential is invalid.");
  }
  const byteLength = Buffer.byteLength(value, "utf8");
  if (byteLength < 1 || byteLength > 8192 || /[\r\n\0]/.test(value)) {
    throw new Error("Embedding credential is invalid.");
  }
  return value;
}

export function validateEmbeddingConfigurationMutation(input: {
  purpose: unknown;
  embeddingProvider: unknown;
  embeddingModel: unknown;
  embeddingDimensions: unknown;
  embeddingIndexVersion: unknown;
  operationId: unknown;
  reason: unknown;
  expectedEditVersion?: unknown;
  secret?: unknown;
}): EmbeddingConfigurationInput {
  const purpose = validateEmbeddingPurpose(input.purpose);
  const embeddingProvider = requiredTrimmedString(
    input.embeddingProvider,
    "embeddingProvider",
    64,
  ).toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(embeddingProvider)) {
    throw new Error("embeddingProvider is invalid.");
  }

  const embeddingModel = requiredTrimmedString(
    input.embeddingModel,
    "embeddingModel",
    255,
  );
  const embeddingIndexVersion = requiredTrimmedString(
    input.embeddingIndexVersion,
    "embeddingIndexVersion",
    64,
  );
  const embeddingDimensions = input.embeddingDimensions;
  if (
    !Number.isSafeInteger(embeddingDimensions) ||
    (embeddingDimensions as number) < 1 ||
    (embeddingDimensions as number) > 65535
  ) {
    throw new Error("embeddingDimensions is invalid.");
  }

  const operationId = requiredTrimmedString(input.operationId, "operationId", 128);
  const reason = requiredTrimmedString(input.reason, "reason", 1000);
  const expectedEditVersion = input.expectedEditVersion;
  if (
    expectedEditVersion !== undefined &&
    (!Number.isSafeInteger(expectedEditVersion) ||
      (expectedEditVersion as number) < 1)
  ) {
    throw new Error("expectedEditVersion is invalid.");
  }

  return {
    purpose,
    embeddingProvider,
    embeddingModel,
    embeddingDimensions: embeddingDimensions as number,
    embeddingIndexVersion,
    operationId,
    reason,
    ...(expectedEditVersion === undefined
      ? {}
      : { expectedEditVersion: expectedEditVersion as number }),
    ...(input.secret === undefined
      ? {}
      : { secret: validateEmbeddingCredentialSecret(input.secret) }),
  };
}
export function validateEmbeddingConfigurationRemoval(input: {
  purpose: unknown;
  operationId: unknown;
  reason: unknown;
  expectedEditVersion: unknown;
}): {
  purpose: CommerceEmbeddingPurpose;
  operationId: string;
  reason: string;
  expectedEditVersion: number;
} {
  const purpose = validateEmbeddingPurpose(input.purpose);
  const operationId = requiredTrimmedString(input.operationId, "operationId", 128);
  const reason = requiredTrimmedString(input.reason, "reason", 1000);
  if (
    !Number.isSafeInteger(input.expectedEditVersion) ||
    (input.expectedEditVersion as number) < 1
  ) {
    throw new Error("expectedEditVersion is invalid.");
  }
  return {
    purpose,
    operationId,
    reason,
    expectedEditVersion: input.expectedEditVersion as number,
  };
}
