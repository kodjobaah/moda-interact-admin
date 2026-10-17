import { Prisma, type PrismaClient } from "@prisma/client";
import type { Registry } from "./contracts";
import { ConfigurationError } from "./errors";

/** Prisma models are supplied by the accepted ARCH-043-DATABASE-001 database submodule. */
export type ConfigurationDatabase = Pick<PrismaClient, "platformConfiguration" | "platformConfigurationAudit" | "$transaction">;
export type ConfigurationSnapshot = {
  key: string; value: Record<string, unknown> | null; version: number;
  updatedAt: string | null; updatedBy: string | null; invalidStoredValue: boolean;
};
export type ConfigurationAuditEntry = {
  id: string; expectedVersion: number; resultingVersion: number;
  beforeValue: unknown; afterValue: unknown; actorId: string;
  reason: string | null; createdAt: string;
};
export type ConfigurationHistory = { entries: ConfigurationAuditEntry[]; nextCursor: string | null };

export async function readConfiguration(db: ConfigurationDatabase, environment: string, key: string, registry: Registry): Promise<ConfigurationSnapshot> {
  const contract = registry.get(key);
  if (!contract || contract.kind !== "policy") throw new ConfigurationError("INVALID_INPUT", "Unsupported policy key.");
  const row = await db.platformConfiguration.findUnique({ where: { environment_key: { environment, key } } });
  if (!row) return { key, value: null, version: 0, updatedAt: null, updatedBy: null, invalidStoredValue: false };
  const { validateConfiguration } = await import("./contracts");
  const result = validateConfiguration(contract, row.value);
  const safeRecord = row.value && typeof row.value === "object" && !Array.isArray(row.value) &&
    (row.value as Record<string, unknown>).kind !== "sealed" ? row.value as Record<string, unknown> : {};
  const safePartial = Object.fromEntries(contract.fields.flatMap((field) => {
    if (field.kind === "secret" || !Object.prototype.hasOwnProperty.call(safeRecord, field.name)) return [];
    const checked = validateConfiguration({ ...contract, fields: [field], refine: undefined }, { [field.name]: safeRecord[field.name] });
    return checked.ok ? [[field.name, checked.values[field.name]]] : [];
  }));
  return {
    key, value: result.ok ? result.values : safePartial, version: row.version,
    updatedAt: row.updatedAt.toISOString(), updatedBy: row.updatedBy,
    invalidStoredValue: !result.ok,
  };
}

export async function writeConfiguration(db: ConfigurationDatabase, input: {
  environment: string; key: string; expectedVersion: number; values: Record<string, unknown>;
  actorId: string; reason: string | null;
}): Promise<{ key: string; version: number }> {
  const { environment, key, expectedVersion, values, actorId, reason } = input;
  try {
    return await db.$transaction(async (tx) => {
      // The conditional update is the linearisation point. Reads alone never authorise a write.
      const existing = await tx.platformConfiguration.findUnique({ where: { environment_key: { environment, key } } });
      if (expectedVersion === 0) {
        if (existing) throw new ConfigurationError("CONFLICT", "Policy changed. Refresh before saving.");
        await tx.platformConfiguration.create({ data: {
          environment, key, value: values as Prisma.InputJsonValue,
          version: 1, updatedBy: actorId,
        } });
      } else {
        if (!existing || existing.version !== expectedVersion) throw new ConfigurationError("CONFLICT", "Policy changed. Refresh before saving.");
        const updated = await tx.platformConfiguration.updateMany({
          where: { environment, key, version: expectedVersion },
          data: { value: values as Prisma.InputJsonValue, version: { increment: 1 }, updatedBy: actorId },
        });
        if (updated.count !== 1) throw new ConfigurationError("CONFLICT", "Policy changed. Refresh before saving.");
      }
      const version = expectedVersion + 1;
      await tx.platformConfigurationAudit.create({ data: {
        environment, key, expectedVersion, resultingVersion: version,
        beforeValue: existing ? existing.value as Prisma.InputJsonValue : Prisma.JsonNull,
        afterValue: values as Prisma.InputJsonValue, actorId, reason,
      } });
      return { key, version };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (cause) {
    if (cause instanceof ConfigurationError) throw cause;
    if (cause instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(cause.code)) {
      throw new ConfigurationError("CONFLICT", "Policy changed. Refresh before saving.");
    }
    throw new ConfigurationError("DB_UNAVAILABLE", "Policy could not be saved. Retry later.");
  }
}

export async function readConfigurationHistory(db: ConfigurationDatabase, environment: string, key: string, cursor?: string): Promise<ConfigurationHistory> {
  if (cursor !== undefined && (!/^[a-zA-Z0-9_-]{1,128}$/.test(cursor))) throw new ConfigurationError("INVALID_INPUT", "Invalid history cursor.");
  if (cursor) {
    const previous = await db.platformConfigurationAudit.findUnique({ where: { id: cursor }, select: { key: true, environment: true } });
    if (!previous || previous.environment !== environment || previous.key !== key) throw new ConfigurationError("INVALID_INPUT", "Invalid history cursor.");
  }
  const rows = await db.platformConfigurationAudit.findMany({
    where: { environment, key }, take: 21,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, expectedVersion: true, resultingVersion: true, beforeValue: true,
      afterValue: true, actorId: true, reason: true, createdAt: true },
  });
  const entries = rows.slice(0, 20).map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  return { entries, nextCursor: rows.length > 20 ? entries[entries.length - 1]?.id ?? null : null };
}
