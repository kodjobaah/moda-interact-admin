const invalidSecretMessage = "OpenRouter credential is invalid.";

export type OpenRouterCredentialInput = {
  operationId: string;
  reason: string;
  secret?: string;
  expectedEditVersion?: number;
};

function invalidSecret(): never {
  throw new Error(invalidSecretMessage);
}

export function validateOpenRouterCredentialSecret(value: unknown): string {
  if (typeof value !== "string") return invalidSecret();
  const byteLength = Buffer.byteLength(value, "utf8");
  if (byteLength < 1 || byteLength > 8192 || /[\r\n\0]/.test(value)) {
    return invalidSecret();
  }
  return value;
}

function requiredTrimmedString(
  value: unknown,
  field: "operationId" | "reason",
  maximum: number,
): string {
  if (typeof value !== "string") {
    throw new Error(`${field} is invalid.`);
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maximum) {
    throw new Error(`${field} is invalid.`);
  }
  return trimmed;
}

export function validateOpenRouterCredentialMutation(input: {
  operationId: unknown;
  reason: unknown;
  expectedEditVersion?: unknown;
  secret?: unknown;
}): OpenRouterCredentialInput {
  const operationId = requiredTrimmedString(
    input.operationId,
    "operationId",
    128,
  );
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
    operationId,
    reason,
    ...(input.secret === undefined
      ? {}
      : { secret: validateOpenRouterCredentialSecret(input.secret) }),
    ...(expectedEditVersion === undefined
      ? {}
      : { expectedEditVersion: expectedEditVersion as number }),
  };
}
