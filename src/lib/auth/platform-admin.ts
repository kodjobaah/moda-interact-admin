import type { PlatformAdminRole } from '@prisma/client';
import { cache } from 'react';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { logAdminSecurityEvent } from '@/lib/auth/audit';
import {
  assertPlatformAdminAuthConfiguration,
  isDevelopmentAuthBypass,
} from '@/lib/auth/environment';
import { prisma } from '@/lib/prisma';

export type PlatformAdminPrincipal = {
  id: string;
  role: PlatformAdminRole;
  developmentBypass: boolean;
};

export class PlatformAdminUnauthorizedError extends Error {
  constructor() {
    super('Platform administrator authorization is required.');
    this.name = 'PlatformAdminUnauthorizedError';
  }
}

const DEVELOPMENT_PRINCIPAL: PlatformAdminPrincipal = {
  id: 'development-platform-admin',
  role: 'SUPER_ADMIN' as PlatformAdminRole,
  developmentBypass: true,
};

const resolvePlatformAdminPrincipal = cache(
  async (): Promise<PlatformAdminPrincipal | null> => {
    if (isDevelopmentAuthBypass()) {
      logAdminSecurityEvent('admin.auth.development_bypass', {
        action: 'authenticate',
        outcome: 'allowed',
        developmentBypass: true,
      });
      return DEVELOPMENT_PRINCIPAL;
    }

    assertPlatformAdminAuthConfiguration();

    const session = await auth();
    const email = session?.user?.email?.trim().toLowerCase();
    if (!email) return null;

    const admin = await prisma.platformAdmin.findUnique({
      where: { email },
      select: {
        id: true,
        role: true,
        active: true,
      },
    });

    if (!admin?.active) return null;

    return {
      id: admin.id,
      role: admin.role,
      developmentBypass: false,
    };
  },
);

export async function getPlatformAdminPrincipal(): Promise<PlatformAdminPrincipal | null> {
  return resolvePlatformAdminPrincipal();
}

export async function requirePlatformAdminPage(): Promise<PlatformAdminPrincipal> {
  const principal = await getPlatformAdminPrincipal();
  if (!principal) redirect('/login');
  return principal;
}

function requirePrincipal(
  principal: PlatformAdminPrincipal | null,
): PlatformAdminPrincipal {
  if (!principal) {
    logAdminSecurityEvent('admin.authorization.denied', {
      outcome: 'denied',
      reasonCode: 'platform_admin_required',
    });
    throw new PlatformAdminUnauthorizedError();
  }
  return principal;
}

export async function requirePlatformAdminRead(): Promise<PlatformAdminPrincipal> {
  return requirePrincipal(await getPlatformAdminPrincipal());
}

export async function requirePlatformAdminMutation(): Promise<PlatformAdminPrincipal> {
  return requirePrincipal(await getPlatformAdminPrincipal());
}
