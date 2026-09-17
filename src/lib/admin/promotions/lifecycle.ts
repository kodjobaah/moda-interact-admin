import {
  PromotionCampaignEventType,
  PromotionCampaignStatus,
  type Prisma,
} from "@prisma/client";
import { validatePromotionCampaignReopen } from "./validation.ts";

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

  const requiresNewExpiry = existing.expiresAt <= now;
  if (requiresNewExpiry && !input.expiresAt) {
    throw new Error("This campaign has expired; choose a new future expiry.");
  }
  if (input.expiresAt) {
    validatePromotionCampaignReopen(existing.startsAt, input.expiresAt, now);
  }

  const requestedExpiry = input.expiresAt;
  const expiryChanged =
    Boolean(requestedExpiry) &&
    requestedExpiry!.getTime() !== existing.expiresAt.getTime();
  const result = await transaction.promotionCampaign.updateMany({
    where: { id: existing.id, status: existing.status, version: existing.version },
    data: {
      ...(expiryChanged ? { expiresAt: requestedExpiry } : {}),
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
  if (expiryChanged) {
    await transaction.promotionCampaignEvent.create({
      data: {
        campaignId: existing.id,
        kind: PromotionCampaignEventType.EXPIRY_CHANGED,
        oldExpiresAt: existing.expiresAt,
        newExpiresAt: requestedExpiry!,
        platformAdminId: input.adminId,
      },
    });
  }
}