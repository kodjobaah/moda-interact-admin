/** Server-only payload validation; never import this file from React components. */
import { Buffer } from "node:buffer";
import { parseCredentialKeyring, resolveActiveCredentialKey } from "@modainteract/moda-interact-shared/security/credentials/node";
import { PLATFORM_SECRET_CONTRACTS } from "./secrets-contracts";
import { ConfigurationError } from "./errors";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const R2_ENDPOINT = /^https:\/\/[a-f0-9]{32}\.r2\.cloudflarestorage\.com\/?$/i;
const BUCKET = /^(?!\.)(?!.*\.\.)(?!.*\.$)[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

/** Validate ALL fields on each Set/Rotate; never silently retain or return secret material. */
export function validateSecretPayload(key: string, value: unknown): Record<string, string | number> {
  const contract = PLATFORM_SECRET_CONTRACTS.find((candidate) => candidate.key === key);
  if (!contract || !value || typeof value !== "object" || Array.isArray(value)) {
    throw new ConfigurationError("INVALID_INPUT", "Unsupported or incomplete secret configuration.");
  }
  const record = value as Record<string, unknown>;
  const optional = contract.fields.filter((field) => "optional" in field && field.optional).map((field) => field.name);
  const allowed = contract.fields.map((field) => field.name);
  const required = allowed.filter((field) => !optional.includes(field));
  if (Object.keys(record).some((field) => !allowed.includes(field)) || required.some((field) => !Object.hasOwn(record, field))) {
    throw new ConfigurationError("INVALID_INPUT", "Unsupported or incomplete secret configuration.");
  }
  const cleaned: Record<string, string | number> = {};
  for (const field of contract.fields) {
    const input = record[field.name];
    if (input === undefined && optional.includes(field.name)) continue;
    if (field.kind === "integer") {
      if (typeof input !== "number" || !Number.isSafeInteger(input) || input < field.min || input > field.max) {
        throw new ConfigurationError("INVALID_INPUT", "Invalid R2 size limit.");
      }
      cleaned[field.name] = input;
    } else if (typeof input !== "string" || !input || input !== input.trim() ||
      Buffer.byteLength(input, "utf8") > (field.kind === "secret" ? 4096 : 2048) ||
      (field.name !== "connectionKeysJson" && CONTROL.test(input))) {
      throw new ConfigurationError("INVALID_INPUT", "Unsupported or incomplete secret configuration.");
    } else {
      cleaned[field.name] = input;
    }
  }
  if (key === "commerce.connectionKeys") {
    try {
      const parsed = parseCredentialKeyring(cleaned.connectionKeysJson as string);
      resolveActiveCredentialKey(parsed, cleaned.activeKeyId as string);
      if (cleaned.commandHmacKey !== undefined && Buffer.byteLength(cleaned.commandHmacKey as string, "utf8") < 32) throw Error();
    } catch { throw new ConfigurationError("INVALID_INPUT", "Invalid Commerce connection configuration."); }
  } else if (key === "auth.admin" || key === "auth.commerce") {
    if (Buffer.byteLength(cleaned.authSecret as string, "utf8") < 32) throw new ConfigurationError("INVALID_INPUT", "Auth.js signing secret must have at least 32 bytes.");
  } else if (key === "commerce.bootstrap") {
    const email = cleaned.adminEmail as string;
    if (email.length > 320 || !EMAIL.test(email)) throw new ConfigurationError("INVALID_INPUT", "Invalid bootstrap administrator email.");
    cleaned.adminEmail = email.toLowerCase();
  } else if (key === "merchant.knowledge.r2") {
    if (!R2_ENDPOINT.test(cleaned.endpoint as string) || !BUCKET.test(cleaned.bucket as string)) {
      throw new ConfigurationError("INVALID_INPUT", "Invalid Cloudflare R2 location.");
    }
    if ((cleaned.maxUploadBytes as number) > (cleaned.maxXlsxUncompressedBytes as number)) {
      throw new ConfigurationError("INVALID_INPUT", "Uncompressed XLSX limit cannot be lower than upload limit.");
    }
  } else if (key === "shopify.partner") {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(cleaned.organizationId as string) ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(cleaned.appId as string) ||
        cleaned.apiVersion !== undefined && !/^20\d{2}-(?:01|04|07|10)$/.test(cleaned.apiVersion as string)) {
      throw new ConfigurationError("INVALID_INPUT", "Invalid Shopify Partner identity or API version.");
    }
  } else if (key === "messaging.sender") {
    if (!/^\d{4,32}$/.test(cleaned.phoneNumberId as string) ||
        !/^\d{4,32}$/.test(cleaned.businessAccountId as string)) {
      throw new ConfigurationError("INVALID_INPUT", "Invalid WhatsApp sender identifiers.");
    }
  } else if (key === "ai.providers") {
    if (Object.keys(cleaned).length === 0) {
      throw new ConfigurationError("INVALID_INPUT", "Configure at least one approved AI provider key.");
    }
  } else if (key === "woocommerce.auth") {
    if (!/^ck_[A-Za-z0-9]{40}$/.test(cleaned.consumerKey as string) || !/^cs_[A-Za-z0-9]{40}$/.test(cleaned.consumerSecret as string)) {
      throw new ConfigurationError("INVALID_INPUT", "Invalid WooCommerce consumer key pair.");
    }
  }
  if (Buffer.byteLength(JSON.stringify(cleaned), "utf8") > 8192) {
    throw new ConfigurationError("INVALID_INPUT", "Secret payload exceeds the supported size.");
  }
  return cleaned;
}
