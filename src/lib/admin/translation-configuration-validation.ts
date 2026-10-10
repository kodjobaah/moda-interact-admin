import {
  CommerceProviderModelIdSchema,
} from "@modainteract/moda-interact-shared/commerce/model";

export const TRANSLATION_PROVIDER = "openai" as const;

export type TranslationProviderCredentialMutationInput = {
  operationId: string;
  reason: string;
  secret?: string;
  expectedEditVersion?: number;
};

export type TranslationModelConfigurationMutationInput = {
  id?: string;
  displayName: string;
  providerModelId: string;
  operationId: string;
  reason: string;
  expectedEditVersion?: number;
};

export type TranslationModelEnabledMutationInput = {
  id: string;
  enabled: boolean;
  operationId: string;
  reason: string;
  expectedEditVersion: number;
};

export type TranslationModelAutomaticDefaultMutationInput = {
  id: string;
  operationId: string;
  reason: string;
  expectedEditVersion: number;
};

function boundedTrimmed(
  value: unknown,
  name: string,
  maximum: number,
  allowNewlines = false,
): string {
  if (typeof value !== "string") throw new Error(`${name} is invalid.`);
  const trimmed = value.trim();
  const invalidControl = allowNewlines ? /\0/.test(trimmed) : /[\r\n\0]/.test(trimmed);
  if (!trimmed || trimmed.length > maximum || invalidControl) {
    throw new Error(`${name} is invalid.`);
  }
  return trimmed;
}

function positiveVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new Error("expectedEditVersion is invalid.");
  }
  return value as number;
}

export function validateTranslationCredentialSecret(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Translation provider credential is invalid.");
  }
  const byteLength = Buffer.byteLength(value, "utf8");
  if (byteLength < 1 || byteLength > 8192 || /[\r\n\0]/.test(value)) {
    throw new Error("Translation provider credential is invalid.");
  }
  return value;
}

export function validateTranslationProviderCredentialMutation(input: {
  operationId: unknown;
  reason: unknown;
  secret?: unknown;
  expectedEditVersion?: unknown;
}): TranslationProviderCredentialMutationInput {
  return {
    operationId: boundedTrimmed(input.operationId, "operationId", 128),
    reason: boundedTrimmed(input.reason, "reason", 1000, true),
    ...(input.secret === undefined
      ? {}
      : { secret: validateTranslationCredentialSecret(input.secret) }),
    ...(input.expectedEditVersion === undefined
      ? {}
      : { expectedEditVersion: positiveVersion(input.expectedEditVersion) }),
  };
}

export function validateTranslationModelConfigurationMutation(input: {
  id?: unknown;
  displayName: unknown;
  providerModelId: unknown;
  operationId: unknown;
  reason: unknown;
  expectedEditVersion?: unknown;
}): TranslationModelConfigurationMutationInput {
  const providerModelIdRaw = boundedTrimmed(
    input.providerModelId,
    "providerModelId",
    255,
  );
  const providerModelId = CommerceProviderModelIdSchema.safeParse(
    providerModelIdRaw,
  );
  if (!providerModelId.success) {
    throw new Error("providerModelId is invalid.");
  }
  return {
    ...(input.id === undefined
      ? {}
      : { id: boundedTrimmed(input.id, "id", 128) }),
    displayName: boundedTrimmed(input.displayName, "displayName", 255),
    providerModelId: providerModelId.data,
    operationId: boundedTrimmed(input.operationId, "operationId", 128),
    reason: boundedTrimmed(input.reason, "reason", 1000, true),
    ...(input.expectedEditVersion === undefined
      ? {}
      : { expectedEditVersion: positiveVersion(input.expectedEditVersion) }),
  };
}

export function validateTranslationModelEnabledMutation(input: {
  id: unknown;
  enabled: unknown;
  operationId: unknown;
  reason: unknown;
  expectedEditVersion: unknown;
}): TranslationModelEnabledMutationInput {
  if (typeof input.enabled !== "boolean") {
    throw new Error("enabled is invalid.");
  }
  return {
    id: boundedTrimmed(input.id, "id", 128),
    enabled: input.enabled,
    operationId: boundedTrimmed(input.operationId, "operationId", 128),
    reason: boundedTrimmed(input.reason, "reason", 1000, true),
    expectedEditVersion: positiveVersion(input.expectedEditVersion),
  };
}

export function validateTranslationModelAutomaticDefaultMutation(input: {
  id: unknown;
  operationId: unknown;
  reason: unknown;
  expectedEditVersion: unknown;
}): TranslationModelAutomaticDefaultMutationInput {
  return {
    id: boundedTrimmed(input.id, "id", 128),
    operationId: boundedTrimmed(input.operationId, "operationId", 128),
    reason: boundedTrimmed(input.reason, "reason", 1000, true),
    expectedEditVersion: positiveVersion(input.expectedEditVersion),
  };
}
