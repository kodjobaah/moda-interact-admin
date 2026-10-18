import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { parseCredentialKeyring } from "@modainteract/moda-interact-shared/security/credentials/node";
import { mutateSecretWithDependencies, revealSecretFieldWithDependencies, readSecretHistory, readSecretStatus } from "../../src/lib/admin/platform-configuration/secret-service.ts";
import { test, after } from "node:test";
import { PrismaClient } from "@prisma/client";
import { createConfigurationRegistry, type ConfigurationContract } from "../../src/lib/admin/platform-configuration/contracts.ts";
import { writeConfiguration, readConfiguration, readConfigurationHistory } from "../../src/lib/admin/platform-configuration/repository.ts";
import { mutateConfigurationWithDependencies } from "../../src/lib/admin/platform-configuration/mutate.ts";

if (!process.env.ARCH043_DISPOSABLE_POSTGRES) throw new Error("Refusing to run against non-disposable PostgreSQL");
const db = new PrismaClient();
after(async () => { await db.$disconnect(); });
const environment = "test";
const actorId = "arch043-fixture-admin";
const fixture: ConfigurationContract = {
  key: "fixture.sample", title: "Fixture", description: "Test only", kind: "policy", canReset: true, requiredRole: "SUPER_ADMIN",
  defaults: { enabled: false, retryLimit: 2 },
  fields: [
    { name: "enabled", kind: "boolean", label: "Enabled", description: "Test only" },
    { name: "retryLimit", kind: "integer", label: "Retry limit", description: "Test only", min: 1, max: 5 },
  ],
};
const values = { enabled: true, retryLimit: 3 };
const input = (key: string, expectedVersion: number, newValues: Record<string, unknown> = values) => ({ key, expectedVersion, values: newValues, reason: "fixture change" });

// Use a unique allowed server-owned contract key per test, no cleanup needed on disposable DB.
function testContract(): string { return `fixture.t${randomUUID().replaceAll("-", "")}`; }
function testRegistry(key: string) { return createConfigurationRegistry([{ ...fixture, key }]); }
function write(key: string, expectedVersion: number, next: Record<string, unknown> = values, env = environment) {
  return mutateConfigurationWithDependencies(input(key, expectedVersion, next), "save", { principal: { role: "SUPER_ADMIN" }, environment: env, actorId, db, registry: testRegistry(key) });
}
function reset(key: string, expectedVersion: number) {
  return mutateConfigurationWithDependencies({ key, expectedVersion, reason: "reset" }, "reset", { principal: { role: "SUPER_ADMIN" }, environment, actorId, db, registry: testRegistry(key) });
}

test("generic test-only group saves revision 1, audit, updates and preserves version across reset", async () => {
  const key = testContract(); const testRegistryValue = testRegistry(key);
  assert.equal((await write(key, 0)).version, 1);
  assert.equal((await readConfiguration(db, environment, key, testRegistryValue)).version, 1);
  assert.equal((await write(key, 1, { enabled: false, retryLimit: 4 })).version, 2);
  assert.equal((await reset(key, 2)).version, 3);
  assert.deepEqual((await readConfiguration(db, environment, key, testRegistryValue)).value, fixture.defaults);
  await assert.rejects(write(key, 1), /CONFLICT|Policy changed/);
  const audit = await readConfigurationHistory(db, environment, key);
  assert.equal(audit.entries.length, 3);
  assert.deepEqual(audit.entries.map((record) => record.resultingVersion), [3, 2, 1]);
  assert.equal(audit.entries[0].actorId, actorId);
  assert.deepEqual(audit.entries[0].afterValue, fixture.defaults);
  assert.equal((await db.platformConfiguration.findUnique({ where: { environment_key: { environment, key } } }))?.version, 3);
});

test("test-only added field persists through generic mutation and audit", async () => {
  const key = testContract();
  const addedField: ConfigurationContract["fields"][number] = {
    name: "displayLabel", kind: "string", label: "Display label", description: "Test-only extension", maxLength: 24,
  };
  const extended = { ...fixture, key, defaults: { ...fixture.defaults, displayLabel: "default" }, fields: [...fixture.fields, addedField] };
  const registry = createConfigurationRegistry([extended]);
  const extendedValues = { ...values, displayLabel: "generic-value" };
  const saved = await mutateConfigurationWithDependencies(input(key, 0, extendedValues), "save", {
    principal: { role: "SUPER_ADMIN" }, environment, actorId, db, registry,
  });
  assert.equal(saved.version, 1);
  assert.deepEqual((await readConfiguration(db, environment, key, registry)).value, extendedValues);
  const history = await readConfigurationHistory(db, environment, key);
  assert.equal(history.entries.length, 1);
  assert.deepEqual(history.entries[0].afterValue, extendedValues);
});

test("concurrent CAS: at most one update and exactly one audit", async () => {
  const key = testContract(); await write(key, 0);
  const results = await Promise.allSettled([write(key, 1, { enabled: false, retryLimit: 4 }), write(key, 1, { enabled: true, retryLimit: 5 })]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  const history = await readConfigurationHistory(db, environment, key);
  assert.equal(history.entries.length, 2);
});

test("audit insertion failure rolls back corresponding value update", async () => {
  const key = testContract(); await write(key, 0);
  // Database enforces non-empty audit actor and strictly correlated revision.
  await assert.rejects(writeConfiguration(db, { environment, key, expectedVersion: 1, values: { enabled: true, retryLimit: 4 }, actorId: "", reason: "invalid actor" }));
  assert.equal((await readConfiguration(db, environment, key, testRegistry(key))).version, 1);
  assert.equal((await readConfigurationHistory(db, environment, key)).entries.length, 1);
});

test("environment scoping isolates policies and audit; replay cannot switch environment", async () => {
  const key = testContract(); await write(key, 0);
  assert.equal((await readConfiguration(db, "production", key, testRegistry(key))).version, 0);
  assert.equal((await readConfigurationHistory(db, "production", key)).entries.length, 0);
  await write(key, 0, values, "development");
  assert.equal((await readConfiguration(db, "development", key, testRegistry(key))).version, 1);
  assert.equal((await readConfigurationHistory(db, environment, key)).entries.length, 1);
});

test("pagination and cursor scope enforced", async () => {
  const key = testContract();
  for (let version = 0; version < 25; version += 1) await write(key, version);
  const first = await readConfigurationHistory(db, environment, key);
  assert.equal(first.entries.length, 20);
  assert.ok(first.nextCursor);
  const second = await readConfigurationHistory(db, environment, key, first.nextCursor!);
  assert.equal(second.entries.length, 5);
  assert.equal(second.nextCursor, null);
  await assert.rejects(readConfigurationHistory(db, "production", key, first.nextCursor!), /Invalid history cursor/);
});

test("reject role spoofing, request environment and secret-purpose fields, and new field without values", async () => {
  const key = testContract();
  const registryValue = testRegistry(key);
  await assert.rejects(mutateConfigurationWithDependencies({ ...input(key, 0), environment: "production" }, "save", { principal: { role: "SUPER_ADMIN" }, environment, actorId, db, registry: registryValue }), /Invalid configuration request/);
  await assert.rejects(mutateConfigurationWithDependencies(input(key, 0), "save", { principal: { role: "PLATFORM_ADMIN" }, environment, actorId, db, registry: registryValue }), /SUPER_ADMIN/);
  await assert.rejects(mutateConfigurationWithDependencies(input(key, 0, { ...values, secret: "danger" } as typeof values), "save", { principal: { role: "SUPER_ADMIN" }, environment, actorId, db, registry: registryValue }), /Correct the highlighted/);
  const extended = createConfigurationRegistry([{ ...fixture, key, fields: [...fixture.fields, { name: "newField", label: "New", description: "Test", kind: "string", maxLength: 20 }] }]);
  await assert.rejects(mutateConfigurationWithDependencies(input(key, 0), "save", { principal: { role: "SUPER_ADMIN" }, environment, actorId, db, registry: extended }), /Correct the highlighted/);
  assert.equal((await readConfigurationHistory(db, environment, key)).entries.length, 0);
});

const wrappingKeyring = parseCredentialKeyring(JSON.stringify({ "arch043-integration-key": Buffer.alloc(32, 31).toString("base64") }));
const secretDependencies = {
  principal: { id: actorId, role: "SUPER_ADMIN", developmentBypass: false },
  environment, db, wrapping: { keyring: wrappingKeyring, activeKeyId: "arch043-integration-key" },
};
const pair = { consumerKey: `ck_${"a".repeat(40)}`, consumerSecret: `cs_${"b".repeat(40)}` };

// These share the known key, so they run sequentially and clear their state
// inside the disposable database. They do not depend on merchant credentials.
test("ARCH-043 secret: initial setup, audited reveal without revision, and partial rotation", async () => {
  const key = "woocommerce.auth";
  assert.equal((await readSecretStatus(db, environment, key)).version, 0);
  const first = await mutateSecretWithDependencies({ key, operation: "set", expectedVersion: 0, values: pair }, secretDependencies);
  assert.equal(first.version, 1);
  const recorded: Array<Record<string, unknown>> = [];
  const shown = await revealSecretFieldWithDependencies({ key, field: "consumerSecret", expectedVersion: 1 }, {
    ...secretDependencies, recordReveal: (details) => { recorded.push(details); },
  });
  assert.deepEqual(shown, { field: "consumerSecret", value: pair.consumerSecret, version: 1 });
  assert.deepEqual(recorded, [{ actorId, environment, key, field: "consumerSecret", version: 1 }]);
  assert.equal((await readSecretHistory(db, environment, key)).entries.length, 1);
  await assert.rejects(revealSecretFieldWithDependencies({ key, field: "consumerSecret", expectedVersion: 1 }, {
    ...secretDependencies, principal: { id: "operator", role: "ADMIN", developmentBypass: false }, recordReveal: () => {},
  }), /SUPER_ADMIN/);
  await assert.rejects(revealSecretFieldWithDependencies({ key, field: "unknown", expectedVersion: 1 }, secretDependencies), /Unsupported/);
  await assert.rejects(revealSecretFieldWithDependencies({ key, field: "consumerKey", expectedVersion: 1, environment: "production" }, secretDependencies), /Invalid secret/);
  const rotatedSecret = `cs_${"c".repeat(40)}`;
  await mutateSecretWithDependencies({ key, operation: "rotate", expectedVersion: 1,
    values: { consumerSecret: rotatedSecret }, reason: "scheduled-rotation", confirmation: "ROTATE" }, secretDependencies);
  assert.equal((await revealSecretFieldWithDependencies({ key, field: "consumerKey", expectedVersion: 2 }, {
    ...secretDependencies, recordReveal: () => {},
  })).value, pair.consumerKey);
  assert.equal((await revealSecretFieldWithDependencies({ key, field: "consumerSecret", expectedVersion: 2 }, {
    ...secretDependencies, recordReveal: () => {},
  })).value, rotatedSecret);
  const history = await readSecretHistory(db, environment, key);
  assert.deepEqual(history.entries.map((entry) => entry.reason), ["scheduled-rotation", "initial-setup"]);
  assert.deepEqual(history.entries.map((entry) => entry.resultingVersion), [2, 1]);
  const serialized = JSON.stringify(history);
  assert.ok(!serialized.includes(pair.consumerSecret) && !serialized.includes(rotatedSecret));
  await assert.rejects(revealSecretFieldWithDependencies({ key, field: "consumerSecret", expectedVersion: 1 }, secretDependencies), /Refresh/);
});

test("ARCH-043 secret: revoke is terminal, only set may reactivate and version remains monotonic", async () => {
  const key = "woocommerce.auth";
  await mutateSecretWithDependencies({ key, operation: "revoke", expectedVersion: 2,
    reason: "decommission", confirmation: "REVOKE" }, secretDependencies);
  assert.deepEqual((await readSecretStatus(db, environment, key)).configured, false);
  await assert.rejects(revealSecretFieldWithDependencies({ key, field: "consumerSecret", expectedVersion: 3 }, secretDependencies), /No active/);
  await assert.rejects(mutateSecretWithDependencies({ key, operation: "rotate", expectedVersion: 3,
    values: { consumerSecret: `cs_${"d".repeat(40)}` }, reason: "scheduled-rotation", confirmation: "ROTATE" }, secretDependencies));
  assert.equal((await mutateSecretWithDependencies({ key, operation: "set", expectedVersion: 3, values: pair }, secretDependencies)).version, 4);
  assert.deepEqual((await readSecretHistory(db, environment, key)).entries.map((entry) => entry.reason),
    ["initial-setup", "decommission", "scheduled-rotation", "initial-setup"]);
});

test("ARCH-043 secret: update non-credential fields without rotating or revealing credentials", async () => {
  const key = "merchant.knowledge.r2";
  assert.equal((await readSecretStatus(db, environment, key)).version, 0);
  const r2 = { endpoint: `https://${"a".repeat(32)}.r2.cloudflarestorage.com`, bucket: "merchant-knowledge",
    accessKeyId: "test-r2-access", secretAccessKey: "test-r2-secret", maxUploadBytes: 1048576, maxXlsxUncompressedBytes: 2097152 };
  await mutateSecretWithDependencies({ key, operation: "set", expectedVersion: 0, values: r2 }, secretDependencies);
  await mutateSecretWithDependencies({ key, operation: "update", expectedVersion: 1, values: { maxUploadBytes: 1048577 } }, secretDependencies);
  assert.equal((await revealSecretFieldWithDependencies({ key, field: "secretAccessKey", expectedVersion: 2 }, {
    ...secretDependencies, recordReveal: () => {},
  })).value, r2.secretAccessKey);
  assert.equal((await revealSecretFieldWithDependencies({ key, field: "maxUploadBytes", expectedVersion: 2 }, {
    ...secretDependencies, recordReveal: () => {},
  })).value, 1048577);
  assert.equal((await readSecretHistory(db, environment, key)).entries[0].reason, "configuration-update");
  await assert.rejects(mutateSecretWithDependencies({ key, operation: "update", expectedVersion: 2,
    values: { secretAccessKey: "different" } }, secretDependencies), /Rotate credentials/);
  await assert.rejects(mutateSecretWithDependencies({ key, operation: "rotate", expectedVersion: 2,
    values: { bucket: "other-bucket" }, reason: "scheduled-rotation", confirmation: "ROTATE" }, secretDependencies), /requires changing/);
});
