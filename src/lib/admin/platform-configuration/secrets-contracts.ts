/** Strict, closed secret-purpose contracts. Values are only returned by an explicit authenticated reveal action. */
import type { ConfigurationContract, FieldContract } from "./contracts";

/** Display source environment variable names as help text, not as active runtime configuration. */
const withEnvironmentReference = (field: FieldContract, ...variables: string[]): FieldContract => ({
  ...field,
  description: `${field.description} Environment variable${variables.length === 1 ? "" : "s"}: ${variables.join(" / ")}.`,
});

const secret = (name: string, label: string, optional = false): FieldContract =>
  ({ name, kind: "secret", label, revealable: true, optional, description: optional ? "Optional; reveal a saved value on demand." : "Required for initial setup; reveal a saved value on demand." });
const numeric = (name: string, label: string, max: number): FieldContract =>
  ({ name, kind: "integer", label, min: 1, max, unit: "bytes", description: `Required safe integer (1–${max} bytes). Submitted with the sealed record.` });
const location = (name: string, label: string, kind: "url" | "bucket"): FieldContract => kind === "url"
  ? { name, kind: "nullable-https-url", maxLength: 2048, purpose: "r2", label, description: "Required Cloudflare R2 HTTPS endpoint; checked server-side." }
  : { name, kind: "string", maxLength: 63, pattern: "bucket", label, description: "Required R2 bucket name." };

export const PLATFORM_SECRET_CONTRACTS: readonly ConfigurationContract[] = Object.freeze([
  { key: "commerce.connectionKeys", title: "Commerce connection keys", description: "Encrypted connection keyring with independent config-unseal root.", kind: "secret", requiredRole: "SUPER_ADMIN", canReset: false,
    fields: [withEnvironmentReference(secret("connectionKeysJson", "Connection keyring JSON"), "COMMERCE_CONNECTION_KEYS_JSON"), withEnvironmentReference(secret("activeKeyId", "Active key ID"), "COMMERCE_CONNECTION_ACTIVE_KEY_ID"), withEnvironmentReference(secret("commandHmacKey", "Command HMAC key", true), "COMMERCE_CONNECTION_COMMAND_HMAC_KEY")] },
  ...(["admin", "commerce"] as const).map((app): ConfigurationContract => ({ key: `auth.${app}`, title: `${app === "admin" ? "Admin" : "Commerce"} authentication`,
    description: "Auth.js session and Google OAuth credentials, resolved on authentication requests with environment fallback when the database record is absent.",
    kind: "secret", requiredRole: "SUPER_ADMIN", canReset: false,
    fields: [withEnvironmentReference(secret("authSecret", "Auth.js signing secret"), "AUTH_SECRET"), withEnvironmentReference(secret("googleClientId", "Google client ID"), "AUTH_GOOGLE_ID"), withEnvironmentReference(secret("googleClientSecret", "Google client secret"), "AUTH_GOOGLE_SECRET")] })),
  { key: "commerce.bootstrap", title: "Commerce bootstrap administrator", description: "Encrypted active SUPER_ADMIN email selector; not proof of administrator identity.",
    kind: "secret", requiredRole: "SUPER_ADMIN", canReset: false,
    fields: [withEnvironmentReference(secret("adminEmail", "Bootstrap administrator email"), "COMMERCE_BOOTSTRAP_ADMIN_EMAIL")] },
  { key: "merchant.knowledge.r2", title: "Merchant Knowledge R2", description: "Canonical R2 credentials, location and upload limits in one versioned record.",
    kind: "secret", requiredRole: "SUPER_ADMIN", canReset: false,
    fields: [withEnvironmentReference(location("endpoint", "R2 endpoint", "url"), "MERCHANT_KNOWLEDGE_R2_ENDPOINT"), withEnvironmentReference(location("bucket", "R2 bucket", "bucket"), "MERCHANT_KNOWLEDGE_R2_BUCKET"),
      withEnvironmentReference(secret("accessKeyId", "R2 access key ID"), "MERCHANT_KNOWLEDGE_R2_ACCESS_KEY_ID"), withEnvironmentReference(secret("secretAccessKey", "R2 secret access key"), "MERCHANT_KNOWLEDGE_R2_SECRET_ACCESS_KEY"),
      withEnvironmentReference(numeric("maxUploadBytes", "Maximum upload size", 26214400), "MERCHANT_KNOWLEDGE_MAX_UPLOAD_BYTES"), withEnvironmentReference(numeric("maxXlsxUncompressedBytes", "Maximum uncompressed XLSX size", 2147483647), "MERCHANT_KNOWLEDGE_MAX_XLSX_UNCOMPRESSED_BYTES")] },
  { key: "woocommerce.auth", title: "Platform WooCommerce credentials", description: "Platform-owned WooCommerce integration only. Not a substitute for merchant-scoped REST grants.",
    kind: "secret", requiredRole: "SUPER_ADMIN", canReset: false,
    fields: [withEnvironmentReference(secret("consumerKey", "Consumer key"), "WOOCOMMERCE_CUSTOMER_KEY"), withEnvironmentReference(secret("consumerSecret", "Consumer secret"), "WOOCOMMERCE_CUSTOMER_SECRET")] },
  { key: "shopify.oauth", title: "Shopify OAuth", description: "Shopify API credentials.", kind: "secret", requiredRole: "SUPER_ADMIN", canReset: false,
    fields: [withEnvironmentReference(secret("apiKey", "API key"), "SHOPIFY_API_KEY"), withEnvironmentReference(secret("apiSecret", "API secret"), "SHOPIFY_API_SECRET")] },
  { key: "messaging.meta", title: "Meta webhook credentials", description: "Private-reader record; Messaging ingress stays environment-backed until separately authorised.",
    kind: "secret", requiredRole: "SUPER_ADMIN", canReset: false, fields: [withEnvironmentReference(secret("appSecret", "App secret"), "META_APP_SECRET"), withEnvironmentReference(secret("verifyToken", "Verify token"), "WHATSAPP_VERIFY_TOKEN")] },
  { key: "woocommerce.billing", title: "WooCommerce billing credentials", description: "Hosted Woo billing API credentials; WOO_BILLING_ENVIRONMENT remains deployment-owned.",
    kind: "secret", requiredRole: "SUPER_ADMIN", canReset: false, fields: [withEnvironmentReference(secret("apiKey", "Billing API key"), "WOO_BILLING_API_KEY"), withEnvironmentReference(secret("apiSecret", "Billing API secret"), "WOO_BILLING_API_SECRET")] },
  { key: "shopify.partner", title: "Shopify Partner API credentials", description: "One atomic Partner access token, organisation ID and application identity. Both legacy environment variable aliases map to this record.",
    kind: "secret", requiredRole: "SUPER_ADMIN", canReset: false,
    fields: [withEnvironmentReference(secret("accessToken", "Partner access token"), "SHOPIFY_PARTNER_ACCESS_TOKEN", "SHOPIFY_PARTNER_API_TOKEN"),
      withEnvironmentReference({ name: "organizationId", kind: "string", label: "Partner organisation ID", maxLength: 128, description: "Required Shopify Partner organisation ID." }, "SHOPIFY_PARTNER_ORG_ID", "SHOPIFY_PARTNER_ORGANIZATION_ID"),
      withEnvironmentReference({ name: "appId", kind: "string", label: "Shopify application ID", maxLength: 128, description: "Required Shopify application identity; accepts a Shopify App GID (gid://shopify/App/<numeric-id>) or existing short ID." }, "SHOPIFY_APP_ID"),
      withEnvironmentReference({ name: "apiVersion", kind: "string", label: "Partner API version", maxLength: 7, optional: true, description: "Optional Shopify YYYY-MM API version; otherwise the owning consumer's approved default." }, "SHOPIFY_PARTNER_API_VERSION")] },
  { key: "shopify.appEvents", title: "Shopify App Events credentials", description: "Dedicated App Events API identity, separate from Shopify OAuth and Partner billing.",
    kind: "secret", requiredRole: "SUPER_ADMIN", canReset: false,
    fields: [withEnvironmentReference(secret("clientId", "App Events client ID"), "SHOPIFY_APP_EVENTS_CLIENT_ID"), withEnvironmentReference(secret("clientSecret", "App Events client secret"), "SHOPIFY_APP_EVENTS_CLIENT_SECRET")] },
  { key: "messaging.sender", title: "WhatsApp outbound sender", description: "Outbound sender token and Meta sender IDs; not webhook verification credentials.",
    kind: "secret", requiredRole: "SUPER_ADMIN", canReset: false,
    fields: [withEnvironmentReference(secret("accessToken", "WhatsApp access token"), "WHATSAPP_ACCESS_TOKEN"),
      withEnvironmentReference({ name: "phoneNumberId", kind: "string", label: "Phone number ID", maxLength: 32, description: "Required Meta phone number ID." }, "WHATSAPP_PHONE_NUMBER_ID"),
      withEnvironmentReference({ name: "businessAccountId", kind: "string", label: "Business account ID", maxLength: 32, description: "Required WhatsApp Business Account ID." }, "WHATSAPP_BUSINESS_ACCOUNT_ID")] },
  { key: "ai.providers", title: "AI provider API keys", description: "API keys for AI service providers such as Groq and OpenAI. ",
    kind: "secret", requiredRole: "SUPER_ADMIN", canReset: false,
    fields: [withEnvironmentReference(secret("groqApiKey", "Groq API key", true), "GROQ_API_KEY"),
      withEnvironmentReference(secret("openAiApiKey", "OpenAI API key", true), "OPENAI_API_KEY", "WHATSAPP_OPENAI_API_KEY")] },
]);
export type SecretPurpose = "commerce.connectionKeys" | "auth.admin" | "auth.commerce" | "commerce.bootstrap" | "merchant.knowledge.r2" | "woocommerce.auth" | "shopify.oauth" | "messaging.meta" | "woocommerce.billing" | "shopify.partner" | "shopify.appEvents" | "messaging.sender" | "ai.providers";
export const SECRET_PURPOSES = new Set<string>(PLATFORM_SECRET_CONTRACTS.map((entry) => entry.key));
export const SECRET_REASONS = ["initial-setup", "configuration-update", "scheduled-rotation", "credential-compromise", "decommission"] as const;
export type SecretReason = typeof SECRET_REASONS[number];
