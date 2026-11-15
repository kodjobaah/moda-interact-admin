/** Server-only entrypoints, imported only by the protected page and authenticated Server Action. */
import "server-only";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdminMutation, requirePlatformAdminRead } from "@/lib/auth/platform-admin";
import { requireConfigurationSuperAdmin } from "./configuration-authorization";
import { getConfigurationEnvironment } from "./environment";
import { readSenderPoolWithDependencies, mutateSenderPoolWithDependencies } from "./whatsapp-sender-pool-core";

export async function readWhatsAppSenderPool() {
  const principal = await requirePlatformAdminRead(); requireConfigurationSuperAdmin(principal);
  return readSenderPoolWithDependencies({ db: prisma, principal, environment: getConfigurationEnvironment() });
}
export async function mutateWhatsAppSenderPool(input: unknown) {
  const principal = await requirePlatformAdminMutation(); requireConfigurationSuperAdmin(principal);
  return mutateSenderPoolWithDependencies(input, { db: prisma, principal, environment: getConfigurationEnvironment() });
}
