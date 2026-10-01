import { createCipheriv, randomBytes } from "node:crypto";
import {
  createCommerceOpenRouterCredentialAad,
  type CommerceEnvironment,
} from "@modainteract/moda-interact-shared/commerce/model";
import {
  CREDENTIAL_ENCRYPTION_UNAVAILABLE,
  type CredentialKeyring,
} from "./openrouter-credential-keyring.ts";
import { validateOpenRouterCredentialSecret } from "./openrouter-credential-validation.ts";

export type SealedOpenRouterCredential = {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  authTag: Uint8Array;
  keyId: string;
};

export function sealOpenRouterCredential(input: {
  environment: CommerceEnvironment;
  secret: string;
  keyring: CredentialKeyring;
  activeKeyId: string;
}): SealedOpenRouterCredential {
  const secret = validateOpenRouterCredentialSecret(input.secret);
  const key = input.keyring[input.activeKeyId];
  if (!(key instanceof Uint8Array) || key.byteLength !== 32) {
    throw new Error(CREDENTIAL_ENCRYPTION_UNAVAILABLE);
  }

  const nonce = randomBytes(12);
  const aad = createCommerceOpenRouterCredentialAad({
    environment: input.environment,
    keyId: input.activeKeyId,
  });
  const aadBytes = Buffer.from(aad, "utf8");
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(aadBytes);
  const secretBytes = Buffer.from(secret, "utf8");
  const ciphertext = Buffer.concat([
    cipher.update(secretBytes),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  if (nonce.byteLength !== 12 || authTag.byteLength !== 16) {
    throw new Error(CREDENTIAL_ENCRYPTION_UNAVAILABLE);
  }
  return {
    ciphertext: new Uint8Array(ciphertext),
    nonce: new Uint8Array(nonce),
    authTag: new Uint8Array(authTag),
    keyId: input.activeKeyId,
  };
}
