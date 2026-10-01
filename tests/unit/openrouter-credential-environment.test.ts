import assert from "node:assert/strict";
import test from "node:test";
import { resolveCommerceEnvironment } from "../../src/lib/admin/openrouter-credential-environment.ts";

const originalDeployment = process.env.DEPLOYMENT_ENVIRONMENT_NAME;
const originalNodeEnv = process.env.NODE_ENV;

test("deployment environment takes precedence and maps only supported names", () => {
  for (const [name, expected] of [
    ["local", "LOCAL"],
    ["test", "TEST"],
    ["development", "DEVELOPMENT"],
    ["staging", "STAGING"],
    ["production", "PRODUCTION"],
  ] as const) {
    process.env.DEPLOYMENT_ENVIRONMENT_NAME = ` ${name.toUpperCase()} `;
    Reflect.set(process.env, "NODE_ENV", "production");
    assert.equal(resolveCommerceEnvironment(), expected);
  }
});

test("blank deployment name falls back to NODE_ENV and unsupported values fail closed", () => {
  process.env.DEPLOYMENT_ENVIRONMENT_NAME = "  ";
  Reflect.set(process.env, "NODE_ENV", "test");
  assert.equal(resolveCommerceEnvironment(), "TEST");
  process.env.DEPLOYMENT_ENVIRONMENT_NAME = "unknown";
  assert.throws(() => resolveCommerceEnvironment(), {
    message: "Commerce deployment environment is invalid.",
  });
  process.env.DEPLOYMENT_ENVIRONMENT_NAME = " ";
  Reflect.set(process.env, "NODE_ENV", "unknown");
  assert.throws(() => resolveCommerceEnvironment());
});

test.after(() => {
  if (originalDeployment === undefined)
    delete process.env.DEPLOYMENT_ENVIRONMENT_NAME;
  else process.env.DEPLOYMENT_ENVIRONMENT_NAME = originalDeployment;
  if (originalNodeEnv === undefined)
    Reflect.deleteProperty(process.env, "NODE_ENV");
  else Reflect.set(process.env, "NODE_ENV", originalNodeEnv);
});
