import assert from "node:assert/strict";
import test from "node:test";
import { decode, encode } from "next-auth/jwt";
import { resolveAdminAuthCredentialsWithDependencies } from "../../src/lib/auth/platform-auth-resolution";

const salt = "moda-admin.session-token";
const firstSecret = "a".repeat(48);
const rotatedSecret = "b".repeat(48);
const first = {
  authSecret: firstSecret,
  googleClientId: "google-client-original",
  googleClientSecret: "google-secret-original",
};

async function readSession(token: string, secret: string) {
  // Auth.js may return null or reject a JWT that was encrypted with another key.
  // In either case the caller must not treat it as an authenticated session.
  try {
    return await decode({ token, secret, salt });
  } catch {
    return null;
  }
}

async function newSession(secret: string, maxAge = 60 * 60) {
  return encode({ token: { sub: "platform-admin-fixture", providerSubject: "google-subject-fixture" }, secret, salt, maxAge });
}

async function credentialsFromDatabase(version: number, values: typeof first) {
  return resolveAdminAuthCredentialsWithDependencies({
    environment: "development",
    isProductionNode: false,
    read: async () => ({ version, value: { kind: "sealed" } }),
    decode: () => values,
    environmentCredentials: () => { throw new Error("Environment fallback must not be evaluated"); },
  });
}

test("Auth.js JWT round trip uses the resolved database signing secret", async () => {
  const resolved = await credentialsFromDatabase(1, first);
  assert.equal(resolved.source, "database");
  const token = await newSession(resolved.authSecret);
  const session = await readSession(token, resolved.authSecret);
  assert.equal(session?.sub, "platform-admin-fixture");
  assert.equal(session?.providerSubject, "google-subject-fixture");
});

test("rotating AUTH_SECRET invalidates prior JWTs and signs new sessions only with the new key", async () => {
  const before = await credentialsFromDatabase(2, first);
  const oldToken = await newSession(before.authSecret);
  const after = await credentialsFromDatabase(3, { ...first, authSecret: rotatedSecret });
  assert.equal(after.version, 3);
  assert.equal(await readSession(oldToken, after.authSecret), null);
  assert.ok(await readSession(oldToken, before.authSecret));
  const newToken = await newSession(after.authSecret);
  assert.ok(await readSession(newToken, after.authSecret));
  assert.equal(await readSession(newToken, before.authSecret), null);
});

test("rotating Google OAuth credentials without changing AUTH_SECRET preserves existing JWTs", async () => {
  const before = await credentialsFromDatabase(5, first);
  const token = await newSession(before.authSecret);
  const after = await credentialsFromDatabase(6, {
    ...first,
    googleClientId: "rotated-google-client",
    googleClientSecret: "rotated-google-secret",
  });
  assert.equal(after.googleClientId, "rotated-google-client");
  assert.ok(await readSession(token, after.authSecret));
});

test("expired JWTs are not accepted under the correct signing key", async () => {
  const token = await newSession(firstSecret, -120);
  assert.equal(await readSession(token, firstSecret), null);
});

test("switching from absent-row environment credentials to DB credentials does not silently preserve old JWTs", async () => {
  const environment = await resolveAdminAuthCredentialsWithDependencies({
    environment: "development",
    isProductionNode: false,
    read: async () => null,
    decode: () => { throw new Error("Absent row must not be decoded"); },
    environmentCredentials: () => ({ ...first, authSecret: rotatedSecret }),
  });
  assert.equal(environment.source, "environment");
  const oldToken = await newSession(environment.authSecret);
  const database = await credentialsFromDatabase(1, first);
  assert.equal(await readSession(oldToken, database.authSecret), null);
});
