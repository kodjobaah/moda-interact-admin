import { Prisma, type PrismaClient } from '@prisma/client';
import { ensureDevelopmentPlatformAdmin } from '@/lib/auth/development-platform-admin';
import type { PlatformAdminPrincipal } from '@/lib/auth/platform-admin';
import {
  HumanMessagingInputError,
  HUMAN_REASONS,
  REVIEW_DISPOSITIONS,
  type ModerationReviewDisposition,
  type HumanRestrictionReason,
} from './human-messaging-contract';

export type RestrictionTransition = {
  shopId: string;
  intent: 'SUSPEND' | 'RESTORE';
  expectedRevision: number;
  reasonCode: HumanRestrictionReason;
  reasonNote: string;
};

type Database = Pick<PrismaClient, '$transaction'>;

async function requireCurrentSuperAdmin(
  tx: Prisma.TransactionClient,
  principal: PlatformAdminPrincipal,
): Promise<void> {
  await ensureDevelopmentPlatformAdmin(tx, principal);
  const admin = await tx.platformAdmin.findUnique({
    where: { id: principal.id }, select: { role: true, active: true },
  });
  if (principal.role !== 'SUPER_ADMIN' || admin?.role !== 'SUPER_ADMIN' || !admin.active) {
    throw new HumanMessagingInputError('FORBIDDEN');
  }
}

/** Lock Shop first so two transitions also serialize when no restriction row exists. */
async function lockShop(tx: Prisma.TransactionClient, shopId: string): Promise<void> {
  const shops = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT "id" FROM "commerce"."Shop" WHERE "id"=${shopId} FOR UPDATE`,
  );
  if (shops.length !== 1) throw new HumanMessagingInputError('NOT_FOUND');
}

/** Single-revision CAS and immutable audit event; never changes Shop.status or AI/automation. */
export async function transitionHumanMessagingRestriction(
  database: Database,
  principal: PlatformAdminPrincipal,
  input: RestrictionTransition,
): Promise<number> {
  if (principal.role !== 'SUPER_ADMIN') throw new HumanMessagingInputError('FORBIDDEN');
  if (!/^[a-z0-9_-]{1,128}$/i.test(input.shopId) ||
      !Number.isInteger(input.expectedRevision) || input.expectedRevision < 0 ||
      input.expectedRevision > 2147483647 ||
      !HUMAN_REASONS.includes(input.reasonCode) ||
      !input.reasonNote.trim() || input.reasonNote.trim().length > 1000) {
    throw new HumanMessagingInputError('INVALID');
  }
  return database.$transaction(async (tx) => {
    await lockShop(tx, input.shopId);
    await requireCurrentSuperAdmin(tx, principal);
    const previous = await tx.shopHumanMessagingRestriction.findUnique({ where: { shopId: input.shopId } });
    const revision = previous?.revision ?? 0;
    const fromStatus = previous?.status ?? 'ACTIVE';
    const toStatus = input.intent === 'SUSPEND' ? 'SUSPENDED' : 'ACTIVE';
    if (revision !== input.expectedRevision) throw new HumanMessagingInputError('STALE');
    if (fromStatus === toStatus) throw new HumanMessagingInputError('ALREADY_TARGET');
    const nextRevision = revision + 1;
    const now = new Date();
    if (previous) {
      const updated = await tx.shopHumanMessagingRestriction.updateMany({
        where: { shopId: input.shopId, revision, status: fromStatus },
        data: {
          status: toStatus, revision: { increment: 1 },
          reasonCode: input.reasonCode, reasonNote: input.reasonNote,
          ...(toStatus === 'SUSPENDED'
            ? { suspendedAt: now, restoredAt: null }
            : { restoredAt: now }),
        },
      });
      if (updated.count !== 1) throw new HumanMessagingInputError('STALE');
    } else {
      // The first permissible transition is ACTIVE -> SUSPENDED (revision 0 -> 1).
      await tx.shopHumanMessagingRestriction.create({
        data: {
          shopId: input.shopId, status: 'SUSPENDED', revision: nextRevision,
          reasonCode: input.reasonCode, reasonNote: input.reasonNote, suspendedAt: now,
        },
      });
    }
    await tx.shopHumanMessagingRestrictionEvent.create({
      data: {
        shopId: input.shopId, platformAdminId: principal.id,
        fromStatus, toStatus, revision: nextRevision,
        reasonCode: input.reasonCode, reasonNote: input.reasonNote,
      },
    });
    return nextRevision;
  });
}

/** Attribution is a one-time annotation, never a change to moderation or send permission. */
export async function reviewHumanModerationAssessment(
  database: Database,
  principal: PlatformAdminPrincipal,
  input: { shopId: string; assessmentId: string; disposition: ModerationReviewDisposition },
): Promise<void> {
  if (principal.role !== 'SUPER_ADMIN') throw new HumanMessagingInputError('FORBIDDEN');
  if (!/^[a-z0-9_-]{1,128}$/i.test(input.shopId) ||
      !/^[a-z0-9_-]{1,128}$/i.test(input.assessmentId) ||
      !REVIEW_DISPOSITIONS.includes(input.disposition)) {
    throw new HumanMessagingInputError('INVALID');
  }
  await database.$transaction(async (tx) => {
    await requireCurrentSuperAdmin(tx, principal);
    const assessment = await tx.conversationModerationAssessment.findFirst({
      where: { id: input.assessmentId, shopId: input.shopId },
      select: { id: true, decision: true, reviewedAt: true },
    });
    if (!assessment) throw new HumanMessagingInputError('NOT_FOUND');
    if (assessment.reviewedAt) throw new HumanMessagingInputError('ALREADY_REVIEWED');
    if (!['ALLOW', 'BLOCK', 'REVIEW_REQUIRED'].includes(assessment.decision)) {
      throw new HumanMessagingInputError('NOT_REVIEWABLE');
    }
    // DATABASE-005 trigger requires the transaction-local reviewer identity.
    await tx.$queryRaw(
      Prisma.sql`SELECT set_config('moda.moderation_reviewer', ${principal.id}, true)`,
    );
    const changed = await tx.conversationModerationAssessment.updateMany({
      where: {
        id: assessment.id, shopId: input.shopId, reviewedAt: null,
        decision: { in: ['ALLOW', 'BLOCK', 'REVIEW_REQUIRED'] },
      },
      data: {
        reviewedAt: new Date(), reviewedByPlatformAdminId: principal.id,
        reviewDisposition: input.disposition,
      },
    });
    if (changed.count !== 1) throw new HumanMessagingInputError('ALREADY_REVIEWED');
  });
}
