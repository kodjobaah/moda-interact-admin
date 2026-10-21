import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveShopifyPartnerCredentialsWithDependencies,
  type ShopifyPartnerCredentialDependencies,
  type ShopifyPartnerSecret,
} from "../../src/lib/admin/shopify-partner-credentials.ts";

const partner: ShopifyPartnerSecret = {
  accessToken: "partner-secret",
  organizationId: "12345",
  appId: "gid://shopify/App/413747675137",
};

function validate(value: unknown): ShopifyPartnerSecret {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("invalid tuple");
  const fields = value as Record<string, unknown>;
  if (Object.keys(fields).some((field) => !["accessToken", "organizationId", "appId", "apiVersion"].includes(field)) ||
      ["accessToken", "organizationId", "appId"].some((field) => typeof fields[field] !== "string" || !fields[field]) ||
      (fields.apiVersion !== undefined && !/^20\d\d-(?:01|04|07|10)$/.test(String(fields.apiVersion)))) {
    throw Error("invalid tuple");
  }
  return value as ShopifyPartnerSecret;
}

function deps(overrides: Partial<ShopifyPartnerCredentialDependencies> = {}): ShopifyPartnerCredentialDependencies {
  return {
    environment: "production",
    isProductionNode: true,
    read: async () => ({ version: 1, value: "encrypted" }),
    decode: () => partner,
    validate,
    ...overrides,
  };
}

test("reads one database revision and supplies the default API version", async () => {
  let reads = 0;
  const resolved = await resolveShopifyPartnerCredentialsWithDependencies(deps({
    read: async () => { reads += 1; return { version: 7, value: "encrypted" }; },
  }));
  assert.deepEqual(resolved, { ...partner, apiVersion: "2026-07", version: 7 });
  assert.equal(reads, 1);
});

test("rotation is visible on the next operation without a credential cache", async () => {
  let revision = 2;
  const options = deps({
    read: async () => ({ version: revision, value: "encrypted" }),
    decode: (row) => ({ ...partner, accessToken: `secret-revision-${row.version}`, apiVersion: "2026-10" }),
  });
  const first = await resolveShopifyPartnerCredentialsWithDependencies(options);
  revision = 3;
  const second = await resolveShopifyPartnerCredentialsWithDependencies(options);
  assert.equal(first.version, 2);
  assert.equal(second.version, 3);
  assert.equal(second.accessToken, "secret-revision-3");
  assert.equal(second.apiVersion, "2026-10");
});

test("a missing database record always fails closed", async () => {
  await assert.rejects(() => resolveShopifyPartnerCredentialsWithDependencies(deps({
    read: async () => null,
    decode: () => { throw Error("must not decode absent record"); },
  })), (error: unknown) => error instanceof Error &&
    error.message === "Shopify Partner API is not configured.");
});

test("disabled, tampered, undecryptable and invalid-revision database records fail closed", async () => {
  for (const row of [
    { version: 1, value: { kind: "disabled", schemaVersion: 1 } },
    { version: 1, value: { kind: "sealed", ciphertext: "tampered" } },
    { version: 1, value: "wrong-key" },
    { version: 0, value: "encrypted" },
  ]) {
    await assert.rejects(() => resolveShopifyPartnerCredentialsWithDependencies(deps({
      read: async () => row,
      decode: () => { throw Error("private-secret-must-not-appear"); },
    })), (error: unknown) => error instanceof Error &&
      error.message === "Invalid Shopify Partner configuration.");
  }
});

test("database outages fail closed without leaking the original exception", async () => {
  await assert.rejects(() => resolveShopifyPartnerCredentialsWithDependencies(deps({
    read: async () => { throw Error("private database password"); },
  })), (error: unknown) => error instanceof Error &&
    error.message === "Shopify Partner configuration is unavailable.");
});

test("invalid deployment environment and production masquerade reject before querying", async () => {
  for (const config of [
    { environment: "unknown" },
    { environment: "development", isProductionNode: true },
  ]) {
    await assert.rejects(() => resolveShopifyPartnerCredentialsWithDependencies(deps({
      ...config, read: () => { throw Error("read must not occur"); },
    })), /Invalid Shopify Partner configuration environment/);
  }
});

test("malformed decrypted fields cannot surface sensitive values", async () => {
  for (const malformed of [
    { ...partner, appId: undefined, accessToken: "sensitive-raw-token" },
    { ...partner, apiVersion: "not-version" },
    { ...partner, unexpected: "value" },
  ]) {
    await assert.rejects(() => resolveShopifyPartnerCredentialsWithDependencies(deps({
      decode: () => malformed,
    })), (error: unknown) => error instanceof Error &&
      error.message === "Invalid Shopify Partner configuration.");
  }
});
