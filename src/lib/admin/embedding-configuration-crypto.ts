import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type {
  CommerceEmbeddingPurpose,
  CommerceEnvironment,
} from "@prisma/client";
import { canonicalJson } from "@modainteract/moda-interact-shared/commerce";
import type { CredentialKeyring } from "./openrouter-credential-keyring.ts";
import { validateEmbeddingCredentialSecret } from "./embedding-configuration-validation.ts";

export const EMBEDDING_CREDENTIAL_ENCRYPTION_UNAVAILABLE =
  "Embedding credential encryption is unavailable.";

export type SealedEmbeddingCredential = {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  authTag: Uint8Array;
  keyId: string;
};

export function createEmbeddingCredentialAad(input: {
  environment: CommerceEnvironment;
  purpose: CommerceEmbeddingPurpose;
  provider: string;
  keyId: string;
}): string {
  return canonicalJson({
    credentialType: "EMBEDDING",
    environment: input.environment,
    purpose: input.purpose,
    provider: input.provider,
    keyId: input.keyId,
  });
}

export function sealEmbeddingCredential(input: {
  environment: CommerceEnvironment;
  purpose: CommerceEmbeddingPurpose;
  provider: string;
  secret: string;
  keyring: CredentialKeyring;
  activeKeyId: string;
}): SealedEmbeddingCredential {
  const secret = validateEmbeddingCredentialSecret(input.secret);
  const key = input.keyring[input.activeKeyId];
  if (!(key instanceof Uint8Array) || key.byteLength !== 32) {
    throw new Error(EMBEDDING_CREDENTIAL_ENCRYPTION_UNAVAILABLE);
  }

  const nonce = randomBytes(12);
  const aad = createEmbeddingCredentialAad({
    environment: input.environment,
    purpose: input.purpose,
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
    throw new Error(EMBEDDING_CREDENTIAL_ENCRYPTION_UNAVAILABLE);
  }
  return {
    ciphertext: new Uint8Array(ciphertext),
    nonce: new Uint8Array(nonce),
    authTag: new Uint8Array(authTag),
    keyId: input.activeKeyId,
  };
}

export function openEmbeddingCredential(input: {
  environment: CommerceEnvironment;
  purpose: CommerceEmbeddingPurpose;
  provider: string;
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  authTag: Uint8Array;
  keyId: string;
  keyring: CredentialKeyring;
}): string {
  const key = input.keyring[input.keyId];
  if (
    !(key instanceof Uint8Array) ||
    key.byteLength !== 32 ||
    input.nonce.byteLength !== 12 ||
    input.authTag.byteLength !== 16 ||
    input.ciphertext.byteLength < 1 ||
    input.ciphertext.byteLength > 8192
  ) {
    throw new Error(EMBEDDING_CREDENTIAL_ENCRYPTION_UNAVAILABLE);
  }

  try {
    const aad = createEmbeddingCredentialAad({
      environment: input.environment,
      purpose: input.purpose,
      provider: input.provider,
      keyId: input.keyId,
    });
    const decipher = createDecipheriv("aes-256-gcm", key, input.nonce);
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(Buffer.from(input.authTag));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(input.ciphertext)),
      decipher.final(),
    ]).toString("utf8");
    return validateEmbeddingCredentialSecret(plaintext);
  } catch {
    throw new Error(EMBEDDING_CREDENTIAL_ENCRYPTION_UNAVAILABLE);
  }
}
