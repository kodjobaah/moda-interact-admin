/** Purpose-scoped, per-operation Shopify Partner credentials (no cross-request cache). */
export type ShopifyPartnerCredentials = Readonly<{
  accessToken: string;
  organizationId: string;
  appId: string;
  apiVersion: string;
  version: number;
}>;

export type ShopifyPartnerSecret = Readonly<{
  accessToken: string;
  organizationId: string;
  appId: string;
  apiVersion?: string;
}>;

type StoredPartnerConfiguration = { value: unknown; version: number } | null;

export type ShopifyPartnerCredentialDependencies = {
  environment: string;
  isProductionNode: boolean;
  read: () => Promise<StoredPartnerConfiguration>;
  decode: (row: Exclude<StoredPartnerConfiguration, null>) => unknown;
  validate: (payload: unknown) => ShopifyPartnerSecret;
};

const VALID_ENVIRONMENTS = new Set([
  "local",
  "test",
  "development",
  "staging",
  "production",
]);
const DEFAULT_API_VERSION = "2026-07";

/** Resolve one sealed database revision. Missing, revoked or unreadable records fail closed. */
export async function resolveShopifyPartnerCredentialsWithDependencies(
  dependencies: ShopifyPartnerCredentialDependencies,
): Promise<ShopifyPartnerCredentials> {
  if (
    !VALID_ENVIRONMENTS.has(dependencies.environment) ||
    (dependencies.isProductionNode && dependencies.environment === "development")
  ) {
    throw new Error("Invalid Shopify Partner configuration environment.");
  }

  let row: StoredPartnerConfiguration;
  try {
    row = await dependencies.read();
  } catch {
    throw new Error("Shopify Partner configuration is unavailable.");
  }

  if (row === null) {
    throw new Error("Shopify Partner API is not configured.");
  }
  if (!Number.isSafeInteger(row.version) || row.version < 1) {
    throw new Error("Invalid Shopify Partner configuration.");
  }
  try {
    const values = dependencies.validate(dependencies.decode(row));
    return {
      ...values,
      apiVersion: values.apiVersion ?? DEFAULT_API_VERSION,
      version: row.version,
    };
  } catch {
    throw new Error("Invalid Shopify Partner configuration.");
  }
}
