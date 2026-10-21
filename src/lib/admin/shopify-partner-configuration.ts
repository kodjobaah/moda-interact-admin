/** Trusted server-only Shopify Partner configuration for Admin subscription operations. */
import { prisma } from "@/lib/prisma";
import { resolveDeploymentEnvironmentName } from "@/lib/auth/environment";
import {
  loadConfigUnsealKeyring,
  unsealSecret,
} from "@/lib/admin/platform-configuration/seal";
import { validateSecretPayload } from "@/lib/admin/platform-configuration/secret-validation";
import {
  resolveShopifyPartnerCredentialsWithDependencies,
  type ShopifyPartnerSecret,
} from "./shopify-partner-credentials";

function validatePartnerSecret(payload: unknown): ShopifyPartnerSecret {
  const values = validateSecretPayload("shopify.partner", payload);
  return {
    accessToken: values.accessToken as string,
    organizationId: values.organizationId as string,
    appId: values.appId as string,
    ...(values.apiVersion !== undefined ? { apiVersion: values.apiVersion as string } : {}),
  };
}

/** Read the complete sealed tuple afresh for each Partner GraphQL operation. */
export async function requireAdminShopifyPartnerCredentials() {
  const environment = resolveDeploymentEnvironmentName();
  return resolveShopifyPartnerCredentialsWithDependencies({
    environment,
    isProductionNode: process.env.NODE_ENV === "production",
    read: () => prisma.platformConfiguration.findUnique({
      where: { environment_key: { environment, key: "shopify.partner" } },
      select: { value: true, version: true },
    }),
    decode: (row) => {
      const plaintext = unsealSecret({
        environment,
        key: "shopify.partner",
        version: row.version,
        value: row.value,
        wrapping: loadConfigUnsealKeyring(),
      });
      return JSON.parse(plaintext) as unknown;
    },
    validate: validatePartnerSecret,
  });
}
