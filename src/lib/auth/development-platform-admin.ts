import { Prisma } from '@prisma/client';

import type { PlatformAdminPrincipal } from './platform-admin.ts';

export const DEVELOPMENT_PLATFORM_ADMIN = {
  id: 'development-platform-admin',
  provider: 'development',
  providerSubject: 'development-platform-admin',
  email: 'development-platform-admin@local.invalid',
  displayName: 'Development Platform Admin',
  role: 'SUPER_ADMIN',
  active: true,
} as const;

export type DevelopmentPlatformAdminTransaction = {
  $queryRaw<T>(query: Prisma.Sql): Promise<T>;
  $executeRaw(query: Prisma.Sql): Promise<number>;
};

export async function ensureDevelopmentPlatformAdmin(
  transaction: DevelopmentPlatformAdminTransaction,
  principal: PlatformAdminPrincipal,
): Promise<void> {
  if (!principal.developmentBypass) return;

  await transaction.$executeRaw(Prisma.sql`
    INSERT INTO "public"."PlatformAdmin" (
      "id", "provider", "providerSubject", "email", "displayName", "role", "active", "updatedAt"
    ) VALUES (
      ${DEVELOPMENT_PLATFORM_ADMIN.id}, ${DEVELOPMENT_PLATFORM_ADMIN.provider},
      ${DEVELOPMENT_PLATFORM_ADMIN.providerSubject}, ${DEVELOPMENT_PLATFORM_ADMIN.email},
      ${DEVELOPMENT_PLATFORM_ADMIN.displayName}, CAST(${DEVELOPMENT_PLATFORM_ADMIN.role} AS "public"."PlatformAdminRole"),
      ${DEVELOPMENT_PLATFORM_ADMIN.active}, CURRENT_TIMESTAMP
    ) ON CONFLICT ("id") DO NOTHING
  `);

  const rows = await transaction.$queryRaw<
    [
      {
        id: string;
        provider: string;
        providerSubject: string;
        email: string;
        displayName: string | null;
        role: string;
        active: boolean;
      },
    ]
  >(Prisma.sql`
    SELECT "id", "provider", "providerSubject", "email", "displayName", "role", "active"
    FROM "public"."PlatformAdmin"
    WHERE "id" = ${DEVELOPMENT_PLATFORM_ADMIN.id}
  `);
  const backing = rows[0];
  if (
    !backing ||
    backing.id !== DEVELOPMENT_PLATFORM_ADMIN.id ||
    backing.provider !== DEVELOPMENT_PLATFORM_ADMIN.provider ||
    backing.providerSubject !== DEVELOPMENT_PLATFORM_ADMIN.providerSubject ||
    backing.email !== DEVELOPMENT_PLATFORM_ADMIN.email ||
    backing.displayName !== DEVELOPMENT_PLATFORM_ADMIN.displayName ||
    backing.role !== DEVELOPMENT_PLATFORM_ADMIN.role ||
    backing.active !== DEVELOPMENT_PLATFORM_ADMIN.active
  ) {
    throw new Error(
      'The reserved development platform administrator identity conflicts with the database.',
    );
  }
}