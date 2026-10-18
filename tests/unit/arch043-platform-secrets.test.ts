import assert from "node:assert/strict";
import test from "node:test";
import { PLATFORM_SECRET_CONTRACTS, SECRET_PURPOSES } from "../../src/lib/admin/platform-configuration/secrets-contracts.ts";
import { validateSecretPayload } from "../../src/lib/admin/platform-configuration/secret-validation.ts";
import { secretAAD } from "../../src/lib/admin/platform-configuration/seal.ts";

const pair = { consumerKey: `ck_${"a".repeat(40)}`, consumerSecret: `cs_${"b".repeat(40)}` };
const r2 = { endpoint: `https://${"a".repeat(32)}.r2.cloudflarestorage.com`, bucket: "merchant-knowledge", accessKeyId: "r2-access", secretAccessKey: "r2-secret", maxUploadBytes: 10485760, maxXlsxUncompressedBytes: 52428800 };

test("thirteen closed secret purposes are registered once", () => {
  assert.deepEqual([...SECRET_PURPOSES], ["commerce.connectionKeys", "auth.admin", "auth.commerce", "commerce.bootstrap", "merchant.knowledge.r2", "woocommerce.auth", "shopify.oauth", "messaging.meta", "woocommerce.billing", "shopify.partner", "shopify.appEvents", "messaging.sender", "ai.providers"]);
  assert.equal(PLATFORM_SECRET_CONTRACTS.length, 13);
  for (const contract of PLATFORM_SECRET_CONTRACTS) {
    assert.equal(contract.kind, "secret");
    assert.equal(contract.requiredRole, "SUPER_ADMIN");
    assert.ok(contract.fields.length >= 1);
  }
});
test("auth requires three fields and adequate signing key", () => {
  const auth = { authSecret: "x".repeat(48), googleClientId: "google-id", googleClientSecret: "google-secret" };
  for (const key of ["auth.admin", "auth.commerce"]) {
    assert.deepEqual(validateSecretPayload(key, auth), auth);
    assert.throws(() => validateSecretPayload(key, { ...auth, authSecret: "short" }));
    assert.throws(() => validateSecretPayload(key, { ...auth, extra: "leak" }));
  }
});
test("bootstrap email selector is normalized, required, never a source default", () => {
  assert.deepEqual(validateSecretPayload("commerce.bootstrap", { adminEmail: "Admin@Example.com" }), { adminEmail: "admin@example.com" });
  assert.throws(() => validateSecretPayload("commerce.bootstrap", { adminEmail: "missing-at-sign" }));
  assert.throws(() => validateSecretPayload("commerce.bootstrap", { adminEmail: " " }));
});
test("R2 JSON remains atomic and requires numeric limits with cloudflare origin", () => {
  assert.deepEqual(validateSecretPayload("merchant.knowledge.r2", r2), r2);
  assert.throws(() => validateSecretPayload("merchant.knowledge.r2", { ...r2, accessKeyId: undefined }));
  assert.throws(() => validateSecretPayload("merchant.knowledge.r2", { ...r2, maxUploadBytes: "10485760" }));
  assert.throws(() => validateSecretPayload("merchant.knowledge.r2", { ...r2, maxUploadBytes: 52428801 }));
  assert.throws(() => validateSecretPayload("merchant.knowledge.r2", { ...r2, endpoint: "http://127.0.0.1" }));
  assert.throws(() => validateSecretPayload("merchant.knowledge.r2", { ...r2, secretAccessKey: "" }));
  assert.throws(() => validateSecretPayload("merchant.knowledge.r2", { ...r2, extra: "bad" }));
});
test("WooCommerce platform pair has exact consumer key shape", () => {
  assert.deepEqual(validateSecretPayload("woocommerce.auth", pair), pair);
  assert.throws(() => validateSecretPayload("woocommerce.auth", { ...pair, consumerKey: "ck_short" }));
  assert.throws(() => validateSecretPayload("woocommerce.auth", { ...pair, consumerSecret: "" }));
});
test("AAD is bound to environment, key and resulting revision", () => {
  const aad = secretAAD("production", "merchant.knowledge.r2", 3);
  assert.equal(aad, JSON.stringify(["moda-platform-config-v1", "production", "merchant.knowledge.r2", 3, 1]));
  assert.notEqual(secretAAD("production", "merchant.knowledge.r2", 4), aad);
  assert.notEqual(secretAAD("staging", "merchant.knowledge.r2", 3), aad);
  assert.throws(() => secretAAD("production", "other.secret", 3));
});

test("five reconciled groups use exact closed schemas", () => {
  const billing = { apiKey: "woo-billing-key", apiSecret: "woo-billing-secret" };
  assert.deepEqual(validateSecretPayload("woocommerce.billing", billing), billing);
  assert.throws(() => validateSecretPayload("woocommerce.billing", { ...billing, environment: "production" }));
  const partner = { accessToken: "shp-token", organizationId: "12345", appId: "54321", apiVersion: "2026-10" };
  assert.deepEqual(validateSecretPayload("shopify.partner", partner), partner);
  assert.deepEqual(validateSecretPayload("shopify.partner", { accessToken: "shp-token", organizationId: "12345", appId: "54321" }),
    { accessToken: "shp-token", organizationId: "12345", appId: "54321" });
  assert.throws(() => validateSecretPayload("shopify.partner", { ...partner, apiVersion: "latest" }));
  assert.throws(() => validateSecretPayload("shopify.partner", { ...partner, organizationId: "" }));
  const events = { clientId: "events-client", clientSecret: "events-secret" };
  assert.deepEqual(validateSecretPayload("shopify.appEvents", events), events);
  assert.throws(() => validateSecretPayload("shopify.appEvents", { ...events, extra: "unexpected" }));
  const sender = { accessToken: "meta-token", phoneNumberId: "1234567890", businessAccountId: "9876543210" };
  assert.deepEqual(validateSecretPayload("messaging.sender", sender), sender);
  assert.throws(() => validateSecretPayload("messaging.sender", { ...sender, phoneNumberId: "invalid/identity" }));
  assert.deepEqual(validateSecretPayload("ai.providers", { openAiApiKey: "provider-key" }), { openAiApiKey: "provider-key" });
  assert.throws(() => validateSecretPayload("ai.providers", { openAiSpeechApiKey: "legacy-key" }));
  assert.throws(() => validateSecretPayload("ai.providers", { groqSpeechApiKey: "legacy-key" }));
  assert.throws(() => validateSecretPayload("ai.providers", {}));
  assert.throws(() => validateSecretPayload("ai.providers", { openAiTranslationApiKey: "" }));
  assert.throws(() => validateSecretPayload("ai.providers", { OPENAI_API_KEY: "legacy" }));
});
test("reconciled secrets keep canonical AAD binding", () => {
  for (const purpose of ["woocommerce.billing", "shopify.partner", "shopify.appEvents", "messaging.sender", "ai.providers"]) {
    assert.equal(secretAAD("production", purpose, 2), JSON.stringify(["moda-platform-config-v1", "production", purpose, 2, 1]));
    assert.notEqual(secretAAD("production", purpose, 2), secretAAD("staging", purpose, 2));
  }
});
