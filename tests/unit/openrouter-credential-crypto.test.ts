import assert from "node:assert/strict";
import { createDecipheriv } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createCommerceOpenRouterCredentialAad,
  type CommerceEnvironment,
} from "@modainteract/moda-interact-shared/commerce/model";
import { sealOpenRouterCredential } from "../../src/lib/admin/openrouter-credential-crypto.ts";

const environment: CommerceEnvironment = "TEST";
const keyId = "arch024-test-key";
const key = new Uint8Array(Buffer.alloc(32, 11));
const secret = "  exact credential-é  ";

function decrypt(
  sealed: ReturnType<typeof sealOpenRouterCredential>,
  targetEnvironment = environment,
  targetKeyId = keyId,
): string {
  const decipher = createDecipheriv("aes-256-gcm", key, sealed.nonce);
  decipher.setAAD(
    Buffer.from(
      createCommerceOpenRouterCredentialAad({
        environment: targetEnvironment,
        keyId: targetKeyId,
      }),
      "utf8",
    ),
  );
  decipher.setAuthTag(sealed.authTag);
  return Buffer.concat([
    decipher.update(sealed.ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

test("seals exact UTF-8 secret with interoperable Shared AAD", () => {
  const sealed = sealOpenRouterCredential({
    environment,
    secret,
    keyring: { [keyId]: key },
    activeKeyId: keyId,
  });
  assert.equal(sealed.nonce.byteLength, 12);
  assert.equal(sealed.authTag.byteLength, 16);
  assert.equal(sealed.keyId, keyId);
  assert.equal(
    Buffer.from(sealed.ciphertext).includes(Buffer.from(secret)),
    false,
  );
  assert.equal(decrypt(sealed), secret);
  assert.throws(() => decrypt(sealed, "PRODUCTION"));
  assert.throws(() => decrypt(sealed, environment, "another-key"));
  const changedTag = { ...sealed, authTag: new Uint8Array(sealed.authTag) };
  changedTag.authTag[0] ^= 1;
  assert.throws(() => decrypt(changedTag));
  const changedCiphertext = {
    ...sealed,
    ciphertext: new Uint8Array(sealed.ciphertext),
  };
  changedCiphertext.ciphertext[0] ^= 1;
  assert.throws(() => decrypt(changedCiphertext));
});

test("production sealer uses Shared AAD and has no secret logging or fingerprinting", async () => {
  const source = await readFile(
    new URL(
      "../../src/lib/admin/openrouter-credential-crypto.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /createCommerceOpenRouterCredentialAad\(/);
  assert.match(source, /Buffer\.from\(aad, "utf8"\)/);
  assert.doesNotMatch(source, /console\.|createHash|fingerprint|digest\(/i);
  assert.doesNotMatch(source, /createDecipheriv/);
});
