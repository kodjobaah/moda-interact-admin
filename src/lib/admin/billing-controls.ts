import { EntitlementCounter } from "@prisma/client";
import { requirePlatformAdminRead } from "@/lib/auth/platform-admin";
import { prisma } from "@/lib/prisma";

export async function getPlatformBillingPolicy() {
  await requirePlatformAdminRead();
  return prisma.platformBillingPolicy.findUnique({ where: { id: "default" } });
}

export async function getTenantBillingControls(shopId: string) {
  await requirePlatformAdminRead();
  const [shop, adjustments] = await Promise.all([
    prisma.shop.findUnique({
      where: { id: shopId },
      select: {
        billingPolicyOverride: true,
        entitlementCounters: {
          where: { counter: EntitlementCounter.FREE_RECOVERY_LIFETIME },
          select: {
            grantedQuantity: true,
            committedQuantity: true,
            reservedQuantity: true,
          },
        },
      },
    }),
    prisma.billingAllowanceAdjustment.aggregate({
      where: {
        shopId,
        counter: EntitlementCounter.FREE_RECOVERY_LIFETIME,
      },
      _sum: { quantity: true },
    }),
  ]);

  if (!shop) return null;
  const totalAdjustments = adjustments._sum.quantity ?? 0;
  const counter = shop.entitlementCounters[0];
  const baseAllowance = counter?.grantedQuantity ?? null;
  const committed = counter?.committedQuantity ?? 0;
  const reserved = counter?.reservedQuantity ?? 0;
  const effectiveAllowance =
    baseAllowance === null ? null : baseAllowance + totalAdjustments;

  return {
    override: shop.billingPolicyOverride,
    allowance: {
      baseAllowance,
      totalAdjustments,
      committed,
      reserved,
      effectiveAllowance,
      effectiveRemaining:
        effectiveAllowance === null
          ? null
          : Math.max(0, effectiveAllowance - committed - reserved),
    },
  };
}
