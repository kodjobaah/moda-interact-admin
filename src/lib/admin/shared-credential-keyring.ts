import {
  parseCredentialKeyring,
  resolveActiveCredentialKey,
  type CredentialKeyring,
} from "@modainteract/moda-interact-shared/security/credentials/node";
export const CREDENTIAL_ENCRYPTION_UNAVAILABLE =
  "OpenRouter credential encryption is unavailable.";

/** Canonical shared-backed writer configuration for all Admin credential domains. */
export type ActiveSharedCredentialKeyring = Readonly<{
  keyring: CredentialKeyring;
  activeKeyId: string;
}>;

export function loadActiveSharedCredentialKeyring(): ActiveSharedCredentialKeyring {
  try {
    const keyring = parseCredentialKeyring(process.env.COMMERCE_CONNECTION_KEYS_JSON);
    const activeKeyId = resolveActiveCredentialKey(
      keyring,
      process.env.COMMERCE_CONNECTION_ACTIVE_KEY_ID,
    );
    return { keyring, activeKeyId };
  } catch {
    // No configuration, key IDs or raw cryptographic errors are exposed to Admin callers.
    throw new Error(CREDENTIAL_ENCRYPTION_UNAVAILABLE);
  }
}
