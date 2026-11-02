'use server';

import { Prisma, ShopStatus } from '@prisma/client';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requirePlatformAdminMutation } from '@/lib/auth/platform-admin';
import { logAdminSecurityEvent } from '@/lib/auth/audit';
import { prisma } from '@/lib/prisma';
import { runProtectedTenantAction } from '@/lib/auth/tenant-action';
import { ensureDevelopmentPlatformAdmin } from '@/lib/auth/development-platform-admin';
import { enqueueAdminShopifyDiscountSync } from '@/lib/admin/shopify-discount-sync';
import {
  authorizeTenantRecoveryPolicyOverride,
  saveTenantRecoveryPolicyOverride,
} from '@/lib/admin/recovery-policy-override';
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

function parseBoolean(values: FormDataEntryValue[], field: string): boolean {
  if (values.length === 1 && values[0] === 'false') return false;
  if (
    values.length === 2 &&
    values.includes('false') &&
    values.includes('true')
  )
    return true;
  if (values.length === 1 && values[0] === 'true') return true;
  throw new Error(`${field} must be true or false.`);
}

function parseOptionalDate(value: FormDataEntryValue | null): Date | null {
  if (value === null || value === '') return null;
  if (typeof value !== 'string')
    throw new Error('Expiry must be a valid date.');
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed <= new Date()) {
    throw new Error('Expiry must be in the future.');
  }
  return parsed;
}

function parsePolicySnapshot(formData: FormData): RecoveryPolicySnapshot {
  const rawDelay = formData.get('recoveryDelayMinutes');
  if (typeof rawDelay !== 'string' || !rawDelay.trim()) {
    throw new Error('Recovery delay is required.');
  }
  const recoveryDelayMinutes = Number(rawDelay);
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
    followUpEnabled: parseBoolean(
      formData.getAll('followUpEnabled'),
      'Follow-up enabled',
    ),
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

export async function upsertTenantRecoveryPolicyOverrideAction(
  formData: FormData,
) {
  return runProtectedTenantAction(
    formData,
    requireSuperAdmin,
    async (formData) => {
      const shopId = formData.get('shopId');
      const reason = formData.get('reason');
      if (typeof shopId !== 'string' || !shopId)
        throw new Error('A shop id is required.');
      if (
        typeof reason !== 'string' ||
        reason.trim().length < 1 ||
        reason.trim().length > 1000
      ) {
        throw new Error('A reason between 1 and 1000 characters is required.');
      }
      const policy = parsePolicySnapshot(formData);
      const expiresAt = parseOptionalDate(formData.get('expiresAt'));
      const returnTo = safeReturnTo(formData.get('returnTo'));
      const principal = await requirePlatformAdminMutation();

      await saveTenantRecoveryPolicyOverride(prisma, {
        shopId,
        policy,
        expiresAt,
        reason: reason.trim(),
        authorize: (transaction) =>
          authorizeTenantRecoveryPolicyOverride(transaction, principal),
      });

      revalidatePath('/');
      redirect(
        returnTo.includes('?') ? `${returnTo}&saved=1` : `${returnTo}?saved=1`,
      );
    },
  );
}

export async function requestTenantShopifyDiscountSyncAction(
  formData: FormData,
) {
  return runProtectedTenantAction(
    formData,
    requireSuperAdmin,
    async (formData) => {
      const shopId = formData.get('shopId');
      const returnTo = safeReturnTo(formData.get('returnTo'));

      if (typeof shopId !== 'string' || !shopId.trim()) {
        throw new Error('A shop id is required.');
      }

      const principal = await requirePlatformAdminMutation();

      try {
        const shop = await prisma.shop.findUnique({
          where: { id: shopId },
          select: { id: true, domain: true },
        });
        if (!shop) throw new Error('Tenant not found.');

        await enqueueAdminShopifyDiscountSync({
          shopId: shop.id,
          shopDomain: shop.domain,
        });

        logAdminSecurityEvent('admin.tenant.shopify_discount_sync_requested', {
          adminId: principal.id,
          role: principal.role,
          action: 'request_shopify_discount_sync',
          resourceType: 'tenant',
          resourceId: shop.id,
          outcome: 'succeeded',
          developmentBypass: principal.developmentBypass,
        });
      } catch (error) {
        logAdminSecurityEvent(
          'admin.tenant.shopify_discount_sync_request_failed',
          {
            adminId: principal.id,
            role: principal.role,
            action: 'request_shopify_discount_sync',
            resourceType: 'tenant',
            resourceId: shopId,
            outcome: 'failed',
            reasonCode:
              error instanceof Error && error.message === 'Tenant not found.'
                ? 'tenant_not_found'
                : 'queue_request_failed',
            developmentBypass: principal.developmentBypass,
          },
        );
        throw error;
      }

      revalidatePath('/');
      const separator = returnTo.includes('?') ? '&' : '?';
      redirect(`${returnTo}${separator}discountSyncRequested=1`);
    },
  );
}

export async function clearTenantRecoveryPolicyOverrideAction(
  formData: FormData,
) {
  return runProtectedTenantAction(
    formData,
    requireSuperAdmin,
    async (formData) => {
      const shopId = formData.get('shopId');
      const reason = formData.get('reason');
      const returnTo = safeReturnTo(formData.get('returnTo'));
      if (typeof shopId !== 'string' || !shopId)
        throw new Error('A shop id is required.');
      if (
        typeof reason !== 'string' ||
        reason.trim().length < 1 ||
        reason.trim().length > 1000
      ) {
        throw new Error('A reason between 1 and 1000 characters is required.');
      }
      const principal = await requirePlatformAdminMutation();
      await prisma.$transaction(async (transaction) => {
        await ensureDevelopmentPlatformAdmin(transaction, principal);
        const admin = await transaction.platformAdmin.findUnique({
          where: { id: principal.id },
        });
        if (!admin || !admin.active || admin.role !== 'SUPER_ADMIN') {
          throw new Error('SUPER_ADMIN access is required.');
        }
        const before = await transaction.shopRecoveryPolicyOverride.findUnique({
          where: { shopId },
        });
        if (!before)
          throw new Error('No active recovery-policy override exists.');
        await transaction.shopRecoveryPolicyOverrideAuditEvent.create({
          data: {
            shopId,
            platformAdminId: admin.id,
            action: 'CLEAR',
            reason: reason.trim(),
            beforeValue: policySnapshot(
              before,
              before.expiresAt,
            ) as Prisma.InputJsonValue,
            afterValue: Prisma.JsonNull,
          },
        });
        await transaction.shopRecoveryPolicyOverride.delete({
          where: { shopId },
        });
      });
      revalidatePath('/');
      redirect(
        returnTo.includes('?') ? `${returnTo}&saved=1` : `${returnTo}?saved=1`,
      );
    },
  );
}
