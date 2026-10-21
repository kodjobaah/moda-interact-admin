'use server';

import { revalidatePath } from 'next/cache';
import { requirePlatformAdminMutation, type PlatformAdminPrincipal } from '@/lib/auth/platform-admin';
import { runProtectedTenantAction } from '@/lib/auth/tenant-action';
import { logAdminSecurityEvent } from '@/lib/auth/audit';
import { prisma } from '@/lib/prisma';
import {
  HumanMessagingInputError,
  parseRestrictionForm,
  parseModerationReviewForm,
  type HumanActionState,
} from '@/lib/admin/human-messaging-contract';
import {
  transitionHumanMessagingRestriction,
  reviewHumanModerationAssessment,
} from '@/lib/admin/human-messaging-mutations';

async function requireSuperAdmin(): Promise<PlatformAdminPrincipal> {
  const principal = await requirePlatformAdminMutation();
  if (principal.role !== 'SUPER_ADMIN') throw new HumanMessagingInputError('FORBIDDEN');
  return principal;
}

function errorCode(error: unknown): Exclude<NonNullable<HumanActionState>['code'], 'UPDATED' | 'REVIEWED'> {
  if (error instanceof HumanMessagingInputError) return error.code;
  return 'ERROR';
}

/** Server Actions have Next's Origin/Host CSRF protection; this additionally checks the live admin role. */
export async function changeHumanMessagingRestrictionAction(
  _state: HumanActionState,
  form: FormData,
): Promise<HumanActionState> {
  try {
    return await runProtectedTenantAction(form, requireSuperAdmin, async (data) => {
      const principal = await requireSuperAdmin();
      const input = parseRestrictionForm(data);
      try {
        const revision = await transitionHumanMessagingRestriction(prisma, principal, input);
        logAdminSecurityEvent('admin.human_messaging.restriction_changed', {
          adminId: principal.id, role: principal.role, action: input.intent.toLowerCase(),
          resourceType: 'shop_human_messaging', resourceId: input.shopId,
          outcome: 'succeeded', developmentBypass: principal.developmentBypass,
        });
        revalidatePath('/');
        return { ok: true, code: 'UPDATED' as const, revision };
      } catch (error) {
        logAdminSecurityEvent('admin.human_messaging.restriction_change_failed', {
          adminId: principal.id, role: principal.role, action: input.intent.toLowerCase(),
          resourceType: 'shop_human_messaging', resourceId: input.shopId,
          outcome: 'failed', reasonCode: errorCode(error),
          developmentBypass: principal.developmentBypass,
        });
        throw error;
      }
    });
  } catch (error) {
    return { ok: false, code: errorCode(error) };
  }
}

export async function reviewHumanModerationAction(
  _state: HumanActionState,
  form: FormData,
): Promise<HumanActionState> {
  try {
    return await runProtectedTenantAction(form, requireSuperAdmin, async (data) => {
      const principal = await requireSuperAdmin();
      const input = parseModerationReviewForm(data);
      try {
        await reviewHumanModerationAssessment(prisma, principal, input);
        logAdminSecurityEvent('admin.human_messaging.moderation_reviewed', {
          adminId: principal.id, role: principal.role, action: 'review_moderation',
          resourceType: 'conversation_moderation', resourceId: input.assessmentId,
          outcome: 'succeeded', developmentBypass: principal.developmentBypass,
        });
        revalidatePath('/');
        return { ok: true, code: 'REVIEWED' as const };
      } catch (error) {
        logAdminSecurityEvent('admin.human_messaging.moderation_review_failed', {
          adminId: principal.id, role: principal.role, action: 'review_moderation',
          resourceType: 'conversation_moderation', resourceId: input.assessmentId,
          outcome: 'failed', reasonCode: errorCode(error),
          developmentBypass: principal.developmentBypass,
        });
        throw error;
      }
    });
  } catch (error) {
    return { ok: false, code: errorCode(error) };
  }
}
