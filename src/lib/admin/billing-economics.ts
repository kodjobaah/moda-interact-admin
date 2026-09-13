import { requirePlatformAdminRead } from "@/lib/auth/platform-admin";
import { prisma } from "@/lib/prisma";

export async function getBillingEconomicsControls() {
  await requirePlatformAdminRead();
  const [policy, plans, edges, snapshots] = await Promise.all([
    prisma.platformBillingPolicy.findUnique({ where: { id: "default" } }),
    prisma.billingPlan.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        shopifyPlanHandle: true,
        includedRecoveryConversationAllowance: true,
        recoveryCreditPackEnabled: true,
        recoveryCreditsPerPack: true,
        shopifyRecoveryCreditPackEventHandle: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.billingUpgradeEconomicsEdge.findMany({
      where: { active: true },
      include: {
        lowerPlan: { select: { id: true, name: true } },
        higherPlan: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.billingEconomicsSnapshot.findMany({
      include: { billingPlan: { select: { id: true, name: true } } },
      orderBy: { verifiedAt: "desc" },
      take: 50,
    }),
  ]);
  return { policy, plans, edges, snapshots };
}
