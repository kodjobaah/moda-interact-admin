import type { CommerceEnvironment, Prisma } from "@prisma/client";
import { readCommerceModelBudget, type CommerceModelBudget } from "./commerce-model-policy-fields.ts";
import { readSparseCommerceBudget, type SparseCommerceBudget } from "./commerce-model-plan-policy-fields.ts";
import { CommerceModelPolicyConflict } from "./commerce-model-platform-policy.ts";
import { resolveAdminCommerceEnvironment } from "./commerce-environment.ts";

type Tx = Prisma.TransactionClient;

export type LivePlanPolicyView = {
  planId: string;
  environment: CommerceEnvironment;
  editVersion: number;
  budget: SparseCommerceBudget;
  platformBudget: CommerceModelBudget;
  effective: CommerceModelBudget;
  sources: Record<keyof CommerceModelBudget, "PRICE_PLAN" | "PLATFORM">;
};
export type LivePlanPolicyHistoryEntry = {
  id: string;
  createdAt: string;
  actor: string;
  reason: string;
  previousBudget: SparseCommerceBudget;
  nextBudget: SparseCommerceBudget;
  previousEditVersion: number;
  nextEditVersion: number;
};

function planPolicyId(environment: CommerceEnvironment, planId: string) {
  // A stable audit identity survives deleting and recreating the sparse override.
  return `arch038-live-plan-${environment.toLowerCase()}-${planId}`;
}

export async function loadLivePlanPolicyDashboard(
  client: Pick<Tx, "commerceModelPolicy" | "commerceAuditEvent" | "merchantPricingPlan">,
  environment: CommerceEnvironment,
  planId: string,
  page: number,
): Promise<{ policy: LivePlanPolicyView; history: LivePlanPolicyHistoryEntry[]; hasMore: boolean }> {
  const plan = await client.merchantPricingPlan.findUnique({ where: { id: planId }, select: { id: true } });
  if (!plan) throw new Error("Price Plan no longer exists.");
  const [platformRows, planRows] = await Promise.all([
    client.commerceModelPolicy.findMany({ where: { environment, context: "LIVE", scope: "PLATFORM" }, take: 2 }),
    client.commerceModelPolicy.findMany({ where: { environment, context: "LIVE", scope: "PRICE_PLAN", merchantPricingPlanId: planId }, take: 2 }),
  ]);
  if (platformRows.length !== 1 || planRows.length > 1) {
    throw new Error("LIVE execution policy is unavailable or ambiguous. Verify the ARCH-038 migration.");
  }
  const p = platformRows[0]!;
  const platformBudget = readCommerceModelBudget(p.budget, p.budgetSchemaVersion);
  const record = planRows[0];
  const budget = record ? readSparseCommerceBudget(record.budget, record.budgetSchemaVersion) : {};
  const effective = { ...platformBudget, ...budget };
  const sources: LivePlanPolicyView["sources"] = {
    deadlineMs: Object.hasOwn(budget, "deadlineMs") ? "PRICE_PLAN" : "PLATFORM",
    outputTokens: Object.hasOwn(budget, "outputTokens") ? "PRICE_PLAN" : "PLATFORM",
  };
  const id = planPolicyId(environment, planId);
  const audit = await client.commerceAuditEvent.findMany({
    where: { modelPolicyId: id, environment, action: "SET_LIVE_PLAN_BUDGET_OVERRIDE", actorType: "PLATFORM_ADMIN" },
    select: {
      id: true, createdAt: true, reason: true, metadata: true, actorAdminId: true,
      actor: { select: { email: true, displayName: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: page * 10, take: 11,
  });
  const history = audit.slice(0, 10).map((event) => {
    const m = event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)
      ? event.metadata as Record<string, unknown> : {};
    // Read audit budgets defensively; an empty object represents no override.
    function auditBudget(value: unknown): SparseCommerceBudget {
      if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) return {};
      try { return readSparseCommerceBudget(value, 1); } catch { return {}; }
    }
    return {
      id: event.id,
      createdAt: event.createdAt.toISOString(),
      actor: event.actor?.displayName || event.actor?.email || event.actorAdminId || "Unknown administrator",
      reason: event.reason,
      previousBudget: auditBudget(m.previousBudget),
      nextBudget: auditBudget(m.nextBudget),
      previousEditVersion: typeof m.previousEditVersion === "number" ? m.previousEditVersion : 0,
      nextEditVersion: typeof m.nextEditVersion === "number" ? m.nextEditVersion : 0,
    };
  });
  return {
    policy: { planId, environment, editVersion: record?.editVersion ?? 0, budget, platformBudget, effective, sources },
    history, hasMore: audit.length > 10,
  };
}

export async function mutateLivePlanPolicy(
  transaction: Tx,
  input: { planId: string; budget: SparseCommerceBudget; expectedEditVersion: number; reason: string },
  environment: CommerceEnvironment,
  actorAdminId: string,
): Promise<void> {
  const plan = await transaction.merchantPricingPlan.findUnique({ where: { id: input.planId }, select: { id: true } });
  if (!plan) throw new Error("Price Plan no longer exists.");
  const existing = await transaction.commerceModelPolicy.findMany({
    where: { environment, context: "LIVE", scope: "PRICE_PLAN", merchantPricingPlanId: input.planId }, take: 2,
  });
  if (existing.length > 1) throw new Error("Ambiguous Price Plan execution policy.");
  const old = existing[0];
  const oldBudget = old ? readSparseCommerceBudget(old.budget, old.budgetSchemaVersion) : {};
  const oldVersion = old?.editVersion ?? 0;
  if (oldVersion !== input.expectedEditVersion) throw new CommerceModelPolicyConflict();
  const budget = input.budget;
  if (JSON.stringify(oldBudget) === JSON.stringify(budget)) throw new Error("No CommerceAgent Price Plan settings have changed.");
  const id = planPolicyId(environment, input.planId);
  if (!Object.keys(budget).length) {
    if (!old) throw new Error("No CommerceAgent Price Plan settings have changed.");
    const deleted = await transaction.commerceModelPolicy.deleteMany({
      where: { id: old.id, environment, context: "LIVE", scope: "PRICE_PLAN", merchantPricingPlanId: input.planId, editVersion: oldVersion },
    });
    if (deleted.count !== 1) throw new CommerceModelPolicyConflict();
  } else if (old) {
    const updated = await transaction.commerceModelPolicy.updateMany({
      where: { id: old.id, environment, context: "LIVE", scope: "PRICE_PLAN", merchantPricingPlanId: input.planId, editVersion: oldVersion },
      data: { budget, editVersion: { increment: 1 }, updatedByAdminId: actorAdminId },
    });
    if (updated.count !== 1) throw new CommerceModelPolicyConflict();
  } else {
    await transaction.commerceModelPolicy.create({ data: {
      id, environment, context: "LIVE", scope: "PRICE_PLAN", merchantPricingPlanId: input.planId,
      budget, budgetSchemaVersion: 1, createdByAdminId: actorAdminId, updatedByAdminId: actorAdminId,
    } });
  }
  await transaction.commerceAuditEvent.create({ data: {
    action: "SET_LIVE_PLAN_BUDGET_OVERRIDE", actorType: "PLATFORM_ADMIN", actorAdminId,
    modelPolicyId: id, environment, reason: input.reason,
    metadata: {
      context: "LIVE", scope: "PRICE_PLAN", planId: input.planId,
      previousBudget: oldBudget, nextBudget: budget,
      previousEditVersion: oldVersion,
      nextEditVersion: Object.keys(budget).length ? oldVersion + 1 : 0,
      operation: !Object.keys(budget).length ? "CLEAR" : old ? "SET" : "CREATE",
    },
  } });
}

export async function getLivePlanPolicyDashboard(planId: string, page: number) {
  const [{ requirePlatformAdminRead }, { prisma }] = await Promise.all([
    import("@/lib/auth/platform-admin"), import("@/lib/prisma"),
  ]);
  await requirePlatformAdminRead();
  return loadLivePlanPolicyDashboard(prisma, resolveAdminCommerceEnvironment(), planId, page);
}
