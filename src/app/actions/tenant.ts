'use server';

import { ShopStatus } from '@prisma/client';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requirePlatformAdminMutation } from '@/lib/auth/platform-admin';
import { logAdminSecurityEvent } from '@/lib/auth/audit';
import { prisma } from '@/lib/prisma';
import { runProtectedTenantAction } from '@/lib/auth/tenant-action';

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
  const rawDelay = formData.get('recoveryDelayMinutes');
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

  const recoveryDelayMinutes = Number.parseInt(String(rawDelay ?? ''), 10);
  if (
    !Number.isFinite(recoveryDelayMinutes) ||
    recoveryDelayMinutes < 0 ||
    recoveryDelayMinutes > 10080
  ) {
    throw new Error('Recovery delay must be between 0 and 10080 minutes.');
  }

  try {
    await prisma.$transaction([
      prisma.shop.update({
        where: { id: shopId },
        data: { status: rawStatus as ShopStatus },
      }),
      prisma.shopSettings.upsert({
        where: { shopId },
        create: { shopId, recoveryDelayMinutes },
        update: { recoveryDelayMinutes },
      }),
    ]);
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
