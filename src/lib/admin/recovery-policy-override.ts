import { Prisma, type PrismaClient } from "@prisma/client";
import { ensureDevelopmentPlatformAdmin } from "@/lib/auth/development-platform-admin";
import type { PlatformAdminPrincipal } from "@/lib/auth/platform-admin";
import { isAdminDiscountAssignable } from "./discount-eligibility";
import {
  policySnapshot,
  type RecoveryPolicySnapshot,
} from "./recovery-policy";

type OverrideInput = {
  shopId: string;
  policy: RecoveryPolicySnapshot;
  expiresAt: Date | null;
  reason: string;
  authorize: (transaction: Prisma.TransactionClient) => Promise<string>;
};

export async function authorizeTenantRecoveryPolicyOverride(
  transaction: Prisma.TransactionClient,
  principal: PlatformAdminPrincipal,
): Promise<string> {
  await ensureDevelopmentPlatformAdmin(transaction, principal);
  const admin = await transaction.platformAdmin.findUnique({
    where: { id: principal.id },
  });
  if (!admin || !admin.active || admin.role !== "SUPER_ADMIN") {
    throw new Error("SUPER_ADMIN access is required.");
  }
  return admin.id;
}

export async function saveTenantRecoveryPolicyOverride(
  database: PrismaClient,
  input: OverrideInput,
): Promise<void> {
  await database.$transaction(
    async (transaction) => {
      const adminId = await input.authorize(transaction);
      const shop = await transaction.shop.findUnique({
        where: { id: input.shopId },
        select: { id: true, platform: true },
      });
      if (!shop) throw new Error("Tenant not found.");

      if (input.policy.recoveryOfferMode === "FIXED") {
        if (!input.policy.fixedShopifyDiscountId) {
          throw new Error("A fixed discount is required.");
        }
        const catalogue =
          await transaction.shopifyDiscountCatalogue.findUnique({
            where: { shopId: input.shopId },
            select: { status: true, syncGeneration: true },
          });
        if (catalogue?.status !== "CURRENT") {
          throw new Error("The discount catalogue must be current.");
        }
        const discount = await transaction.shopifyDiscount.findFirst({
          where: {
            id: input.policy.fixedShopifyDiscountId,
            shopId: input.shopId,
          },
          select: {
            id: true,
            shopId: true,
            shopifyDiscountNodeId: true,
            providerType: true,
            method: true,
            providerStatus: true,
            isAvailable: true,
            fixedSelectable: true,
            startsAt: true,
            endsAt: true,
            unavailableAt: true,
            lastSeenSyncGeneration: true,
          },
        });
        if (
          !discount ||
          !isAdminDiscountAssignable({
            shopId: input.shopId,
            platform: shop.platform,
            catalogueStatus: catalogue.status,
            catalogueGeneration: catalogue.syncGeneration,
            discount,
            now: new Date(),
          })
        ) {
          throw new Error(
            "The fixed discount must belong to this shop and be current/selectable.",
          );
        }
      }

      const before =
        await transaction.shopRecoveryPolicyOverride.findUnique({
          where: { shopId: input.shopId },
        });
      await transaction.shopRecoveryPolicyOverrideAuditEvent.create({
        data: {
          shopId: input.shopId,
          platformAdminId: adminId,
          action: "UPSERT",
          reason: input.reason,
          beforeValue: before
            ? (policySnapshot(before, before.expiresAt) as Prisma.InputJsonValue)
            : undefined,
          afterValue: policySnapshot(
            input.policy,
            input.expiresAt,
          ) as Prisma.InputJsonValue,
        },
      });
      await transaction.shopRecoveryPolicyOverride.upsert({
        where: { shopId: input.shopId },
        create: {
          shopId: input.shopId,
          ...input.policy,
          reason: input.reason,
          expiresAt: input.expiresAt,
          updatedByPlatformAdminId: adminId,
        },
        update: {
          ...input.policy,
          reason: input.reason,
          expiresAt: input.expiresAt,
          updatedByPlatformAdminId: adminId,
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}