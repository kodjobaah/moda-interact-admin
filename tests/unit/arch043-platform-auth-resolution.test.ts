import assert from "node:assert/strict";
import test from "node:test";
import { resolveAdminAuthCredentialsWithDependencies } from "../../src/lib/auth/platform-auth-resolution.ts";

const valid = { authSecret: "a".repeat(40), googleClientId: "google-id", googleClientSecret: "google-secret" };
const deps = (changes: Record<string, unknown> = {}) => ({
  environment: "development", isProductionNode: false,
  read: async () => null,
  decode: () => valid,
  environmentCredentials: () => valid,
  ...changes,
});

test("missing row alone uses the complete environment bundle", async () => {
  let fallbackCalls = 0;
  const result = await resolveAdminAuthCredentialsWithDependencies(deps({
    environmentCredentials: () => { fallbackCalls += 1; return valid; },
  }));
  assert.deepEqual(result, { ...valid, source: "environment", version: null });
  assert.equal(fallbackCalls, 1);
  await assert.rejects(() => resolveAdminAuthCredentialsWithDependencies(deps({
    environmentCredentials: () => ({ authSecret: valid.authSecret, googleClientId: valid.googleClientId }),
  })), /incomplete/);
});

test("configured database bundle takes precedence without env access", async () => {
  const result = await resolveAdminAuthCredentialsWithDependencies(deps({
    read: async () => ({ value: { sealed: true }, version: 5 }),
    environmentCredentials: () => { throw Error("No fallback allowed"); },
  }));
  assert.deepEqual(result, { ...valid, source: "database", version: 5 });
});

test("disabled, malformed, invalid versions and decryption failures fail closed", async () => {
  for (const row of [
    { value: { kind: "disabled", schemaVersion: 1 }, version: 3 },
    { value: { sealed: true }, version: 0 },
    { value: { sealed: true }, version: Number.NaN },
  ]) {
    await assert.rejects(() => resolveAdminAuthCredentialsWithDependencies(deps({
      read: async () => row,
      decode: () => { throw Error("private material should not leak"); },
      environmentCredentials: () => { throw Error("fallback invoked"); },
    })), /Invalid Admin authentication configuration/);
  }
});

test("database errors never become absent-row fallback", async () => {
  await assert.rejects(() => resolveAdminAuthCredentialsWithDependencies(deps({
    read: async () => { throw Error("database temporarily disconnected"); },
    environmentCredentials: () => { throw Error("fallback invoked"); },
  })), /configuration is unavailable/);
});

test("refuse environment mismatch and production development masquerade", async () => {
  await assert.rejects(() => resolveAdminAuthCredentialsWithDependencies(deps({ environment: "unrecognised" })), /Invalid Admin authentication environment/);
  await assert.rejects(() => resolveAdminAuthCredentialsWithDependencies(deps({ isProductionNode: true })), /Invalid Admin authentication environment/);
});
