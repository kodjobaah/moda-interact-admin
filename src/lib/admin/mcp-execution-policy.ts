import { Prisma, type CommerceEnvironment } from "@prisma/client";

/** Persisted JSONB contract; no runtime fallback values belong in Admin. */
export const MCP_ENVIRONMENTS = [
  "LOCAL", "TEST", "DEVELOPMENT", "STAGING", "PRODUCTION",
] as const satisfies readonly CommerceEnvironment[];

export type McpEnvironment = (typeof MCP_ENVIRONMENTS)[number];
export type McpExecutionLimits = {
  toolDeadlineMs: number;
  providerResponseTimeoutMs: number;
  maxProviderRequests: number;
  maxResponseBytes: number;
};
export type McpExecutionPolicyDocument = {
  schemaVersion: 1;
  environments: Partial<Record<McpEnvironment, McpExecutionLimits>>;
};
export type McpPolicyOperation = "save" | "clear";
export type McpPolicyEdit = {
  environment: McpEnvironment;
  operation: McpPolicyOperation;
  expectedVersion: number;
  reason: string;
  limits: McpExecutionLimits | null;
};

export class McpPolicyConflict extends Error {
  constructor() {
    super("Platform policy changed. Reload the page before saving again.");
    this.name = "McpPolicyConflict";
  }
}

const CAPS: McpExecutionLimits = {
  toolDeadlineMs: 600_000,
  providerResponseTimeoutMs: 600_000,
  maxProviderRequests: 1_000,
  maxResponseBytes: 16_777_216,
};
const FIELD_LABELS: Record<keyof McpExecutionLimits, string> = {
  toolDeadlineMs: "Tool deadline (ms)",
  providerResponseTimeoutMs: "Provider response timeout (ms)",
  maxProviderRequests: "Maximum provider requests",
  maxResponseBytes: "Maximum response bytes",
};
const LIMIT_KEYS = Object.keys(FIELD_LABELS) as (keyof McpExecutionLimits)[];

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function positiveBounded(value: unknown, field: keyof McpExecutionLimits): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > CAPS[field]) {
    throw new Error(`${FIELD_LABELS[field]} must be a whole number between 1 and ${CAPS[field]}.`);
  }
  return value;
}
function readLimits(value: unknown): McpExecutionLimits {
  const data = object(value);
  if (!data || Object.keys(data).some((key) => !LIMIT_KEYS.includes(key as keyof McpExecutionLimits))) {
    throw new Error("MCP execution policy contains an invalid environment entry.");
  }
  const limits = {
    toolDeadlineMs: positiveBounded(data.toolDeadlineMs, "toolDeadlineMs"),
    providerResponseTimeoutMs: positiveBounded(data.providerResponseTimeoutMs, "providerResponseTimeoutMs"),
    maxProviderRequests: positiveBounded(data.maxProviderRequests, "maxProviderRequests"),
    maxResponseBytes: positiveBounded(data.maxResponseBytes, "maxResponseBytes"),
  };
  if (limits.providerResponseTimeoutMs > limits.toolDeadlineMs) {
    throw new Error("Provider response timeout must not exceed the total tool deadline.");
  }
  return limits;
}

/** Reject corrupt or unknown-version JSON; never silently discard other environments. */
export function readMcpExecutionPolicy(value: unknown): McpExecutionPolicyDocument {
  if (value === null || value === undefined) return { schemaVersion: 1, environments: {} };
  const root = object(value);
  if (!root || root.schemaVersion !== 1 || Object.keys(root).some((key) => key !== "schemaVersion" && key !== "environments")) {
    throw new Error("Unsupported MCP execution policy JSON schema. Repair the stored policy before editing.");
  }
  const entries = object(root.environments);
  if (!entries) throw new Error("MCP execution policy environments must be an object.");
  const environments: McpExecutionPolicyDocument["environments"] = {};
  for (const [key, entry] of Object.entries(entries)) {
    if (!MCP_ENVIRONMENTS.includes(key as McpEnvironment)) {
      throw new Error("MCP execution policy contains an unknown environment.");
    }
    environments[key as McpEnvironment] = readLimits(entry);
  }
  return { schemaVersion: 1, environments };
}

function requiredInteger(form: FormData, field: keyof McpExecutionLimits): number {
  const raw = form.get(field);
  if (typeof raw !== "string" || !/^[0-9]+$/.test(raw.trim())) {
    throw new Error(`${FIELD_LABELS[field]} must be a whole number.`);
  }
  return positiveBounded(Number(raw.trim()), field);
}
export function parseMcpPolicyEdit(form: FormData): McpPolicyEdit {
  const environment = form.get("environment");
  if (typeof environment !== "string" || !MCP_ENVIRONMENTS.includes(environment as McpEnvironment)) {
    throw new Error("Choose a valid Commerce environment.");
  }
  const operation = form.get("operation");
  if (operation !== "save" && operation !== "clear") throw new Error("Invalid policy operation.");
  const rawVersion = form.get("expectedVersion");
  if (typeof rawVersion !== "string" || !/^(0|[1-9][0-9]*)$/.test(rawVersion) || !Number.isSafeInteger(Number(rawVersion))) {
    throw new Error("Invalid policy version. Reload the page.");
  }
  const reason = form.get("reason");
  if (typeof reason !== "string" || !reason.trim() || reason.trim().length > 1000) {
    throw new Error("An audit reason between 1 and 1000 characters is required.");
  }
  const limits = operation === "save" ? readLimits(Object.fromEntries(
    LIMIT_KEYS.map((key) => [key, requiredInteger(form, key)]),
  )) : null;
  return {
    environment: environment as McpEnvironment,
    operation,
    expectedVersion: Number(rawVersion),
    reason: reason.trim(),
    limits,
  };
}

/** One row, one monotonic CAS token shared by billing and all MCP environments. */
export async function updateMcpPolicy(
  transaction: Prisma.TransactionClient,
  edit: McpPolicyEdit,
  actorId: string,
): Promise<void> {
  const previous = await transaction.platformBillingPolicy.findUnique({ where: { id: "default" } });
  if (!previous) throw new Error("Platform Billing Policy is missing. Apply the platform policy migration.");
  if (previous.version !== edit.expectedVersion) throw new McpPolicyConflict();

  const policy = readMcpExecutionPolicy(previous.mcpExecutionPolicy);
  const before = policy.environments[edit.environment] ?? null;
  if (edit.operation === "clear") {
    if (!before) throw new Error("This environment is already unconfigured.");
    delete policy.environments[edit.environment];
  } else {
    policy.environments[edit.environment] = edit.limits!;
  }
  const next = Object.keys(policy.environments).length === 0 ? Prisma.DbNull : policy;
  const changed = await transaction.platformBillingPolicy.updateMany({
    where: { id: "default", version: edit.expectedVersion },
    data: {
      mcpExecutionPolicy: next as Prisma.InputJsonValue | typeof Prisma.DbNull,
      version: { increment: 1 },
    },
  });
  if (changed.count !== 1) throw new McpPolicyConflict();

  await transaction.billingAuditEvent.create({
    data: {
      action: "PLATFORM_POLICY_CHANGED",
      platformAdminId: actorId,
      reason: edit.reason,
      relatedEntityType: "PlatformBillingPolicy",
      relatedEntityId: "default",
      beforeValue: {
        scope: "MCP_EXECUTION", environment: edit.environment,
        operation: edit.operation, version: edit.expectedVersion,
        limits: before,
      } as Prisma.InputJsonValue,
      afterValue: {
        scope: "MCP_EXECUTION", environment: edit.environment,
        operation: edit.operation, version: edit.expectedVersion + 1,
        limits: policy.environments[edit.environment] ?? null,
      } as Prisma.InputJsonValue,
    },
  });
}
