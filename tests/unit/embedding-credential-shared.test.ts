import assert from "node:assert/strict";
import test from "node:test";
import {
  createCommerceEmbeddingCredentialAad,
  decryptCredential,
  encryptCredential,
  parseCredentialKeyring,
  resolveActiveCredentialKey,
} from "@modainteract/moda-interact-shared/security/credentials/node";

const secret = "embed-test-credential-α";
const keyId = "embed_2026";
const configuredKey = Buffer.alloc(32, 0x42).toString("base64");
const keyring = parseCredentialKeyring(JSON.stringify({ [keyId]: configuredKey }));
const activeKeyId = resolveActiveCredentialKey(keyring, keyId);
const identity = {
  environment: "PRODUCTION" as const,
  purpose: "MERCHANT_KNOWLEDGE" as const,
  provider: "openai",
  keyId,
};

test("Admin embedding ciphertext decrypts using published Shared without a writer selector", () => {
  const aad = createCommerceEmbeddingCredentialAad(identity);
  assert.equal(
    aad,
    '{"credentialType":"EMBEDDING","environment":"PRODUCTION","keyId":"embed_2026","provider":"openai","purpose":"MERCHANT_KNOWLEDGE"}',
  );
  const sealed = encryptCredential({ keyring, activeKeyId, plaintext: secret, aad });
  // Mimic Prisma Bytes column reconstruction by an independent authorised reader.
  const persisted = {
    keyId: sealed.keyId,
    ciphertext: Uint8Array.from(sealed.ciphertext),
    nonce: Uint8Array.from(sealed.nonce),
    authTag: Uint8Array.from(sealed.authTag),
  };
  assert.equal(decryptCredential({ keyring, envelope: persisted, aad }), secret);
});

test("embedding AAD binds environment, purpose, provider and envelope key", () => {
  const aad = createCommerceEmbeddingCredentialAad(identity);
  const envelope = encryptCredential({ keyring, activeKeyId, plaintext: secret, aad });
  const variants = [
    { ...identity, environment: "TEST" as const },
    { ...identity, purpose: "REFERENCE_TAXONOMY" as const },
    { ...identity, provider: "different" },
    { ...identity, keyId: "other_key" },
  ];
  for (const variant of variants) {
    assert.throws(() => decryptCredential({
      keyring, envelope, aad: createCommerceEmbeddingCredentialAad(variant),
    }));
  }
});

test("embedding ciphertext, nonce and authTag tampering fail authentication", () => {
  const aad = createCommerceEmbeddingCredentialAad(identity);
  const envelope = encryptCredential({ keyring, activeKeyId, plaintext: secret, aad });
  for (const field of ["ciphertext", "nonce", "authTag"] as const) {
    const bytes = Uint8Array.from(envelope[field]);
    bytes[0] ^= 0xff;
    assert.throws(() => decryptCredential({ keyring, aad, envelope: { ...envelope, [field]: bytes } }));
  }
  assert.throws(() => decryptCredential({
    keyring, aad, envelope: { ...envelope, keyId: "unknown" },
  }));
});

test("malformed encryption configuration is rejected instead of generating keys", () => {
  assert.throws(() => parseCredentialKeyring(undefined));
  assert.throws(() => parseCredentialKeyring("{}"));
  assert.throws(() => parseCredentialKeyring('{"key":"not-base64"}'));
});
