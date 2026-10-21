import assert from "node:assert/strict";
import test from "node:test";
import { createConfigUnsealKeyring, sealSecret, unsealSecret } from "../../src/lib/admin/platform-configuration/seal.ts";
import { validateSecretPayload } from "../../src/lib/admin/platform-configuration/secret-validation.ts";
import {
  resolveShopifyPartnerCredentialsWithDependencies,
  type ShopifyPartnerSecret,
} from "../../src/lib/admin/shopify-partner-credentials.ts";

const purpose = "shopify.partner";
const root = JSON.stringify({ "arch043-test": Buffer.alloc(32, 0x61).toString("base64") });
const wrapping = createConfigUnsealKeyring(root, "arch043-test");
const partner = { accessToken: "partner-token-sensitive", organizationId: "123456", appId: "gid://shopify/App/413747675137", apiVersion: "2026-10" };

function validate(value: unknown): ShopifyPartnerSecret {
  const data = validateSecretPayload(purpose, value);
  return {
    accessToken: data.accessToken as string,
    organizationId: data.organizationId as string,
    appId: data.appId as string,
    ...(data.apiVersion !== undefined ? { apiVersion: data.apiVersion as string } : {}),
  };
}
function sealed(environment: string, version: number, data = partner) {
  return sealSecret({ environment, key: purpose, version, plaintext: JSON.stringify(data), wrapping });
}
function resolve(environment: string, row: { version: number; value: unknown } | null) {
  return resolveShopifyPartnerCredentialsWithDependencies({
    environment,
    isProductionNode: false,
    read: async () => row,
    decode: (current) => JSON.parse(unsealSecret({ environment, key: purpose, version: current.version, value: current.value, wrapping })) as unknown,
    validate,
  });
}

test("actual ARCH-039 sealing, AAD, validation and per-operation revision work together", async () => {
  assert.deepEqual(await resolve("test", { version: 4, value: sealed("test", 4) }), {
    ...partner, version: 4,
  });
  const rotated = { ...partner, accessToken: "partner-token-rotated" };
  const updated = sealSecret({ environment: "test", key: purpose, version: 5, plaintext: JSON.stringify(rotated), wrapping });
  assert.deepEqual(await resolve("test", { version: 5, value: updated }), { ...rotated, version: 5 });
});

test("tampering, revoked tombstones, and revision mismatch reject without returning sensitive information", async () => {
  const original = sealed("test", 2);
  for (const row of [
    { version: 2, value: { kind: "disabled", schemaVersion: 1 } },
    { version: 3, value: original },
    { version: 2, value: { ...original, authTag: Buffer.alloc(16, 0).toString("base64") } },
  ]) {
    await assert.rejects(() => resolve("test", row), (error: unknown) => error instanceof Error &&
      error.message === "Invalid Shopify Partner configuration." && !error.message.includes(partner.accessToken));
  }
});

test("wrong environment and invalid plaintext shape fail closed", async () => {
  await assert.rejects(() => resolve("production", { version: 2, value: sealed("test", 2) }),
    /Invalid Shopify Partner configuration/);
  const bad = { ...partner, organizationId: "not valid!" };
  const stored = sealSecret({ environment: "test", key: purpose, version: 6, plaintext: JSON.stringify(bad), wrapping });
  await assert.rejects(() => resolve("test", { version: 6, value: stored }),
    /Invalid Shopify Partner configuration/);
});
