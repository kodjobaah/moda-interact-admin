import { EntitlementCounter } from "@prisma/client";
import { requirePlatformAdminRead } from "@/lib/auth/platform-admin";
import { prisma } from "@/lib/prisma";

export async function getPlatformBillingPolicy() {
  await requirePlatformAdminRead();
  return prisma.platformBillingPolicy.findUnique({ where: { id: "default" } });
}

export async function getTenantBillingControls(shopId: string) {
  await requirePlatformAdminRead();
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: {
      billingPolicyOverride: true,
      entitlementCounters: {
        where: { counter: EntitlementCounter.LIFETIME_FREE_RECOVERY_CREDITS },
        select: {
          grantedQuantity: true,
          committedQuantity: true,
          reservedQuantity: true,
        },
      },
    },
  });

  if (!shop) return null;
  const counter = shop.entitlementCounters[0];
  const grantedAllowance = counter?.grantedQuantity ?? null;
  const committed = counter?.committedQuantity ?? 0;
  const reserved = counter?.reservedQuantity ?? 0;

  return {
    override: shop.billingPolicyOverride,
    allowance: {
      grantedAllowance,
      committed,
      reserved,
      remaining:
        grantedAllowance === null
          ? null
          : Math.max(0, grantedAllowance - committed - reserved),
    },
  };
}
