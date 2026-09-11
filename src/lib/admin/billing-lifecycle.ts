import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';

import {
  requirePlatformAdminMutation,
  requirePlatformAdminRead,
  type PlatformAdminPrincipal,
} from '../auth/platform-admin.ts';
import { logAdminSecurityEvent } from '../auth/audit.ts';
import { prisma } from '../prisma.ts';

const SYSTEM_VERSION = '0.9.0';
const MAX_REASON_LENGTH = 1000;
const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 20;

export const BILLING_TRIAGE_ACTIONS = [
  'PLAN_CHANGE',
  'SUBSCRIPTION_CANCELLATION',
  'RECOVERY_CREDIT_REFUND',
] as const;

export type BillingTriageAction = (typeof BILLING_TRIAGE_ACTIONS)[number];

type RawClient = {
  $queryRaw<T>(query: Prisma.Sql): Promise<T>;
  $executeRaw(query: Prisma.Sql): Promise<number>;
};

type DatabaseClient = RawClient & {
  $transaction<T>(callback: (transaction: RawClient) => Promise<T>): Promise<T>;
};

export type BillingSupportContext = {
  shopId: string;
  domain: string;
  subscription: {
    status: string;
    providerSubscriptionId: string | null;
    planHandle: string | null;
    pendingPlanHandle: string | null;
    currentPeriodEnd: Date | null;
  } | null;
  freeRemaining: number;
  purchasedCredits: {
    granted: number;
    committed: number;
    reserved: number;
    refunding: number;
    available: number;
  };
  purchases: Array<{
    id: string;
    credits: number;
    status: string;
    originalUsageEventId: string;
    billingPeriodId: string | null;
    planHandle: string;
    eventHandle: string;
    usageState: string;
  }>;
  cancellation: { id: string; status: string } | null;
  refunds: Array<{ id: string; purchaseId: string; status: string }>;
};

function boundedReason(value: string): string {
  const reason = value.trim();
  if (reason.length < 1 || reason.length > MAX_REASON_LENGTH) {
    throw new Error('A reason between 1 and 1000 characters is required.');
  }
  return reason;
}

function auditAdminId(principal: PlatformAdminPrincipal): string {
  return principal.id;
}

function available(granted: number, committed: number, reserved: number, refunding: number): number {
  return Math.max(granted - committed - reserved - refunding, 0);
}

async function insertAudit(
  transaction: RawClient,
  input: {
    action: 'SUBSCRIPTION_CANCELLATION' | 'RECOVERY_CREDIT_REFUND';
    adminId: string;
    shopId: string;
    reason: string;
    entityType: string;
    entityId: string;
    afterValue: Record<string, unknown>;
  },
): Promise<void> {
  await transaction.$executeRaw(Prisma.sql`
    INSERT INTO "billing"."BillingAuditEvent" (
      "id", "action", "shopId", "platformAdminId", "reason",
      "beforeValue", "afterValue", "relatedEntityType", "relatedEntityId"
    ) VALUES (
      ${randomUUID()}, CAST(${input.action} AS "billing"."BillingAuditAction"),
      ${input.shopId}, ${input.adminId}, ${input.reason},
      '{}'::jsonb, ${JSON.stringify(input.afterValue)}::jsonb, ${input.entityType}, ${input.entityId}
    )
  `);
}

export async function getBillingSupportContext(
  threadId: string,
  database: DatabaseClient = prisma as unknown as DatabaseClient,
  pagination: { page?: number; pageSize?: number } = {},
): Promise<BillingSupportContext | null> {
  await requirePlatformAdminRead();
  const page = Math.max(1, Math.floor(pagination.page ?? 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(pagination.pageSize ?? DEFAULT_PAGE_SIZE)));
  const [thread] = await database.$queryRaw<Array<{ shopId: string; domain: string }>>(Prisma.sql`
    SELECT t."shopId", s."domain"
    FROM "support"."MerchantSupportThread" t
    INNER JOIN "commerce"."Shop" s ON s."id" = t."shopId"
    WHERE t."id" = ${threadId}
  `);
  if (!thread) return null;

  const [subscription] = await database.$queryRaw<Array<{
    status: string;
    providerSubscriptionId: string | null;
    planHandle: string | null;
    pendingPlanHandle: string | null;
    currentPeriodEnd: Date | null;
  }>>(Prisma.sql`
    SELECT "status", "providerSubscriptionId", "observedShopifyPlanHandle" AS "planHandle",
      "pendingShopifyPlanHandle" AS "pendingPlanHandle", "currentPeriodEnd"
    FROM "billing"."Subscription"
    WHERE "shopId" = ${thread.shopId}
  `);
  const [freeAllowance] = await database.$queryRaw<Array<{
    base: number | null;
    adjustments: number | null;
    committed: number | null;
    reserved: number | null;
  }>>(Prisma.sql`
    SELECT pl."freeLifetimeConversationAllowance" AS "base",
      COALESCE((SELECT SUM(a."quantity") FROM "billing"."BillingAllowanceAdjustment" a
        WHERE a."shopId" = ${thread.shopId} AND a."counter" = 'FREE_RECOVERY_LIFETIME'), 0)::int AS "adjustments",
      COALESCE(c."committedQuantity", 0)::int AS "committed",
      COALESCE(c."reservedQuantity", 0)::int AS "reserved"
    FROM "billing"."Subscription" s
    LEFT JOIN "billing"."BillingPlan" pl ON pl."id" = s."planId"
    LEFT JOIN "billing"."ShopEntitlementCounter" c
      ON c."shopId" = s."shopId" AND c."counter" = 'FREE_RECOVERY_LIFETIME'
    WHERE s."shopId" = ${thread.shopId}
  `);
  const [counter] = await database.$queryRaw<Array<{
    granted: number | null;
    committed: number | null;
    reserved: number | null;
    refunding: number | null;
  }>>(Prisma.sql`
    SELECT "grantedQuantity" AS "granted", "committedQuantity" AS "committed",
      "reservedQuantity" AS "reserved", "refundingQuantity" AS "refunding"
    FROM "billing"."ShopEntitlementCounter"
    WHERE "shopId" = ${thread.shopId} AND "counter" = 'PURCHASED_RECOVERY_CREDITS'
  `);
  const purchases = await database.$queryRaw<BillingSupportContext['purchases']>(Prisma.sql`
    SELECT p."id", p."creditsGranted" AS "credits", p."status",
      p."usageEventId" AS "originalUsageEventId",
      u."billingPeriodId" AS "billingPeriodId",
      p."shopifyPlanHandleSnapshot" AS "planHandle",
      p."shopifyEventHandleSnapshot" AS "eventHandle",
      u."shopifyReportState" AS "usageState"
    FROM "billing"."RecoveryCreditPurchase" p
    INNER JOIN "billing"."UsageEvent" u ON u."id" = p."usageEventId"
    WHERE p."shopId" = ${thread.shopId}
    ORDER BY p."createdAt" DESC, p."id" DESC
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
  `);
  const [cancellation] = await database.$queryRaw<BillingSupportContext['cancellation'][]>(Prisma.sql`
    SELECT "id", "status" FROM "billing"."SubscriptionCancellationRequest"
    WHERE "shopId" = ${thread.shopId} ORDER BY "createdAt" DESC LIMIT 1
  `);
  const refunds = await database.$queryRaw<BillingSupportContext['refunds']>(Prisma.sql`
    SELECT "id", "purchaseId", "status" FROM "billing"."RecoveryCreditRefund"
    WHERE "shopId" = ${thread.shopId} ORDER BY "createdAt" DESC LIMIT ${MAX_PAGE_SIZE}
  `);
  const granted = counter?.granted ?? 0;
  const committed = counter?.committed ?? 0;
  const reserved = counter?.reserved ?? 0;
  const refunding = counter?.refunding ?? 0;
  return {
    shopId: thread.shopId,
    domain: thread.domain,
    subscription: subscription ?? null,
    freeRemaining: Math.max(
      (freeAllowance?.base ?? 0) + (freeAllowance?.adjustments ?? 0) -
        (freeAllowance?.committed ?? 0) - (freeAllowance?.reserved ?? 0),
      0,
    ),
    purchasedCredits: { granted, committed, reserved, refunding, available: available(granted, committed, reserved, refunding) },
    purchases,
    cancellation: cancellation ?? null,
    refunds,
  };
}

export async function createBillingTriageAction(input: {
  threadId: string;
  messageId: string;
  action: BillingTriageAction;
  reason: string;
  purchaseId?: string;
}): Promise<{ id: string; action: BillingTriageAction }> {
  const principal = await requirePlatformAdminMutation();
  const reason = boundedReason(input.reason);
  if (!BILLING_TRIAGE_ACTIONS.includes(input.action)) throw new Error('Unsupported billing triage action.');
  const database = prisma as unknown as DatabaseClient;
  const result = await database.$transaction(async (transaction) => {
    const [thread] = await transaction.$queryRaw<Array<{ shopId: string }>>(Prisma.sql`
      SELECT "shopId" FROM "support"."MerchantSupportThread" WHERE "id" = ${input.threadId}
    `);
    if (!thread) throw new Error('Support thread not found.');
    const [message] = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "support"."MerchantSupportMessage"
      WHERE "id" = ${input.messageId} AND "threadId" = ${input.threadId} AND "kind" = 'MERCHANT'
    `);
    if (!message) throw new Error('A merchant support message is required.');

    if (input.action === 'PLAN_CHANGE') {
      const id = randomUUID();
      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO "support"."MerchantSupportMessage" (
          "id", "threadId", "kind", "state", "originalBody", "sourceLanguageTag",
          "systemCode", "systemVersion", "sourceKey", "availableAt", "createdAt", "updatedAt"
        ) VALUES (
          ${id}, ${input.threadId}, 'SYSTEM', 'AVAILABLE',
          'BILLING_PLAN_CHANGE_ACTION_REQUIRED', 'en-GB',
          'BILLING_PLAN_CHANGE_ACTION_REQUIRED', ${SYSTEM_VERSION},
          ${`billing-plan-change:${input.threadId}:${input.messageId}`}, NOW(), NOW(), NOW()
        ) ON CONFLICT ("sourceKey") DO NOTHING
      `);
      const [existing] = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "support"."MerchantSupportMessage"
        WHERE "sourceKey" = ${`billing-plan-change:${input.threadId}:${input.messageId}`}
      `);
      logAdminSecurityEvent('admin.billing.plan_change_action', { adminId: principal.id, action: input.action, resourceType: 'merchant_support_thread', resourceId: input.threadId, outcome: 'succeeded' });
      return { id: existing?.id ?? id, action: input.action };
    }

    const [context] = await transaction.$queryRaw<Array<{
      status: string; providerSubscriptionId: string | null; planHandle: string | null; currentPeriodEnd: Date | null;
    }>>(Prisma.sql`
      SELECT "status", "providerSubscriptionId", "observedShopifyPlanHandle" AS "planHandle", "currentPeriodEnd"
      FROM "billing"."Subscription" WHERE "shopId" = ${thread.shopId} FOR UPDATE
    `);
    if (input.action === 'SUBSCRIPTION_CANCELLATION') {
      if (!context || !['ACTIVE', 'TRIALING'].includes(context.status) || !context.providerSubscriptionId || !context.planHandle) {
        throw new Error('An active or trialing subscription identity is required.');
      }
      const requestKey = `subscription-cancel:${thread.shopId}:${context.providerSubscriptionId}`;
      const id = randomUUID();
      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO "billing"."SubscriptionCancellationRequest" (
          "id", "shopId", "source", "sourceMessageId", "providerSubscriptionIdSnapshot",
          "planHandleSnapshot", "currentPeriodEndSnapshot", "requestKey", "reason", "mode", "status"
        ) VALUES (
          ${id}, ${thread.shopId}, 'MERCHANT_SUPPORT', ${input.messageId}, ${context.providerSubscriptionId},
          ${context.planHandle}, ${context.currentPeriodEnd}, ${requestKey}, ${reason}, 'END_OF_CYCLE', 'REQUESTED'
        ) ON CONFLICT ("requestKey") DO NOTHING
      `);
      const [row] = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "billing"."SubscriptionCancellationRequest" WHERE "requestKey" = ${requestKey}
      `);
      if (!row) throw new Error('Cancellation request could not be created.');
      await insertAudit(transaction, { action: 'SUBSCRIPTION_CANCELLATION', adminId: auditAdminId(principal), shopId: thread.shopId, reason, entityType: 'SubscriptionCancellationRequest', entityId: row.id, afterValue: { status: 'REQUESTED', mode: 'END_OF_CYCLE' } });
      return { id: row.id, action: input.action };
    }

    if (!input.purchaseId) throw new Error('A recovery-credit purchase is required.');
    const [purchase] = await transaction.$queryRaw<Array<{
      id: string; status: string; credits: number; originalUsageEventId: string; billingPeriodId: string | null; planHandle: string; eventHandle: string; usageState: string;
    }>>(Prisma.sql`
      SELECT p."id", p."status", p."creditsGranted" AS "credits",
        p."usageEventId" AS "originalUsageEventId", u."billingPeriodId",
        p."shopifyPlanHandleSnapshot" AS "planHandle", p."shopifyEventHandleSnapshot" AS "eventHandle",
        u."shopifyReportState" AS "usageState"
      FROM "billing"."RecoveryCreditPurchase" p
      INNER JOIN "billing"."UsageEvent" u ON u."id" = p."usageEventId"
      WHERE p."id" = ${input.purchaseId} AND p."shopId" = ${thread.shopId} FOR UPDATE
    `);
    if (!purchase || purchase.status !== 'ACTIVE' || purchase.credits <= 0) throw new Error('An active recovery-credit purchase is required.');
    const [counter] = await transaction.$queryRaw<Array<{ granted: number; committed: number; reserved: number; refunding: number }>>(Prisma.sql`
      SELECT "grantedQuantity" AS "granted", "committedQuantity" AS "committed", "reservedQuantity" AS "reserved", "refundingQuantity" AS "refunding"
      FROM "billing"."ShopEntitlementCounter" WHERE "shopId" = ${thread.shopId} AND "counter" = 'PURCHASED_RECOVERY_CREDITS' FOR UPDATE
    `);
    if (!counter || available(counter.granted, counter.committed, counter.reserved, counter.refunding) < purchase.credits) throw new Error('Purchased recovery-credit availability is insufficient.');
    const requestKey = `recovery-credit-refund:${purchase.id}`;
    const id = randomUUID();
    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO "billing"."RecoveryCreditRefund" (
        "id", "shopId", "purchaseId", "source", "sourceMessageId", "originalUsageEventIdSnapshot",
        "billingPeriodIdSnapshot", "planHandleSnapshot", "eventHandleSnapshot", "creditsSnapshot", "requestKey", "reason", "status"
      ) VALUES (
        ${id}, ${thread.shopId}, ${purchase.id}, 'MERCHANT_SUPPORT', ${input.messageId}, ${purchase.originalUsageEventId},
        ${purchase.billingPeriodId}, ${purchase.planHandle}, ${purchase.eventHandle}, ${purchase.credits}, ${requestKey}, ${reason}, 'REQUESTED'
      ) ON CONFLICT ("requestKey") DO NOTHING
    `);
    const [row] = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "billing"."RecoveryCreditRefund" WHERE "requestKey" = ${requestKey}
    `);
    if (!row) throw new Error('Refund request could not be created.');
    await insertAudit(transaction, { action: 'RECOVERY_CREDIT_REFUND', adminId: auditAdminId(principal), shopId: thread.shopId, reason, entityType: 'RecoveryCreditRefund', entityId: row.id, afterValue: { status: 'REQUESTED', purchaseId: purchase.id, credits: purchase.credits } });
    return { id: row.id, action: input.action };
  });
  return result;
}