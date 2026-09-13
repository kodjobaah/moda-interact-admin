import {
  PromotionCampaignEventType,
  PromotionCampaignStatus,
  type Prisma,
} from "@prisma/client";
import { validatePromotionCampaignReopen } from "./promotion-validation.ts";

type PromotionTransaction = Prisma.TransactionClient;

export async function mutatePromotionCampaignLifecycle(
  transaction: PromotionTransaction,
  input: { id: string; intent: "close" | "reopen"; adminId: string; expiresAt?: Date },
  now = new Date(),
): Promise<void> {
  const existing = await transaction.promotionCampaign.findUnique({ where: { id: input.id } });
  if (!existing) throw new Error("Promotion campaign not found.");

  if (input.intent === "close") {
    if (existing.status !== PromotionCampaignStatus.DRAFT && existing.status !== PromotionCampaignStatus.ACTIVE) {
      throw new Error("Only draft or active campaigns can be closed.");
    }
    const result = await transaction.promotionCampaign.updateMany({
      where: { id: existing.id, status: existing.status, version: existing.version },
      data: { status: PromotionCampaignStatus.CLOSED, version: { increment: 1 } },
    });
    if (result.count !== 1) throw new Error("Promotion campaign changed; reload and retry.");
    await transaction.promotionCampaignEvent.create({
      data: { campaignId: existing.id, kind: PromotionCampaignEventType.CLOSED, platformAdminId: input.adminId },
    });
    return;
  }

  if (existing.status !== PromotionCampaignStatus.CLOSED &&
      (existing.status !== PromotionCampaignStatus.ACTIVE || existing.expiresAt > now)) {
    throw new Error("Only expired active or closed campaigns can be reopened.");
  }
  if (!input.expiresAt) throw new Error("A new expiry time is required.");
  validatePromotionCampaignReopen(existing.startsAt, input.expiresAt, now);

  const result = await transaction.promotionCampaign.updateMany({
    where: { id: existing.id, status: existing.status, version: existing.version },
    data: {
      expiresAt: input.expiresAt,
      ...(existing.status === PromotionCampaignStatus.CLOSED ? { status: PromotionCampaignStatus.ACTIVE } : {}),
      version: { increment: 1 },
    },
  });
  if (result.count !== 1) throw new Error("Promotion campaign changed; reload and retry.");
  if (existing.status === PromotionCampaignStatus.CLOSED) {
    await transaction.promotionCampaignEvent.create({
      data: { campaignId: existing.id, kind: PromotionCampaignEventType.REOPENED, platformAdminId: input.adminId },
    });
  }
  await transaction.promotionCampaignEvent.create({
    data: {
      campaignId: existing.id,
      kind: PromotionCampaignEventType.EXPIRY_CHANGED,
      oldExpiresAt: existing.expiresAt,
      newExpiresAt: input.expiresAt,
      platformAdminId: input.adminId,
    },
  });
}