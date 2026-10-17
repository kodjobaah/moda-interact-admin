import type { Registry } from "./contracts";
import { validateConfiguration } from "./contracts";
import { ConfigurationError } from "./errors";
import { writeConfiguration, type ConfigurationDatabase } from "./repository";

function policy(key: unknown, registry: Registry) {
  if (typeof key !== "string") throw new ConfigurationError("INVALID_INPUT", "Unsupported policy key.");
  const contract = registry.get(key);
  if (!contract || contract.kind !== "policy" || contract.requiredRole !== "SUPER_ADMIN") {
    throw new ConfigurationError("INVALID_INPUT", "Unsupported policy key.");
  }
  return contract;
}
function onlyKeys(input: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => !allowed.includes(key))) {
    throw new ConfigurationError("INVALID_INPUT", "Invalid configuration request.");
  }
  return input as Record<string, unknown>;
}
function version(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new ConfigurationError("INVALID_INPUT", "Invalid policy revision.");
  return value;
}
function reason(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.trim().length < 1 || value.trim().length > 1000) throw new ConfigurationError("INVALID_INPUT", "Reason must be at most 1,000 characters.");
  return value.trim();
}

/** Generic mutation path; dependencies are trusted server-supplied and injectable for tests. */
export async function mutateConfigurationWithDependencies(input: unknown, operation: "save" | "reset", dependencies: {
  principal: { role: string }; environment: string; actorId: string;
  db: ConfigurationDatabase; registry: Registry;
}) {
  if (dependencies.principal.role !== "SUPER_ADMIN") throw new ConfigurationError("FORBIDDEN", "SUPER_ADMIN access is required.");
  if (!["local", "test", "development", "staging", "production"].includes(dependencies.environment)) throw new ConfigurationError("INVALID_INPUT", "Unknown deployment environment.");
  const data = onlyKeys(input, operation === "save" ? ["key", "expectedVersion", "values", "reason"] : ["key", "expectedVersion", "reason"]);
  const contract = policy(data.key, dependencies.registry);
  const expectedVersion = version(data.expectedVersion);
  const auditReason = reason(data.reason);
  if (!/^[a-zA-Z0-9_-]{1,191}$/.test(dependencies.actorId)) throw new ConfigurationError("FORBIDDEN", "Verified actor is unavailable.");
  if (operation === "reset" && (!contract.canReset || !contract.defaults)) throw new ConfigurationError("INVALID_INPUT", "This policy has no safe reset defaults.");
  const payload = operation === "reset" ? contract.defaults : data.values;
  const result = validateConfiguration(contract, payload);
  if (!result.ok) throw new ConfigurationError("INVALID_INPUT", JSON.stringify({ message: result.message, fields: result.fieldErrors }));
  return writeConfiguration(dependencies.db, {
    environment: dependencies.environment, key: contract.key, expectedVersion,
    values: result.values, actorId: dependencies.actorId, reason: auditReason,
  });
}
