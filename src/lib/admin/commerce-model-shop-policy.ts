import type { CommerceEnvironment, Prisma } from "@prisma/client";
import { COMMERCE_MODEL_BUDGET_FIELDS, readCommerceModelBudget, type CommerceModelBudget } from "./commerce-model-policy-fields.ts";
import type { SparseShopCommerceBudget } from "./commerce-model-shop-policy-fields.ts";
import { CommerceModelPolicyConflict } from "./commerce-model-platform-policy.ts";
import { resolveAdminCommerceEnvironment } from "./commerce-environment.ts";

type Tx = Prisma.TransactionClient;
type Source = "PLATFORM" | "PRICE_PLAN" | "MERCHANT";
export type CurrentShopPlan = {
  state: "RESOLVED" | "NO_CURRENT_PLAN" | "UNMATCHED_PLAN";
  message: string;
  plan: { id: string; name: string; handle: string } | null;
};
export type LiveShopPolicyView = {
  shopId: string;
  environment: CommerceEnvironment;
  editVersion: number;
  budget: SparseShopCommerceBudget;
  platformBudget: CommerceModelBudget;
  planBudget: SparseShopCommerceBudget;
  effective: CommerceModelBudget;
  sources: Record<keyof CommerceModelBudget, Source>;
  currentPlan: CurrentShopPlan;
};
export type LiveShopPolicyHistoryEntry = {
  id: string; createdAt: string; actor: string; reason: string;
  previousBudget: SparseShopCommerceBudget; nextBudget: SparseShopCommerceBudget;
  previousEditVersion: number; nextEditVersion: number;
};

function shopPolicyId(environment: CommerceEnvironment, shopId: string) {
  // Stable identity preserves audit history after clearing an override.
  return `arch038-live-shop-${environment.toLowerCase()}-${shopId}`;
}

/**
 * A deleted sparse override has no row-level editVersion. The Shop-scoped audit
 * stream is durable, so its event count and last recorded transition preserve a
 * logical CAS revision across create -> clear -> recreate cycles.
 *
 * All reads used for mutation occur in the caller's serializable transaction;
 * concurrent creations/clears also conflict on the unique Shop policy identity.
 */
async function shopPolicyRevision(
  client: Pick<Tx, "commerceAuditEvent">,
  environment: CommerceEnvironment,
  shopId: string,
): Promise<number> {
  const where = {
    modelPolicyId: shopPolicyId(environment, shopId), environment,
    action: "SET_LIVE_SHOP_BUDGET_OVERRIDE" as const, actorType: "PLATFORM_ADMIN" as const,
  };
  const [count, latest] = await Promise.all([
    client.commerceAuditEvent.count({ where }),
    client.commerceAuditEvent.findFirst({
      where, select: { metadata: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
  ]);
  const metadata = latest?.metadata;
  const values = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown> : {};
  const safeVersion = (value: unknown) =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
  const previous = safeVersion(values.previousEditVersion);
  const next = safeVersion(values.nextEditVersion);
  // Legacy CLEAR events wrote nextEditVersion: 0. Count and the preceding
  // revision prevent those records from making an old form valid again.
  const cleared = values.operation === "CLEAR";
  const lastRevision = cleared ? Math.max(next, previous + 1) : Math.max(next, previous);
  const revision = Math.max(count, lastRevision);
  if (!Number.isSafeInteger(revision) || revision >= Number.MAX_SAFE_INTEGER) {
    throw new Error("Merchant execution policy revision is unavailable.");
  }
  return revision;
}

/** Reject malformed/unknown sparse overrides instead of falling back to less restrictive defaults. */
function readSparseShopBudget(value: unknown, version: number): SparseShopCommerceBudget {
  if (version !== 1 || !value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("CommerceAgent Merchant policy schema is unsupported.");
  }
  const data = value as Record<string, unknown>;
  if (!Object.keys(data).length || Object.keys(data).some((key) => !COMMERCE_MODEL_BUDGET_FIELDS.some((field) => field.key === key))) {
    throw new Error("CommerceAgent Merchant policy contains unsupported fields.");
  }
  const result: SparseShopCommerceBudget = {};
  for (const field of COMMERCE_MODEL_BUDGET_FIELDS) {
    if (!Object.hasOwn(data, field.key)) continue;
    const number = data[field.key];
    if (typeof number !== "number" || !Number.isSafeInteger(number) || number <= 0) {
      throw new Error("CommerceAgent Merchant policy contains invalid values.");
    }
    result[field.key] = number;
  }
  return result;
}

function safeAuditBudget(value: unknown): SparseShopCommerceBudget {
  if (value && typeof value === "object" && !Array.isArray(value) && !Object.keys(value).length) return {};
  try { return readSparseShopBudget(value, 1); } catch { return {}; }
}

/** Only the currently subscribed ACTIVE/TRIALING billing plan can provide plan overrides. */
export async function resolveCurrentShopPlan(
  client: Pick<Tx, "subscription" | "merchantPricingPlan">,
  shopId: string,
): Promise<CurrentShopPlan> {
  const subscription = await client.subscription.findUnique({
    where: { shopId },
    select: { status: true, planId: true, plan: { select: { shopifyPlanHandle: true } } },
  });
  if (!subscription || !["ACTIVE", "TRIALING"].includes(subscription.status) || !subscription.planId || !subscription.plan) {
    return { state: "NO_CURRENT_PLAN", message: "No eligible active or trialing current subscription plan. Price Plan overrides are not applied.", plan: null };
  }
  const handle = subscription.plan.shopifyPlanHandle;
  const plan = await client.merchantPricingPlan.findUnique({
    where: { shopifyPlanHandle: handle },
    select: { id: true, displayName: true, shopifyPlanHandle: true },
  });
  if (!plan) {
    return { state: "UNMATCHED_PLAN", message: `Current subscription handle ${handle} has no matching Merchant Pricing Plan. No Plan override is applied.`, plan: null };
  }
  return { state: "RESOLVED", message: "Matched from the current subscription and Billing Plan handle.",
    plan: { id: plan.id, name: plan.displayName, handle: plan.shopifyPlanHandle } };
}

export async function loadLiveShopPolicyDashboard(
  client: Pick<Tx, "shop" | "subscription" | "merchantPricingPlan" | "commerceModelPolicy" | "commerceAuditEvent">,
  environment: CommerceEnvironment,
  shopId: string,
  page: number,
): Promise<{ policy: LiveShopPolicyView; history: LiveShopPolicyHistoryEntry[]; hasMore: boolean }> {
  const shop = await client.shop.findUnique({ where: { id: shopId }, select: { id: true } });
  if (!shop) throw new Error("Merchant no longer exists.");
  const [platformRows, shopRows, currentPlan] = await Promise.all([
    client.commerceModelPolicy.findMany({ where: { environment, context: "LIVE", scope: "PLATFORM" }, take: 2 }),
    client.commerceModelPolicy.findMany({ where: { environment, context: "LIVE", scope: "SHOP", shopId }, take: 2 }),
    resolveCurrentShopPlan(client, shopId),
  ]);
  if (platformRows.length !== 1 || shopRows.length > 1) throw new Error("LIVE execution policy is unavailable or ambiguous. Verify the ARCH-038 migration.");
  const platformBudget = readCommerceModelBudget(platformRows[0]!.budget, platformRows[0]!.budgetSchemaVersion);
  const shopRecord = shopRows[0];
  const budget = shopRecord ? readSparseShopBudget(shopRecord.budget, shopRecord.budgetSchemaVersion) : {};
  let planBudget: SparseShopCommerceBudget = {};
  if (currentPlan.plan) {
    const planRows = await client.commerceModelPolicy.findMany({
      where: { environment, context: "LIVE", scope: "PRICE_PLAN", merchantPricingPlanId: currentPlan.plan.id }, take: 2,
    });
    if (planRows.length > 1) throw new Error("LIVE Price Plan execution policy is ambiguous.");
    planBudget = planRows[0] ? readSparseShopBudget(planRows[0].budget, planRows[0].budgetSchemaVersion) : {};
  }
  const effective = { ...platformBudget, ...planBudget, ...budget };
  const source = (key: keyof CommerceModelBudget): Source =>
    Object.hasOwn(budget, key) ? "MERCHANT" : Object.hasOwn(planBudget, key) ? "PRICE_PLAN" : "PLATFORM";
  const sources = { deadlineMs: source("deadlineMs"), outputTokens: source("outputTokens") };
  const audit = await client.commerceAuditEvent.findMany({
    where: { modelPolicyId: shopPolicyId(environment, shopId), environment, action: "SET_LIVE_SHOP_BUDGET_OVERRIDE", actorType: "PLATFORM_ADMIN" },
    select: { id: true, createdAt: true, reason: true, metadata: true, actorAdminId: true, actor: { select: { email: true, displayName: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: page * 10, take: 11,
  });
  const history = audit.slice(0, 10).map((event) => {
    const m = event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)
      ? event.metadata as Record<string, unknown> : {};
    return { id: event.id, createdAt: event.createdAt.toISOString(),
      actor: event.actor?.displayName || event.actor?.email || event.actorAdminId || "Unknown administrator",
      reason: event.reason, previousBudget: safeAuditBudget(m.previousBudget), nextBudget: safeAuditBudget(m.nextBudget),
      previousEditVersion: typeof m.previousEditVersion === "number" ? m.previousEditVersion : 0,
      nextEditVersion: typeof m.nextEditVersion === "number" ? m.nextEditVersion : 0 };
  });
  const revision = await shopPolicyRevision(client, environment, shopId);
  return { policy: { shopId, environment, editVersion: Math.max(shopRecord?.editVersion ?? 0, revision), budget, platformBudget, planBudget, effective, sources, currentPlan },
    history, hasMore: audit.length > 10 };
}

export async function mutateLiveShopPolicy(
  tx: Pick<Tx, "shop" | "commerceModelPolicy" | "commerceAuditEvent">,
  input: { shopId: string; budget: SparseShopCommerceBudget; expectedEditVersion: number; reason: string },
  environment: CommerceEnvironment,
  actorAdminId: string,
): Promise<void> {
  const shop = await tx.shop.findUnique({ where: { id: input.shopId }, select: { id: true } });
  if (!shop) throw new Error("Merchant no longer exists.");
  const rows = await tx.commerceModelPolicy.findMany({
    where: { environment, context: "LIVE", scope: "SHOP", shopId: input.shopId }, take: 2,
  });
  if (rows.length > 1) throw new Error("Ambiguous Merchant execution policy.");
  const old = rows[0];
  const previousBudget = old ? readSparseShopBudget(old.budget, old.budgetSchemaVersion) : {};
  const oldRowVersion = old?.editVersion ?? 0;
  const oldVersion = Math.max(oldRowVersion, await shopPolicyRevision(tx, environment, input.shopId));
  if (oldVersion !== input.expectedEditVersion) throw new CommerceModelPolicyConflict();
  const nextBudget = input.budget;
  if (JSON.stringify(previousBudget) === JSON.stringify(nextBudget)) throw new Error("No CommerceAgent Merchant settings have changed.");
  const id = shopPolicyId(environment, input.shopId);
  if (!Object.keys(nextBudget).length) {
    if (!old) throw new Error("No CommerceAgent Merchant settings have changed.");
    const result = await tx.commerceModelPolicy.deleteMany({
      where: { id: old.id, environment, context: "LIVE", scope: "SHOP", shopId: input.shopId, editVersion: oldRowVersion },
    });
    if (result.count !== 1) throw new CommerceModelPolicyConflict();
  } else if (old) {
    const result = await tx.commerceModelPolicy.updateMany({
      where: { id: old.id, environment, context: "LIVE", scope: "SHOP", shopId: input.shopId, editVersion: oldRowVersion },
      data: { budget: nextBudget, editVersion: { increment: 1 }, updatedByAdminId: actorAdminId },
    });
    if (result.count !== 1) throw new CommerceModelPolicyConflict();
  } else {
    await tx.commerceModelPolicy.create({ data: {
      id, environment, context: "LIVE", scope: "SHOP", shopId: input.shopId, budget: nextBudget,
      budgetSchemaVersion: 1, editVersion: oldVersion + 1,
      createdByAdminId: actorAdminId, updatedByAdminId: actorAdminId,
    } });
  }
  await tx.commerceAuditEvent.create({ data: {
    action: "SET_LIVE_SHOP_BUDGET_OVERRIDE", actorType: "PLATFORM_ADMIN", actorAdminId,
    modelPolicyId: id, environment, reason: input.reason,
    metadata: { context: "LIVE", scope: "SHOP", shopId: input.shopId,
      previousBudget, nextBudget, previousEditVersion: oldVersion,
      nextEditVersion: oldVersion + 1,
      operation: !Object.keys(nextBudget).length ? "CLEAR" : old ? "SET" : "CREATE" },
  } });
}

export async function getLiveShopPolicyDashboard(shopId: string, page: number) {
  const [{ requirePlatformAdminRead, PlatformAdminUnauthorizedError }, { prisma }] = await Promise.all([
    import("@/lib/auth/platform-admin"), import("@/lib/prisma"),
  ]);
  const principal = await requirePlatformAdminRead();
  const { canEditLiveCommerceBudget } = await import("./commerce-model-policy-fields.ts");
  if (!canEditLiveCommerceBudget(principal.role)) throw new PlatformAdminUnauthorizedError();
  return loadLiveShopPolicyDashboard(prisma, resolveAdminCommerceEnvironment(), shopId, page);
}
