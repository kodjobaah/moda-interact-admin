import assert from "node:assert/strict";
import test from "node:test";
import { canManagePlatformSecrets } from "../../src/lib/admin/platform-configuration/secret-access.ts";

const principal = { id: "development-platform-admin", role: "SUPER_ADMIN", developmentBypass: true };
const ENV = ["NODE_ENV", "DEPLOYMENT_ENVIRONMENT_NAME", "ADMIN_DEVELOPMENT_AUTH_BYPASS"] as const;
function withEnvironment(values: Record<string, string>, run: () => void) {
  const before = Object.fromEntries(ENV.map((key) => [key, process.env[key]]));
  try {
    for (const key of ENV) delete process.env[key];
    Object.assign(process.env, values);
    run();
  } finally {
    for (const key of ENV) {
      if (before[key] === undefined) delete process.env[key];
      else Reflect.set(process.env, key, before[key]);
    }
  }
}

test("development bypass SUPER_ADMIN can manage secrets when explicitly active", () => {
  withEnvironment({ NODE_ENV: "development", DEPLOYMENT_ENVIRONMENT_NAME: "development", ADMIN_DEVELOPMENT_AUTH_BYPASS: "true" }, () => {
    assert.equal(canManagePlatformSecrets(principal), true);
    assert.equal(canManagePlatformSecrets({ ...principal, role: "PLATFORM_ADMIN" }), false);
    assert.equal(canManagePlatformSecrets({ ...principal, id: "forged-actor" }), false);
    assert.equal(canManagePlatformSecrets({ ...principal, id: "bad actor" }), false);
  });
});

test("disabled development bypass does not authorise synthetic identity", () => {
  withEnvironment({ NODE_ENV: "development", DEPLOYMENT_ENVIRONMENT_NAME: "development", ADMIN_DEVELOPMENT_AUTH_BYPASS: "false" }, () => {
    assert.equal(canManagePlatformSecrets(principal), false);
  });
});

test("production and staging cannot authorise a development bypass principal", () => {
  for (const values of [
    { NODE_ENV: "production", DEPLOYMENT_ENVIRONMENT_NAME: "production", ADMIN_DEVELOPMENT_AUTH_BYPASS: "true" },
    { NODE_ENV: "production", DEPLOYMENT_ENVIRONMENT_NAME: "development", ADMIN_DEVELOPMENT_AUTH_BYPASS: "true" },
    { NODE_ENV: "development", DEPLOYMENT_ENVIRONMENT_NAME: "staging", ADMIN_DEVELOPMENT_AUTH_BYPASS: "true" },
  ]) withEnvironment(values, () => assert.equal(canManagePlatformSecrets(principal), false));
});

test("real SUPER_ADMIN is accepted independently of the development bypass", () => {
  withEnvironment({ NODE_ENV: "production", DEPLOYMENT_ENVIRONMENT_NAME: "production", ADMIN_DEVELOPMENT_AUTH_BYPASS: "false" }, () => {
    assert.equal(canManagePlatformSecrets({ id: "verified-admin-id", role: "SUPER_ADMIN", developmentBypass: false }), true);
    assert.equal(canManagePlatformSecrets({ id: "verified-admin-id", role: "PLATFORM_ADMIN", developmentBypass: false }), false);
    assert.equal(canManagePlatformSecrets({ id: "", role: "SUPER_ADMIN", developmentBypass: false }), false);
  });
});
