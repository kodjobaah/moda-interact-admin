/** Authenticated sealed configuration service. Plaintext only leaves on an explicit, authorised field reveal. */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdminMutation, requirePlatformAdminRead, type PlatformAdminPrincipal } from "@/lib/auth/platform-admin";
import { getConfigurationEnvironment } from "./service";
import { type ConfigurationDatabase } from "./repository";
import { PLATFORM_SECRET_CONTRACTS, SECRET_PURPOSES, SECRET_REASONS } from "./secrets-contracts";
import { logAdminSecurityEvent } from "@/lib/auth/audit";
import { validateSecretPayload } from "./secret-validation";
import { DISABLED_SECRET, loadConfigUnsealKeyring, parseStoredSecret, sealSecret, unsealSecret, type UnsealKeyring } from "./seal";
import { ConfigurationError } from "./errors";
import { canManagePlatformSecrets } from "./secret-access";

export type SecretOperation = "set" | "update" | "rotate" | "revoke";
const CURSOR = /^[a-zA-Z0-9_-]{1,128}$/;
const VALID_ENVS = new Set(["local", "test", "development", "staging", "production"]);
const REDACTED_TRUE = { redacted: true, configured: true };
const REDACTED_FALSE = { redacted: true, configured: false };

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !keys.includes(key))) {
    throw new ConfigurationError("INVALID_INPUT", "Invalid secret configuration request.");
  }
  return value as Record<string, unknown>;
}
function keyFrom(input: unknown): string {
  if (typeof input !== "string" || !SECRET_PURPOSES.has(input)) throw new ConfigurationError("INVALID_INPUT", "Unsupported secret purpose.");
  return input;
}
function isDisabled(value: unknown): boolean {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === 2 && (value as Record<string, unknown>).kind === "disabled" &&
    (value as Record<string, unknown>).schemaVersion === 1;
}
function configured(value: unknown): boolean {
  if (isDisabled(value)) return false;
  parseStoredSecret(value); // Reject malformed stored state; never trust a JSON kind alone.
  return true;
}
function permitted(principal: { id: string; role: string; developmentBypass: boolean }): void {
  if (!canManagePlatformSecrets(principal)) {
    throw new ConfigurationError("FORBIDDEN", "SUPER_ADMIN access is required for secret management.");
  }
}
export type SecretStatus = { key: string; configured: boolean; version: number; updatedAt: string | null; updatedBy: string | null };
export type SecretAuditHistory = {
  entries: Array<{ id: string; expectedVersion: number; resultingVersion: number; actorId: string; reason: string | null; createdAt: string;
    beforeValue: { redacted: true; configured: boolean } | null; afterValue: { redacted: true; configured: boolean } }>;
  nextCursor: string | null;
};

export async function readSecretStatus(db: ConfigurationDatabase, environment: string, key: string): Promise<SecretStatus> {
  keyFrom(key);
  if (!VALID_ENVS.has(environment)) throw new ConfigurationError("INVALID_INPUT", "Invalid environment.");
  try {
    const row = await db.platformConfiguration.findUnique({ where: { environment_key: { environment, key } },
      select: { value: true, version: true, updatedAt: true, updatedBy: true } });
    return { key, configured: row ? configured(row.value) : false, version: row?.version ?? 0,
      updatedAt: row?.updatedAt.toISOString() ?? null, updatedBy: row?.updatedBy ?? null };
  } catch (cause) {
    if (cause instanceof ConfigurationError) throw cause;
    throw new ConfigurationError("DB_UNAVAILABLE", "Secret status is temporarily unavailable.");
  }
}
/** Read the audit without ever selecting historical ciphertext into browser props. */
export async function readSecretHistory(db: ConfigurationDatabase, environment: string, key: string, cursor?: string): Promise<SecretAuditHistory> {
  keyFrom(key);
  if (!VALID_ENVS.has(environment) || cursor !== undefined && !CURSOR.test(cursor)) throw new ConfigurationError("INVALID_INPUT", "Invalid secret history request.");
  try {
    if (cursor) {
      const previous = await db.platformConfigurationAudit.findUnique({ where: { id: cursor }, select: { environment: true, key: true } });
      if (!previous || previous.key !== key || previous.environment !== environment) throw new ConfigurationError("INVALID_INPUT", "Invalid history cursor.");
    }
    const rows = await db.platformConfigurationAudit.findMany({
      where: { environment, key }, take: 21, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, expectedVersion: true, resultingVersion: true, actorId: true, reason: true, createdAt: true, beforeValue: true, afterValue: true },
    });
    const visible = rows.slice(0, 20).map((row) => {
      // A corrupted historical audit must fail closed, not return unknown JSON.
      const redaction = (value: unknown) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new ConfigurationError("INVALID_INPUT", "Invalid secret audit record.");
        const record = value as Record<string, unknown>;
        if (Object.keys(record).sort().join(",") !== "configured,redacted" || record.redacted !== true || typeof record.configured !== "boolean") {
          throw new ConfigurationError("INVALID_INPUT", "Invalid secret audit record.");
        }
        return { redacted: true as const, configured: record.configured };
      };
      return { id: row.id, expectedVersion: row.expectedVersion, resultingVersion: row.resultingVersion,
        actorId: row.actorId, reason: SECRET_REASONS.includes(row.reason as typeof SECRET_REASONS[number]) ? row.reason : null,
        createdAt: row.createdAt.toISOString(), beforeValue: row.beforeValue === null ? null : redaction(row.beforeValue), afterValue: redaction(row.afterValue) };
    });
    return { entries: visible, nextCursor: rows.length > 20 ? visible[visible.length - 1]?.id ?? null : null };
  } catch (cause) {
    if (cause instanceof ConfigurationError) throw cause;
    throw new ConfigurationError("DB_UNAVAILABLE", "Secret history is temporarily unavailable.");
  }
}

/** Read exactly one field, only after an explicit request from a verified operator.
 * This is an access audit, not a configuration revision; the revision-only SQL
 * audit table cannot represent a read without changing its schema.
 */
export async function revealSecretFieldWithDependencies(input: unknown, deps: {
  principal: { id: string; role: string; developmentBypass: boolean };
  environment: string; db: ConfigurationDatabase; wrapping: UnsealKeyring;
  recordReveal?: (detail: { actorId: string; environment: string; key: string; field: string; version: number }) => void;
}): Promise<{ field: string; value: string | number; version: number }> {
  permitted(deps.principal);
  if (!VALID_ENVS.has(deps.environment)) throw new ConfigurationError("INVALID_INPUT", "Invalid environment.");
  const request = object(input, ["key", "field", "expectedVersion"]);
  const key = keyFrom(request.key);
  const field = request.field;
  const contract = PLATFORM_SECRET_CONTRACTS.find((entry) => entry.key === key);
  if (typeof field !== "string" || !contract?.fields.some((candidate) => candidate.name === field)) {
    throw new ConfigurationError("INVALID_INPUT", "Unsupported configuration field.");
  }
  const expectedVersion = request.expectedVersion;
  if (typeof expectedVersion !== "number" || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    throw new ConfigurationError("INVALID_INPUT", "Invalid configuration revision.");
  }
  let row;
  try {
    row = await deps.db.platformConfiguration.findUnique({
      where: { environment_key: { environment: deps.environment, key } },
      select: { value: true, version: true },
    });
  } catch { throw new ConfigurationError("DB_UNAVAILABLE", "Saved credentials are temporarily unavailable."); }
  if (!row || !configured(row.value)) throw new ConfigurationError("INVALID_INPUT", "No active credentials are configured.");
  if (row.version !== expectedVersion) throw new ConfigurationError("CONFLICT", "Credentials changed. Refresh before revealing.");
  const plaintext = unsealSecret({ environment: deps.environment, key, version: row.version, value: row.value, wrapping: deps.wrapping });
  let decoded: unknown;
  try { decoded = JSON.parse(plaintext); } catch { throw new ConfigurationError("INVALID_INPUT", "Saved credentials are invalid."); }
  const validated = validateSecretPayload(key, decoded);
  const value = validated[field];
  if (typeof value !== "string" && typeof value !== "number") {
    throw new ConfigurationError("INVALID_INPUT", "This field has no saved value.");
  }
  const detail = { actorId: deps.principal.id, environment: deps.environment, key, field, version: row.version };
  if (deps.recordReveal) deps.recordReveal(detail);
  else logAdminSecurityEvent("admin.platform_configuration.secret_revealed", {
    adminId: detail.actorId, role: deps.principal.role, action: "reveal", resourceType: "platform_configuration",
    resourceId: `${detail.environment}:${detail.key}:${detail.field}:v${detail.version}`,
    outcome: "succeeded", developmentBypass: deps.principal.developmentBypass,
  });
  return { field, value, version: row.version };
}

export async function mutateSecretWithDependencies(input: unknown, deps: {
  principal: { id: string; role: string; developmentBypass: boolean };
  environment: string; db: ConfigurationDatabase; wrapping: UnsealKeyring;
}): Promise<{ key: string; version: number }> {
  permitted(deps.principal);
  if (!VALID_ENVS.has(deps.environment)) throw new ConfigurationError("INVALID_INPUT", "Invalid environment.");
  const data = object(input, ["key", "operation", "expectedVersion", "values", "reason", "confirmation"]);
  const key = keyFrom(data.key);
  const operation = data.operation;
  if (operation !== "set" && operation !== "update" && operation !== "rotate" && operation !== "revoke") {
    throw new ConfigurationError("INVALID_INPUT", "Invalid secret operation.");
  }
  const expectedVersion = data.expectedVersion;
  if (typeof expectedVersion !== "number" || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || expectedVersion >= 2147483647) {
    throw new ConfigurationError("INVALID_INPUT", "Invalid configuration revision.");
  }
  const reason = operation === "set" ? "initial-setup" : operation === "update" ? "configuration-update" : data.reason;
  if (operation === "rotate" && !["scheduled-rotation", "credential-compromise"].includes(reason as string) ||
      operation === "revoke" && !["decommission", "credential-compromise"].includes(reason as string) ||
      (operation === "rotate" || operation === "revoke") && data.confirmation !== operation.toUpperCase() ||
      (operation === "set" || operation === "update") && (data.reason !== undefined || data.confirmation !== undefined)) {
    throw new ConfigurationError("INVALID_INPUT", "Invalid confirmation or audit reason for this operation.");
  }
  if (operation === "revoke" && Object.hasOwn(data, "values") || operation !== "revoke" && !Object.hasOwn(data, "values")) {
    throw new ConfigurationError("INVALID_INPUT", "Invalid secret operation payload.");
  }
  const contract = PLATFORM_SECRET_CONTRACTS.find((entry) => entry.key === key)!;
  const changes = data.values;
  if (operation !== "revoke") {
    if (!changes || typeof changes !== "object" || Array.isArray(changes) ||
        Object.keys(changes).length === 0 ||
        Object.keys(changes).some((field) => !contract.fields.some((candidate) => candidate.name === field))) {
      throw new ConfigurationError("INVALID_INPUT", "Provide at least one approved field.");
    }
    const changedCredential = Object.keys(changes).some((field) =>
      contract.fields.find((candidate) => candidate.name === field)?.kind === "secret");
    if (operation === "update" && key !== "commerce.bootstrap" && changedCredential) {
      throw new ConfigurationError("INVALID_INPUT", "Credential changes require Rotate credentials.");
    }
    if (operation === "rotate" && (key === "commerce.bootstrap" || !changedCredential)) {
      throw new ConfigurationError("INVALID_INPUT", "Rotate requires changing at least one credential.");
    }
  }

  try {
    return await deps.db.$transaction(async (tx) => {
      const existing = await tx.platformConfiguration.findUnique({ where: { environment_key: { environment: deps.environment, key } } });
      if ((!existing && expectedVersion !== 0) || existing && existing.version !== expectedVersion) {
        throw new ConfigurationError("CONFLICT", "Configuration changed. Refresh before continuing.");
      }
      const before = existing ? configured(existing.value) : false;
      if (operation === "set" && before || (operation === "rotate" || operation === "update" || operation === "revoke") && !before) {
        throw new ConfigurationError("INVALID_INPUT", "Operation is not valid for current secret status.");
      }
      let plaintext: string | null = null;
      if (operation !== "revoke") {
        let merged = changes as Record<string, unknown>;
        if (operation !== "set") {
          // Decrypt the current CAS revision inside the transaction. A blank or
          // omitted input must never erase an unchanged saved credential.
          let current: unknown;
          try {
            current = JSON.parse(unsealSecret({ environment: deps.environment, key, version: existing!.version,
              value: existing!.value, wrapping: deps.wrapping }));
          } catch { throw new ConfigurationError("INVALID_INPUT", "Saved credentials are invalid."); }
          const validatedCurrent = validateSecretPayload(key, current);
          merged = { ...validatedCurrent, ...merged };
        }
        plaintext = JSON.stringify(validateSecretPayload(key, merged));
      }
      const nextVersion = expectedVersion + 1;
      const value = plaintext === null ? DISABLED_SECRET : sealSecret({ environment: deps.environment, key, version: nextVersion, plaintext, wrapping: deps.wrapping });
      if (existing) {
        const updated = await tx.platformConfiguration.updateMany({
          where: { environment: deps.environment, key, version: expectedVersion },
          data: { value: value as Prisma.InputJsonValue, version: { increment: 1 }, updatedBy: deps.principal.id },
        });
        if (updated.count !== 1) throw new ConfigurationError("CONFLICT", "Configuration changed. Refresh before continuing.");
      } else {
        await tx.platformConfiguration.create({ data: { environment: deps.environment, key, version: 1,
          value: value as Prisma.InputJsonValue, updatedBy: deps.principal.id } });
      }
      await tx.platformConfigurationAudit.create({ data: { environment: deps.environment, key,
        expectedVersion, resultingVersion: nextVersion, actorId: deps.principal.id, reason: reason as string,
        beforeValue: existing ? (before ? REDACTED_TRUE : REDACTED_FALSE) : Prisma.DbNull,
        afterValue: plaintext === null ? REDACTED_FALSE : REDACTED_TRUE,
      } });
      return { key, version: nextVersion };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (cause) {
    if (cause instanceof ConfigurationError) throw cause;
    if (cause instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(cause.code)) {
      throw new ConfigurationError("CONFLICT", "Configuration changed. Refresh before continuing.");
    }
    throw new ConfigurationError("DB_UNAVAILABLE", "Secret configuration could not be saved.");
  }
}

export async function secretConfigurationPageData(key: unknown, cursor?: string) {
  const principal = await requirePlatformAdminRead(); permitted(principal);
  const environment = getConfigurationEnvironment(); const secretKey = keyFrom(key);
  const [status, history] = await Promise.all([
    readSecretStatus(prisma, environment, secretKey), readSecretHistory(prisma, environment, secretKey, cursor),
  ]);
  return { contracts: PLATFORM_SECRET_CONTRACTS, status, history, environment };
}
export async function mutatePlatformSecret(input: unknown) {
  const principal: PlatformAdminPrincipal = await requirePlatformAdminMutation(); permitted(principal);
  const environment = getConfigurationEnvironment();
  return mutateSecretWithDependencies(input, { principal, environment, db: prisma, wrapping: loadConfigUnsealKeyring() });
}

/** Server action entrypoint; explicit reveal only, never a page prop. */
export async function revealPlatformSecretField(input: unknown) {
  const principal = await requirePlatformAdminRead(); permitted(principal);
  return revealSecretFieldWithDependencies(input, {
    principal, environment: getConfigurationEnvironment(), db: prisma, wrapping: loadConfigUnsealKeyring(),
  });
}
