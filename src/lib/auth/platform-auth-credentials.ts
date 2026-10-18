/** Lazy Admin Auth.js adapter. The module import itself performs no DB lookup. */
import { prisma } from "@/lib/prisma";
import { resolveDeploymentEnvironmentName } from "./environment";
import { loadConfigUnsealKeyring, unsealSecret } from "@/lib/admin/platform-configuration/seal";
import { validateSecretPayload } from "@/lib/admin/platform-configuration/secret-validation";
import { resolveAdminAuthCredentialsWithDependencies, type AdminAuthCredentialBundle } from "./platform-auth-resolution";

export async function resolveAdminAuthCredentials(): Promise<AdminAuthCredentialBundle> {
  const environment = resolveDeploymentEnvironmentName();
  return resolveAdminAuthCredentialsWithDependencies({
    environment,
    isProductionNode: process.env.NODE_ENV === "production",
    read: () => prisma.platformConfiguration.findUnique({
      where: { environment_key: { environment, key: "auth.admin" } },
      select: { value: true, version: true },
    }),
    decode: (row) => {
      // A disabled tombstone is not an absent row. Canonical AAD binds version and environment.
      const plaintext = unsealSecret({ environment, key: "auth.admin", version: row.version,
        value: row.value, wrapping: loadConfigUnsealKeyring() });
      const parsed: unknown = JSON.parse(plaintext);
      const values = validateSecretPayload("auth.admin", parsed);
      return { authSecret: values.authSecret as string,
        googleClientId: values.googleClientId as string,
        googleClientSecret: values.googleClientSecret as string };
    },
    environmentCredentials: () => ({ authSecret: process.env.AUTH_SECRET,
      googleClientId: process.env.AUTH_GOOGLE_ID, googleClientSecret: process.env.AUTH_GOOGLE_SECRET }),
  });
}
