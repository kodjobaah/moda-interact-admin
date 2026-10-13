import type { Prisma, CommerceEnvironment } from "@prisma/client";
import { resolveAdminCommerceEnvironment } from "./commerce-environment.ts";
import { canEditLiveCommerceBudget, readCommerceModelBudget, type CommerceModelBudget } from "./commerce-model-policy-fields.ts";

type Tx = Prisma.TransactionClient;

export class CommerceModelPolicyConflict extends Error {
  constructor(message = "CommerceAgent execution policy changed. Reload the page and retry.") {
    super(message);
    this.name = "CommerceModelPolicyConflict";
  }
}

export type LivePlatformPolicyView = {
  id: string;
  environment: CommerceEnvironment;
  budget: CommerceModelBudget;
  budgetSchemaVersion: number;
  editVersion: number;
  updatedAt: string;
};

export function projectLivePlatformPolicy(row: {
  id: string;
  environment: CommerceEnvironment;
  context: string;
  scope: string;
  budget: unknown;
  budgetSchemaVersion: number;
  editVersion: number;
  updatedAt: Date;
}): LivePlatformPolicyView {
  if (row.context !== "LIVE" || row.scope !== "PLATFORM") {
    throw new Error("Incorrect CommerceAgent policy scope.");
  }
  return {
    id: row.id,
    environment: row.environment,
    budget: readCommerceModelBudget(row.budget, row.budgetSchemaVersion),
    budgetSchemaVersion: row.budgetSchemaVersion,
    editVersion: row.editVersion,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function updateLivePlatformPolicy(
  transaction: Tx,
  input: { budget: CommerceModelBudget; expectedEditVersion: number; reason: string },
  environment: CommerceEnvironment,
  actorAdminId: string,
): Promise<void> {
  const rows = await transaction.commerceModelPolicy.findMany({
    where: { environment, context: "LIVE", scope: "PLATFORM" },
    take: 2,
  });
  if (rows.length !== 1) {
    throw new Error("Required LIVE Platform policy is unavailable. Verify the ARCH-038 migration.");
  }
  const previous = projectLivePlatformPolicy(rows[0]!);
  if (previous.editVersion !== input.expectedEditVersion) throw new CommerceModelPolicyConflict();
  if (previous.budget.deadlineMs === input.budget.deadlineMs && previous.budget.outputTokens === input.budget.outputTokens) {
    throw new Error("No CommerceAgent policy values have changed.");
  }
  const updated = await transaction.commerceModelPolicy.updateMany({
    where: {
      id: previous.id,
      environment,
      context: "LIVE",
      scope: "PLATFORM",
      editVersion: input.expectedEditVersion,
    },
    data: {
      budget: input.budget,
      editVersion: { increment: 1 },
      updatedByAdminId: actorAdminId,
    },
  });
  if (updated.count !== 1) throw new CommerceModelPolicyConflict();
  // The DB constraint requires actor, context/scope, both budgets and versions.
  // The outer serializable transaction commits the policy change and audit atomically.
  await transaction.commerceAuditEvent.create({
    data: {
      action: "SET_LIVE_PLATFORM_BUDGET",
      actorType: "PLATFORM_ADMIN",
      actorAdminId,
      modelPolicyId: previous.id,
      environment,
      reason: input.reason,
      metadata: {
        context: "LIVE",
        scope: "PLATFORM",
        previousBudget: previous.budget,
        nextBudget: input.budget,
        previousEditVersion: previous.editVersion,
        nextEditVersion: previous.editVersion + 1,
      },
    },
  });
}

export type LivePlatformPolicyHistoryEntry = {
  id: string;
  createdAt: string;
  actor: string;
  reason: string;
  previousBudget: CommerceModelBudget | null;
  nextBudget: CommerceModelBudget | null;
  previousEditVersion: number | null;
  nextEditVersion: number | null;
};

function auditBudget(value: unknown): CommerceModelBudget | null {
  try { return readCommerceModelBudget(value, 1); } catch { return null; }
}

export async function loadLivePlatformPolicyDashboard(
  client: Pick<Tx, "commerceModelPolicy" | "commerceAuditEvent">,
  environment: CommerceEnvironment,
  page: number,
): Promise<{
  policy: LivePlatformPolicyView | null;
  history: LivePlatformPolicyHistoryEntry[];
  hasMore: boolean;
}> {
  const rows = await client.commerceModelPolicy.findMany({
    where: { environment, context: "LIVE", scope: "PLATFORM" },
    take: 2,
  });
  if (rows.length !== 1) return { policy: null, history: [], hasMore: false };
  const policy = projectLivePlatformPolicy(rows[0]!);
  const records = await client.commerceAuditEvent.findMany({
    where: {
      modelPolicyId: policy.id,
      environment,
      action: "SET_LIVE_PLATFORM_BUDGET",
      actorType: "PLATFORM_ADMIN",
    },
    select: {
      id: true,
      reason: true,
      createdAt: true,
      metadata: true,
      actorAdminId: true,
      actor: { select: { email: true, displayName: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: page * 10,
    take: 11,
  });
  const history = records.slice(0, 10).map((record) => {
    const metadata = (record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata))
      ? (record.metadata as Record<string, unknown>) : {};
    return {
      id: record.id,
      createdAt: record.createdAt.toISOString(),
      actor: record.actor?.displayName || record.actor?.email || record.actorAdminId || "Unknown administrator",
      reason: record.reason,
      previousBudget: auditBudget(metadata.previousBudget),
      nextBudget: auditBudget(metadata.nextBudget),
      previousEditVersion: typeof metadata.previousEditVersion === "number" ? metadata.previousEditVersion : null,
      nextEditVersion: typeof metadata.nextEditVersion === "number" ? metadata.nextEditVersion : null,
    };
  });
  return { policy, history, hasMore: records.length > 10 };
}

/** Environment is always determined from the trusted server deployment. */
export async function getLivePlatformPolicyDashboard(page: number) {
  const [{ requirePlatformAdminRead, PlatformAdminUnauthorizedError }, { prisma }] = await Promise.all([
    import("@/lib/auth/platform-admin"),
    import("@/lib/prisma"),
  ]);
  const principal = await requirePlatformAdminRead();
  if (!canEditLiveCommerceBudget(principal.role)) throw new PlatformAdminUnauthorizedError();
  return loadLivePlatformPolicyDashboard(prisma, resolveAdminCommerceEnvironment(), page);
}
