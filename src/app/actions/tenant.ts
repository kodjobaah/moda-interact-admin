'use server';

import { Prisma, ShopStatus } from '@prisma/client';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requirePlatformAdminMutation } from '@/lib/auth/platform-admin';
import { logAdminSecurityEvent } from '@/lib/auth/audit';
import { prisma } from '@/lib/prisma';
import { runProtectedTenantAction } from '@/lib/auth/tenant-action';
import {
  parseRecoveryPolicySnapshot,
  policySnapshot,
  type RecoveryPolicySnapshot,
} from '@/lib/admin/recovery-policy';

function safeReturnTo(value: FormDataEntryValue | null): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//')
  ) {
    return '/';
  }
  return value;
}

export async function updateTenantAction(formData: FormData) {
  return runProtectedTenantAction(
    formData,
    requirePlatformAdminMutation,
    async (formData) => {

  const shopId = formData.get('shopId');
  const rawStatus = formData.get('status');
  const returnTo = safeReturnTo(formData.get('returnTo'));

  if (typeof shopId !== 'string' || !shopId) {
    throw new Error('A shop id is required.');
  }

  const editableStatuses: ShopStatus[] = [
    ShopStatus.ACTIVE,
    ShopStatus.SUSPENDED,
  ];
  if (
    typeof rawStatus !== 'string' ||
    !editableStatuses.includes(rawStatus as ShopStatus)
  ) {
    throw new Error('Invalid shop status.');
  }

  try {
    await prisma.shop.update({
      where: { id: shopId },
      data: { status: rawStatus as ShopStatus },
    });
  } catch (error) {
    logAdminSecurityEvent('admin.tenant.update_failed', {
      action: 'update_tenant',
      resourceType: 'tenant',
      resourceId: shopId,
      outcome: 'failed',
      reasonCode: 'persistence_failed',
    });
    throw error;
  }

  logAdminSecurityEvent('admin.tenant.update_succeeded', {
    action: 'update_tenant',
    resourceType: 'tenant',
    resourceId: shopId,
    outcome: 'succeeded',
  });

  revalidatePath('/');
  redirect(
    returnTo.includes('?') ? `${returnTo}&saved=1` : `${returnTo}?saved=1`,
  );
    },
  );
}

function parseBoolean(value: FormDataEntryValue | null, field: string): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${field} must be true or false.`);
}

function parseOptionalDate(value: FormDataEntryValue | null): Date | null {
  if (value === null || value === '') return null;
  if (typeof value !== 'string') throw new Error('Expiry must be a valid date.');
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed <= new Date()) {
    throw new Error('Expiry must be in the future.');
  }
  return parsed;
}

function parsePolicySnapshot(formData: FormData): RecoveryPolicySnapshot {
  const recoveryDelayMinutes = Number(formData.get('recoveryDelayMinutes'));
  const recoveryOfferMode = formData.get('recoveryOfferMode');
  const fixedShopifyDiscountId = formData.get('fixedShopifyDiscountId');
  const followUpDelayMinutes = formData.get('followUpDelayMinutes');
  const snapshot = {
    recoveryDelayMinutes,
    recoveryOfferMode,
    fixedShopifyDiscountId:
      typeof fixedShopifyDiscountId === 'string' && fixedShopifyDiscountId
        ? fixedShopifyDiscountId
        : null,
    followUpEnabled: parseBoolean(formData.get('followUpEnabled'), 'Follow-up enabled'),
    followUpDelayMinutes:
      followUpDelayMinutes === null || followUpDelayMinutes === ''
        ? null
        : Number(followUpDelayMinutes),
  } as RecoveryPolicySnapshot;
  return parseRecoveryPolicySnapshot(snapshot);
}

async function requireSuperAdmin() {
  const principal = await requirePlatformAdminMutation();
  if (principal.role !== 'SUPER_ADMIN') {
    throw new Error('SUPER_ADMIN access is required.');
  }
  return principal;
}

export async function upsertTenantRecoveryPolicyOverrideAction(formData: FormData) {
  return runProtectedTenantAction(formData, requireSuperAdmin, async (formData) => {
    const shopId = formData.get('shopId');
    const reason = formData.get('reason');
    if (typeof shopId !== 'string' || !shopId) throw new Error('A shop id is required.');
    if (typeof reason !== 'string' || reason.trim().length < 1 || reason.trim().length > 1000) {
      throw new Error('A reason between 1 and 1000 characters is required.');
    }
    const policy = parsePolicySnapshot(formData);
    const expiresAt = parseOptionalDate(formData.get('expiresAt'));
    const returnTo = safeReturnTo(formData.get('returnTo'));
    const adminId = (await requirePlatformAdminMutation()).id;

    await prisma.$transaction(async (transaction) => {
      const shop = await transaction.shop.findUnique({
        where: { id: shopId },
        select: { id: true },
      });
      if (!shop) throw new Error('Tenant not found.');

      if (policy.recoveryOfferMode === 'FIXED') {
        if (!policy.fixedShopifyDiscountId) throw new Error('A fixed discount is required.');
        const discount = await transaction.shopifyDiscount.findFirst({
          where: {
            id: policy.fixedShopifyDiscountId,
            shopId,
            isAvailable: true,
            fixedSelectable: true,
            OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }],
            AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] }],
          },
          select: { id: true },
        });
        if (!discount) throw new Error('The fixed discount must belong to this shop and be current/selectable.');
        const catalogue = await transaction.shopifyDiscountCatalogue.findUnique({
          where: { shopId },
          select: { status: true },
        });
        if (catalogue?.status !== 'CURRENT') throw new Error('The discount catalogue must be current.');
      }

      const before = await transaction.shopRecoveryPolicyOverride.findUnique({ where: { shopId } });
      await transaction.shopRecoveryPolicyOverrideAuditEvent.create({
        data: {
          shopId,
          platformAdminId: adminId,
          action: 'UPSERT',
          reason: reason.trim(),
          beforeValue: before ? (policySnapshot(before) as Prisma.InputJsonValue) : undefined,
          afterValue: policySnapshot(policy) as Prisma.InputJsonValue,
        },
      });
      await transaction.shopRecoveryPolicyOverride.upsert({
        where: { shopId },
        create: { shopId, ...policy, reason: reason.trim(), expiresAt, updatedByPlatformAdminId: adminId },
        update: { ...policy, reason: reason.trim(), expiresAt, updatedByPlatformAdminId: adminId },
      });
    });

    revalidatePath('/');
    redirect(returnTo.includes('?') ? `${returnTo}&saved=1` : `${returnTo}?saved=1`);
  });
}

export async function clearTenantRecoveryPolicyOverrideAction(formData: FormData) {
  return runProtectedTenantAction(formData, requireSuperAdmin, async (formData) => {
    const shopId = formData.get('shopId');
    const reason = formData.get('reason');
    const returnTo = safeReturnTo(formData.get('returnTo'));
    if (typeof shopId !== 'string' || !shopId) throw new Error('A shop id is required.');
    if (typeof reason !== 'string' || reason.trim().length < 1 || reason.trim().length > 1000) {
      throw new Error('A reason between 1 and 1000 characters is required.');
    }
    const adminId = (await requirePlatformAdminMutation()).id;
    await prisma.$transaction(async (transaction) => {
      const before = await transaction.shopRecoveryPolicyOverride.findUnique({ where: { shopId } });
      if (!before) throw new Error('No active recovery-policy override exists.');
      await transaction.shopRecoveryPolicyOverrideAuditEvent.create({
        data: {
          shopId,
          platformAdminId: adminId,
          action: 'CLEAR',
          reason: reason.trim(),
          beforeValue: policySnapshot(before) as Prisma.InputJsonValue,
          afterValue: Prisma.JsonNull,
        },
      });
      await transaction.shopRecoveryPolicyOverride.delete({ where: { shopId } });
    });
    revalidatePath('/');
    redirect(returnTo.includes('?') ? `${returnTo}&saved=1` : `${returnTo}?saved=1`);
  });
}
