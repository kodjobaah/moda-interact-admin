import assert from "node:assert/strict";
import { createDecipheriv } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createCommerceTranslationProviderCredentialAad,
  type CommerceEnvironment,
} from "@modainteract/moda-interact-shared/commerce/model";
import { sealTranslationProviderCredential } from "../../src/lib/admin/translation-credential-crypto.ts";

const environment: CommerceEnvironment = "TEST";
const provider = "openai";
const keyId = "arch029-test-key";
const key = new Uint8Array(Buffer.alloc(32, 29));
const secret = "  exact translation credential-é  ";

function decrypt(
  sealed: ReturnType<typeof sealTranslationProviderCredential>,
  targetEnvironment = environment,
  targetProvider = provider,
  targetKeyId = keyId,
): string {
  const decipher = createDecipheriv("aes-256-gcm", key, sealed.nonce);
  decipher.setAAD(
    Buffer.from(
      createCommerceTranslationProviderCredentialAad({
        environment: targetEnvironment,
        provider: targetProvider,
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

test("translation credential sealer interoperates with Shared AAD", () => {
  const sealed = sealTranslationProviderCredential({
    environment,
    provider,
    secret,
    keyring: { [keyId]: key },
    activeKeyId: keyId,
  });
  assert.equal(sealed.nonce.byteLength, 12);
  assert.equal(sealed.authTag.byteLength, 16);
  assert.equal(sealed.keyId, keyId);
  assert.equal(decrypt(sealed), secret);
  assert.throws(() => decrypt(sealed, "PRODUCTION"));
  assert.throws(() => decrypt(sealed, environment, "other-provider"));
  assert.throws(() => decrypt(sealed, environment, provider, "another-key"));
});

test("production translation sealer uses Shared AAD and never decrypts", async () => {
  const source = await readFile(
    new URL(
      "../../src/lib/admin/translation-credential-crypto.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /createCommerceTranslationProviderCredentialAad\(/);
  assert.match(source, /provider: input\.provider/);
  assert.doesNotMatch(source, /createDecipheriv|console\.|fingerprint|digest\(/i);
});
