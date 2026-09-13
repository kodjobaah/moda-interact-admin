import type { BillingPlan, BillingPlanFeature } from "@prisma/client";
import { requirePlatformAdminRead } from "@/lib/auth/platform-admin";
import { prisma } from "@/lib/prisma";
import {
  evaluateBillingUpgradeEdge,
  type EvaluatedBillingUpgradeEdge,
} from "@/lib/admin/billing-plan-guardrail";

export type BillingPlanRow = BillingPlan & { features: BillingPlanFeature[] };

export async function getBillingPlans(): Promise<BillingPlanRow[]> {
  await requirePlatformAdminRead();
  return prisma.billingPlan.findMany({
    include: { features: { orderBy: { feature: "asc" } } },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
}

export async function getBillingPlanById(
  id: string,
): Promise<BillingPlanRow | null> {
  await requirePlatformAdminRead();
  return prisma.billingPlan.findUnique({
    where: { id },
    include: { features: { orderBy: { feature: "asc" } } },
  });
}

export async function getBillingPlanEconomics(): Promise<
  EvaluatedBillingUpgradeEdge[]
> {
  await requirePlatformAdminRead();
  const [policy, edges] = await Promise.all([
    prisma.platformBillingPolicy.findUnique({
      where: { id: "default" },
      select: { minimumUpgradePremiumBps: true },
    }),
    prisma.billingUpgradeEconomicsEdge.findMany({
      where: { active: true },
      include: { lowerPlan: true, higherPlan: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const planIds = [
    ...new Set(
      edges.flatMap(({ lowerPlan, higherPlan }) => [
        lowerPlan.id,
        higherPlan.id,
      ]),
    ),
  ];
  const snapshots = planIds.length
    ? await prisma.billingEconomicsSnapshot.findMany({
        where: { billingPlanId: { in: planIds } },
        orderBy: { verifiedAt: "desc" },
      })
    : [];
  const latestSnapshots = new Map<string, (typeof snapshots)[number]>();
  for (const snapshot of snapshots) {
    if (!latestSnapshots.has(snapshot.billingPlanId)) {
      latestSnapshots.set(snapshot.billingPlanId, snapshot);
    }
  }
  return edges
    .filter(
      ({ lowerPlan, higherPlan }) => lowerPlan.active && higherPlan.active,
    )
    .map(({ lowerPlan, higherPlan, ...edge }) =>
      evaluateBillingUpgradeEdge({
        edge,
        lowerPlan,
        higherPlan,
        lowerSnapshot: latestSnapshots.get(lowerPlan.id) ?? null,
        higherSnapshot: latestSnapshots.get(higherPlan.id) ?? null,
        minimumUpgradePremiumBps: policy?.minimumUpgradePremiumBps ?? 2000,
      }),
    );
}
