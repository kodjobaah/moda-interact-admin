import { createCipheriv, randomBytes } from "node:crypto";
import {
  createCommerceTranslationProviderCredentialAad,
  type CommerceEnvironment,
} from "@modainteract/moda-interact-shared/commerce/model";
import {
  CREDENTIAL_ENCRYPTION_UNAVAILABLE,
  type CredentialKeyring,
} from "./openrouter-credential-keyring.ts";
import { validateTranslationCredentialSecret } from "./translation-configuration-validation.ts";

export const TRANSLATION_CREDENTIAL_ENCRYPTION_UNAVAILABLE =
  "Translation provider credential encryption is unavailable.";

export type SealedTranslationProviderCredential = {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  authTag: Uint8Array;
  keyId: string;
};

export function sealTranslationProviderCredential(input: {
  environment: CommerceEnvironment;
  provider: string;
  secret: string;
  keyring: CredentialKeyring;
  activeKeyId: string;
}): SealedTranslationProviderCredential {
  const secret = validateTranslationCredentialSecret(input.secret);
  const key = input.keyring[input.activeKeyId];
  if (!(key instanceof Uint8Array) || key.byteLength !== 32) {
    throw new Error(TRANSLATION_CREDENTIAL_ENCRYPTION_UNAVAILABLE);
  }

  const nonce = randomBytes(12);
  const aad = createCommerceTranslationProviderCredentialAad({
    environment: input.environment,
    provider: input.provider,
    keyId: input.activeKeyId,
  });
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(secret, "utf8")),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  if (nonce.byteLength !== 12 || authTag.byteLength !== 16) {
    throw new Error(TRANSLATION_CREDENTIAL_ENCRYPTION_UNAVAILABLE);
  }
  return {
    ciphertext: new Uint8Array(ciphertext),
    nonce: new Uint8Array(nonce),
    authTag: new Uint8Array(authTag),
    keyId: input.activeKeyId,
  };
}
