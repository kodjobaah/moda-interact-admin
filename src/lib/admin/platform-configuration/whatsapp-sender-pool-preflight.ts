import { Prisma } from "@prisma/client";
import type { SenderSnapshot } from "./whatsapp-phone-membership";
import { SenderPoolError } from "./whatsapp-sender-pool-types";

/** No customer content is selected. Match frozen dispatch identity before legacy singleton fallback. */
function matchingEvidence(snapshot: SenderSnapshot, phoneId: string) {
  const root = Prisma.sql`((m."dispatchProviderAccountId"=${snapshot.providerAccountId} AND m."dispatchProviderPhoneNumberId"=${phoneId}) OR
    (m."dispatchProviderAccountId" IS NULL AND m."dispatchProviderPhoneNumberId" IS NULL AND ${phoneId}=${snapshot.legacyPhoneNumberId}))`;
  const part = Prisma.sql`p."providerAccountId"=${snapshot.providerAccountId} AND p."providerPhoneNumberId"=${phoneId}`;
  return Prisma.sql`WITH evidence AS (
    SELECT m."conversationId",
      (${root} AND m."providerDispatchAdmittedAt" IS NOT NULL AND m.status='PENDING' AND m."providerMessageId" IS NULL AND m."sentAt" IS NULL OR EXISTS (
        SELECT 1 FROM whatsapp."ConversationDeliveryPart" p WHERE p."messageId"=m.id AND ${part} AND p."providerDispatchAdmittedAt" IS NOT NULL AND p."providerMessageId" IS NULL AND p."acknowledgedAt" IS NULL AND p.state IN ('ADMITTED','UNKNOWN'))) AS inflight,
      CASE WHEN ${root} THEN m."sentAt" ELSE NULL END AS confirmed,
      (SELECT max(coalesce(p."acknowledgedAt",p."deliveredAt",p."readAt")) FROM whatsapp."ConversationDeliveryPart" p WHERE p."messageId"=m.id AND ${part}) AS part_confirmed
    FROM whatsapp."ConversationMessage" m WHERE m.direction='OUTBOUND' AND (
      ${root} AND (m."providerDispatchAdmittedAt" IS NOT NULL OR m."providerMessageId" IS NOT NULL OR m."sentAt" IS NOT NULL) OR EXISTS (
        SELECT 1 FROM whatsapp."ConversationDeliveryPart" p WHERE p."messageId"=m.id AND ${part} AND (p."providerDispatchAdmittedAt" IS NOT NULL OR p."providerMessageId" IS NOT NULL OR p."acknowledgedAt" IS NOT NULL)))
  )`;
}
export async function assertNoLegacySenderUse(tx: Prisma.TransactionClient, snapshot: SenderSnapshot, phoneId: string): Promise<void> {
  const evidence = matchingEvidence(snapshot, phoneId);
  const general = await tx.$queryRaw<Array<{ blocked: boolean }>>(Prisma.sql`${evidence}
    SELECT EXISTS(SELECT 1 FROM evidence e JOIN whatsapp."Conversation" c ON c.id=e."conversationId"
      WHERE c."checkoutRecoveryId" IS NULL AND (e.inflight OR c.outcome='IN_PROGRESS' AND
      ((c."lastInboundAt" AT TIME ZONE 'UTC')>=CURRENT_TIMESTAMP-INTERVAL '24 hours' OR (e.confirmed AT TIME ZONE 'UTC')>=CURRENT_TIMESTAMP-INTERVAL '24 hours' OR e.part_confirmed>=CURRENT_TIMESTAMP-INTERVAL '24 hours'))) AS blocked`);
  if (general[0]?.blocked) throw new SenderPoolError("LEGACY_SENDER_IN_USE");
  const candidate = await tx.$queryRaw<Array<{ blocked: boolean }>>(Prisma.sql`${evidence}
    SELECT EXISTS(SELECT 1 FROM evidence e JOIN whatsapp."Conversation" c ON c.id=e."conversationId"
      JOIN commerce."CheckoutRecovery" r ON r.id=c."checkoutRecoveryId"
      WHERE r.status IN ('DETECTED','MESSAGE_SENT','ENGAGED') AND NOT EXISTS(SELECT 1 FROM whatsapp."RecoverySenderAssignment" a WHERE a."conversationId"=c.id)) AS blocked`);
  if (!candidate[0]?.blocked) return;
  const config = await tx.backgroundRuntimeConfig.findUnique({ where: { id: "default" }, select: { checkoutRecoveryLifetimeDays: true } });
  const days = config?.checkoutRecoveryLifetimeDays;
  if (typeof days !== "number" || !Number.isInteger(days) || days < 0 || days > 2147483647) throw new SenderPoolError("DB_UNAVAILABLE", new Error("Invalid recovery lifetime configuration"));
  const recovery = await tx.$queryRaw<Array<{ blocked: boolean }>>(Prisma.sql`${evidence}
    SELECT EXISTS(SELECT 1 FROM evidence e JOIN whatsapp."Conversation" c ON c.id=e."conversationId"
      JOIN commerce."CheckoutRecovery" r ON r.id=c."checkoutRecoveryId"
      WHERE r.status IN ('DETECTED','MESSAGE_SENT','ENGAGED') AND NOT EXISTS(SELECT 1 FROM whatsapp."RecoverySenderAssignment" a WHERE a."conversationId"=c.id)
      AND EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP-(r."lastExternalActivityAt" AT TIME ZONE 'UTC')))*1000 < ${days}::numeric*86400000::numeric) AS blocked`);
  if (recovery[0]?.blocked) throw new SenderPoolError("LEGACY_SENDER_IN_USE");
}
