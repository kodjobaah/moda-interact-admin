import type { PlatformAdminRole } from '@prisma/client';
import { cache } from 'react';

import { logAdminSecurityEvent } from './audit.ts';
import {
  assertPlatformAdminAuthConfiguration,
  isDevelopmentAuthBypass,
} from './environment.ts';
import { isAuthorizedPlatformAdmin } from './security-policy.ts';

export type PlatformAdminSession = {
  email?: string;
  providerSubject?: string;
};

export type PlatformAdminResolverDependencies = {
  getSession: () => Promise<PlatformAdminSession | null>;
  findByEmail: (email: string) => Promise<{
    id: string;
    role: PlatformAdminRole;
    active: boolean;
    provider: string;
    providerSubject: string | null;
  } | null>;
};

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

export async function resolvePlatformAdminPrincipal(
  dependencies: PlatformAdminResolverDependencies,
): Promise<PlatformAdminPrincipal | null> {
    if (isDevelopmentAuthBypass()) {
      logAdminSecurityEvent('admin.auth.development_bypass', {
        action: 'authenticate',
        outcome: 'allowed',
        developmentBypass: true,
      });
      return DEVELOPMENT_PRINCIPAL;
    }

    assertPlatformAdminAuthConfiguration();

    const user = await dependencies.getSession();
    const email = user?.email?.trim().toLowerCase();
    const providerSubject = user?.providerSubject;
    if (!email || !providerSubject) return null;

    const admin = await dependencies.findByEmail(email);

    if (!admin || !isAuthorizedPlatformAdmin(admin, providerSubject)) return null;

    return {
      id: admin.id,
      role: admin.role,
      developmentBypass: false,
    };
}

const resolvePlatformAdminPrincipalCached = cache(() =>
  resolvePlatformAdminPrincipal({
    getSession: async () => {
      const { auth } = await import('../../auth');
      const session = await auth();
      return session?.user
        ? {
            email: session.user.email ?? undefined,
            providerSubject: (session.user as typeof session.user & { providerSubject?: string })
              .providerSubject,
          }
        : null;
    },
    findByEmail: async (email) => {
      const { prisma } = await import('../prisma');
      return prisma.platformAdmin.findUnique({
        where: { email },
        select: {
          id: true,
          role: true,
          active: true,
          provider: true,
          providerSubject: true,
        },
      });
    },
  }),
);

export async function getPlatformAdminPrincipal(): Promise<PlatformAdminPrincipal | null> {
  return resolvePlatformAdminPrincipalCached();
}

export async function requirePlatformAdminPage(): Promise<PlatformAdminPrincipal> {
  const principal = await getPlatformAdminPrincipal();
  if (!principal) {
    const { redirect } = await import('next/navigation');
    redirect('/login');
    throw new PlatformAdminUnauthorizedError();
  }
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
