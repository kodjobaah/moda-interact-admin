/** ARCH-043 sealed envelope. Only existing ARCH-039 Shared cryptography is used. */
import { Buffer } from "node:buffer";
import {
  encryptCredential, decryptCredential, parseCredentialKeyring, resolveActiveCredentialKey,
  type CredentialEnvelope, type CredentialKeyring,
} from "@modainteract/moda-interact-shared/security/credentials/node";
import { ConfigurationError } from "./errors";

const ENVIRONMENTS = new Set(["local", "test", "development", "staging", "production"]);
const PURPOSES = new Set(["commerce.connectionKeys", "auth.admin", "auth.commerce", "commerce.bootstrap", "merchant.knowledge.r2", "woocommerce.auth", "shopify.oauth", "messaging.meta", "woocommerce.billing", "shopify.partner", "shopify.appEvents", "messaging.sender", "ai.providers"]);
const KEY_ID = /^[A-Za-z0-9_-]{1,64}$/;
const B64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export type StoredSecret = Readonly<{
  kind: "sealed"; schemaVersion: 1; algorithm: "AES-256-GCM"; wrappingKeyId: string;
  nonce: string; ciphertext: string; authTag: string;
}>;
export const DISABLED_SECRET = Object.freeze({ kind: "disabled" as const, schemaVersion: 1 as const });
export type UnsealKeyring = { keyring: CredentialKeyring; activeKeyId: string };

function assertIdentity(environment: string, key: string, version: number): void {
  if (!ENVIRONMENTS.has(environment) || !PURPOSES.has(key) || !Number.isSafeInteger(version) || version < 1) {
    throw new ConfigurationError("INVALID_INPUT", "Invalid secret identity or revision.");
  }
}
export function secretAAD(environment: string, key: string, version: number): string {
  assertIdentity(environment, key, version);
  return JSON.stringify(["moda-platform-config-v1", environment, key, version, 1]);
}

/** Dedicated external wrapping keyring, never the Commerce keyring that this service manages. */
export function loadConfigUnsealKeyring(): UnsealKeyring {
  try {
    const keyring = parseCredentialKeyring(process.env.MODA_CONFIG_UNSEAL_KEY);
    const activeKeyId = resolveActiveCredentialKey(keyring, process.env.MODA_CONFIG_UNSEAL_ACTIVE_KEY_ID);
    return { keyring, activeKeyId };
  } catch {
    throw new ConfigurationError("DB_UNAVAILABLE", "Configuration encryption is unavailable.");
  }
}
function base64(bytes: Uint8Array): string { return Buffer.from(bytes).toString("base64"); }
function decoded(value: unknown, expectedLength?: number): Uint8Array {
  if (typeof value !== "string" || !value || !B64.test(value)) {
    throw new ConfigurationError("INVALID_INPUT", "Invalid sealed secret.");
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value || bytes.length < 1 || bytes.length > 8192 ||
      expectedLength !== undefined && bytes.length !== expectedLength) {
    throw new ConfigurationError("INVALID_INPUT", "Invalid sealed secret.");
  }
  return Uint8Array.from(bytes);
}
export function parseStoredSecret(value: unknown): CredentialEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ConfigurationError("INVALID_INPUT", "Invalid sealed secret.");
  const row = value as Record<string, unknown>;
  if (Object.keys(row).sort().join("|") !== ["kind", "schemaVersion", "algorithm", "wrappingKeyId", "nonce", "ciphertext", "authTag"].sort().join("|") ||
      row.kind !== "sealed" || row.schemaVersion !== 1 || row.algorithm !== "AES-256-GCM" ||
      typeof row.wrappingKeyId !== "string" || !KEY_ID.test(row.wrappingKeyId) || ["__proto__", "prototype", "constructor"].includes(row.wrappingKeyId)) {
    throw new ConfigurationError("INVALID_INPUT", "Invalid sealed secret.");
  }
  return { keyId: row.wrappingKeyId, nonce: decoded(row.nonce, 12), ciphertext: decoded(row.ciphertext), authTag: decoded(row.authTag, 16) };
}
export function sealSecret(input: {
  environment: string; key: string; version: number; plaintext: string; wrapping: UnsealKeyring;
}): StoredSecret {
  const aad = secretAAD(input.environment, input.key, input.version);
  if (Buffer.byteLength(input.plaintext, "utf8") > 8192) throw new ConfigurationError("INVALID_INPUT", "Secret payload exceeds the supported size.");
  try {
    const envelope = encryptCredential({ keyring: input.wrapping.keyring, activeKeyId: input.wrapping.activeKeyId, plaintext: input.plaintext, aad });
    return { kind: "sealed", schemaVersion: 1, algorithm: "AES-256-GCM", wrappingKeyId: envelope.keyId,
      nonce: base64(envelope.nonce), ciphertext: base64(envelope.ciphertext), authTag: base64(envelope.authTag) };
  } catch { throw new ConfigurationError("DB_UNAVAILABLE", "Configuration encryption is unavailable."); }
}
/** Server-only verification helper for independent consumer vector tests, NEVER imported into React. */
export function unsealSecret(input: { environment: string; key: string; version: number; value: unknown; wrapping: UnsealKeyring }): string {
  const aad = secretAAD(input.environment, input.key, input.version);
  try { return decryptCredential({ keyring: input.wrapping.keyring, envelope: parseStoredSecret(input.value), aad }); }
  catch { throw new ConfigurationError("INVALID_INPUT", "Invalid sealed secret."); }
}
