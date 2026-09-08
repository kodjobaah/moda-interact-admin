import type { BillingPlan, BillingPlanFeature } from "@prisma/client";
import { requirePlatformAdminRead } from "@/lib/auth/platform-admin";
import { prisma } from "@/lib/prisma";

export type BillingPlanRow = BillingPlan & { features: BillingPlanFeature[] };

export async function getBillingPlans(): Promise<BillingPlanRow[]> {
  await requirePlatformAdminRead();
  return prisma.billingPlan.findMany({
    include: { features: { orderBy: { feature: "asc" } } },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
}
