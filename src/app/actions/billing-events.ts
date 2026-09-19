"use server";

import {
  BillingAuditAction,
  Prisma,
  ShopifyReportState,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requirePlatformAdminMutation } from "@/lib/auth/platform-admin";
import { prisma } from "@/lib/prisma";

export type RetryBillingEventActionState =
  | {
      ok: boolean;
      code:
        | "QUEUED"
        | "ALREADY_DUE"
        | "STALE"
        | "NOT_ELIGIBLE"
        | "MISSING"
        | "ERROR";
    }
  | null;

const RETRYABLE_STATES = new Set<ShopifyReportState>([
  ShopifyReportState.RETRYABLE,
  ShopifyReportState.NEEDS_ATTENTION,
]);

function parseRequiredString(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} is required.`);
  }
  return value.trim();
}

function parseExpectedState(value: string): ShopifyReportState {
  if (!Object.values(ShopifyReportState).includes(value as ShopifyReportState)) {
    throw new Error("The expected App Event state is invalid.");
  }
  return value as ShopifyReportState;
}

function parseAttemptCount(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error("The expected report attempt count is invalid.");
  }
  return parsed;
}

function parseExpectedDate(value: FormDataEntryValue | null): Date | null {
  if (typeof value !== "string" || value === "") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("The expected retry schedule is invalid.");
  }
  return parsed;
}

function sameDate(left: Date | null, right: Date | null): boolean {
  return left?.getTime() === right?.getTime();
}

async function auditAdminId(
  principal: Awaited<ReturnType<typeof requirePlatformAdminMutation>>,
): Promise<string> {
  if (!principal.developmentBypass) return principal.id;
  const developmentAdmin = await prisma.platformAdmin.findFirst({
    where: { active: true, role: "SUPER_ADMIN" },
    select: { id: true },
  });
  if (!developmentAdmin) {
    throw new Error(
      "A provisioned SUPER_ADMIN is required for App Event retries.",
    );
  }
  return developmentAdmin.id;
}

function retrySnapshot(event: {
  id: string;
  shopId: string;
  metric: string;
  quantity: Prisma.Decimal;
  occurredAt: Date;
  shopifyReportState: ShopifyReportState;
  shopifyEventHandle: string | null;
  shopifyIdempotencyKey: string | null;
  reportAttemptCount: number;
  nextReportAt: Date | null;
  lastReportAttemptAt: Date | null;
  reportedAt: Date | null;
  providerErrorCode: string | null;
  providerResponseSummary: string | null;
}): Prisma.InputJsonObject {
  return {
    id: event.id,
    shopId: event.shopId,
    metric: event.metric,
    quantity: event.quantity.toString(),
    occurredAt: event.occurredAt.toISOString(),
    shopifyReportState: event.shopifyReportState,
    shopifyEventHandle: event.shopifyEventHandle,
    shopifyIdempotencyKey: event.shopifyIdempotencyKey,
    reportAttemptCount: event.reportAttemptCount,
    nextReportAt: event.nextReportAt?.toISOString() ?? null,
    lastReportAttemptAt: event.lastReportAttemptAt?.toISOString() ?? null,
    reportedAt: event.reportedAt?.toISOString() ?? null,
    providerErrorCode: event.providerErrorCode,
    providerResponseSummary: event.providerResponseSummary,
  };
}

export async function retryBillingEventAction(
  _previousState: RetryBillingEventActionState,
  formData: FormData,
): Promise<RetryBillingEventActionState> {
  try {
    const principal = await requirePlatformAdminMutation();
    if (principal.role !== "SUPER_ADMIN") {
      throw new Error("SUPER_ADMIN access is required to retry App Events.");
    }

    const eventId = parseRequiredString(formData, "eventId");
    const reason = parseRequiredString(formData, "reason");
    if (reason.length > 1000) {
      throw new Error("The retry reason must be 1000 characters or fewer.");
    }
    const expectedState = parseExpectedState(
      parseRequiredString(formData, "expectedState"),
    );
    const expectedAttemptCount = parseAttemptCount(
      parseRequiredString(formData, "expectedReportAttemptCount"),
    );
    const expectedNextReportAt = parseExpectedDate(
      formData.get("expectedNextReportAt"),
    );
    const adminId = await auditAdminId(principal);
    const now = new Date();

    const result = await prisma.$transaction(async (transaction) => {
      const event = await transaction.usageEvent.findUnique({
        where: { id: eventId },
        select: {
          id: true,
          shopId: true,
          metric: true,
          quantity: true,
          occurredAt: true,
          shopifyReportState: true,
          shopifyEventHandle: true,
          shopifyIdempotencyKey: true,
          reportAttemptCount: true,
          nextReportAt: true,
          lastReportAttemptAt: true,
          reportedAt: true,
          providerErrorCode: true,
          providerResponseSummary: true,
        },
      });
      if (!event) return "missing" as const;
      if (!RETRYABLE_STATES.has(event.shopifyReportState)) {
        return "not-eligible" as const;
      }

      if (
        event.shopifyReportState !== expectedState ||
        event.reportAttemptCount !== expectedAttemptCount ||
        !sameDate(event.nextReportAt, expectedNextReportAt)
      ) {
        return "stale" as const;
      }

      if (
        event.shopifyReportState === ShopifyReportState.RETRYABLE &&
        event.nextReportAt !== null &&
        event.nextReportAt.getTime() <= now.getTime()
      ) {
        return "already-due" as const;
      }

      const beforeValue = retrySnapshot(event);
      const updated = await transaction.usageEvent.updateMany({
        where: {
          id: event.id,
          shopifyReportState: event.shopifyReportState,
          reportAttemptCount: event.reportAttemptCount,
          nextReportAt: event.nextReportAt,
        },
        data: {
          shopifyReportState: ShopifyReportState.RETRYABLE,
          nextReportAt: now,
        },
      });
      if (updated.count !== 1) return "stale" as const;

      await transaction.billingAuditEvent.create({
        data: {
          action: BillingAuditAction.BILLING_EVENT_RETRY,
          shopId: event.shopId,
          platformAdminId: adminId,
          reason,
          relatedEntityType: "UsageEvent",
          relatedEntityId: event.id,
          beforeValue,
          afterValue: {
            ...beforeValue,
            shopifyReportState: ShopifyReportState.RETRYABLE,
            nextReportAt: now.toISOString(),
          },
        },
      });

      return "queued" as const;
    });

    revalidatePath("/billing");

    switch (result) {
      case "queued":
        return { ok: true, code: "QUEUED" };
      case "already-due":
        return { ok: true, code: "ALREADY_DUE" };
      case "stale":
        return { ok: true, code: "STALE" };
      case "not-eligible":
        return { ok: false, code: "NOT_ELIGIBLE" };
      case "missing":
        return { ok: false, code: "MISSING" };
    }
  } catch {
    return { ok: false, code: "ERROR" };
  }
}
