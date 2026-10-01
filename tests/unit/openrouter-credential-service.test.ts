import assert from "node:assert/strict";
import test from "node:test";
import {
  OPENROUTER_CREDENTIAL_ERRORS,
  mutateOpenRouterCredentialInTransaction,
  replaceOpenRouterCredential,
  setOpenRouterCredential,
  type OpenRouterCredentialMutation,
} from "../../src/lib/admin/openrouter-credential.ts";
import type { PlatformAdminPrincipal } from "../../src/lib/auth/platform-admin.ts";

const environment = "TEST" as const;
const superAdmin: PlatformAdminPrincipal = {
  id: "admin-1",
  role: "SUPER_ADMIN",
  developmentBypass: false,
};
const admin: PlatformAdminPrincipal = {
  ...superAdmin,
  role: "ADMIN",
};

function sealed(seed: number) {
  return {
    ciphertext: new Uint8Array([seed, seed + 1]),
    nonce: new Uint8Array(12).fill(seed),
    authTag: new Uint8Array(16).fill(seed),
    keyId: "test-key",
  };
}

function transactionFor(options: { auditFailure?: boolean } = {}) {
  let current: Record<string, unknown> | null = null;
  const audits: Array<Record<string, unknown>> = [];
  const auditBeforeFailure = options.auditFailure
    ? async () => {
        throw new Error("audit failure");
      }
    : null;
  const transaction = {
    commerceOpenRouterCredential: {
      findUnique: async () => {
        if (!current) return null;
        const value = current;
        return {
          editVersion: value.editVersion,
          updatedAt: value.updatedAt,
          updatedByAdminId: value.updatedByAdminId,
        };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (current)
          throw Object.assign(new Error("unique"), { code: "P2002" });
        current = { ...data, updatedAt: new Date("2026-01-01T00:00:00.000Z") };
        return current;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        if (
          !current ||
          current.environment !== where.environment ||
          current.editVersion !== where.editVersion
        )
          return { count: 0 };
        const increment = data.editVersion as { increment: number };
        current = {
          ...current,
          ...data,
          editVersion: Number(current.editVersion) + increment.increment,
        };
        return { count: 1 };
      },
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        if (
          !current ||
          current.environment !== where.environment ||
          current.editVersion !== where.editVersion
        )
          return { count: 0 };
        current = null;
        return { count: 1 };
      },
    },
    commerceAuditEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (auditBeforeFailure) await auditBeforeFailure();
        audits.push(data);
      },
    },
  };
  return {
    transaction: transaction as never,
    audits,
    get row() {
      return current;
    },
  };
}

function mutation(
  kind: "set" | "replace" | "remove",
  version = 1,
): OpenRouterCredentialMutation {
  const shared = { operationId: `${kind}-op`, reason: "test reason" };
  return kind === "set"
    ? { kind, ...shared, sealed: sealed(1) }
    : kind === "replace"
      ? { kind, ...shared, expectedEditVersion: version, sealed: sealed(2) }
      : { kind, ...shared, expectedEditVersion: version };
}

test("SET inserts v1 and one environment-targeted audit, but conflicts when present", async () => {
  const fake = transactionFor();
  const status = await mutateOpenRouterCredentialInTransaction(
    fake.transaction,
    mutation("set"),
    environment,
    superAdmin,
  );
  assert.equal(status.configured, true);
  assert.equal(status.editVersion, 1);
  assert.deepEqual(fake.audits[0], {
    actorType: "PLATFORM_ADMIN",
    actorAdminId: "admin-1",
    operationId: "set-op",
    action: "SET_OPENROUTER_CREDENTIAL",
    environment,
    reason: "test reason",
    metadata: { editVersion: 1 },
  });
  await assert.rejects(
    mutateOpenRouterCredentialInTransaction(
      fake.transaction,
      mutation("set"),
      environment,
      superAdmin,
    ),
    { message: OPENROUTER_CREDENTIAL_ERRORS.alreadyConfigured },
  );
});

test("REPLACE increments by one and stale versions leave state and audit unchanged", async () => {
  const fake = transactionFor();
  await mutateOpenRouterCredentialInTransaction(
    fake.transaction,
    mutation("set"),
    environment,
    superAdmin,
  );
  const replaced = await mutateOpenRouterCredentialInTransaction(
    fake.transaction,
    mutation("replace"),
    environment,
    superAdmin,
  );
  assert.equal(replaced.editVersion, 2);
  assert.equal(fake.audits[1]?.action, "REPLACE_OPENROUTER_CREDENTIAL");
  assert.deepEqual(fake.audits[1]?.metadata, {
    previousEditVersion: 1,
    editVersion: 2,
  });
  const snapshot = fake.row;
  await assert.rejects(
    mutateOpenRouterCredentialInTransaction(
      fake.transaction,
      mutation("replace", 1),
      environment,
      superAdmin,
    ),
    { message: OPENROUTER_CREDENTIAL_ERRORS.changed },
  );
  assert.deepEqual(fake.row, snapshot);
  assert.equal(fake.audits.length, 2);
});

test("REMOVE uses exact CAS, writes one audit, and does not need encryption material", async () => {
  const fake = transactionFor();
  await mutateOpenRouterCredentialInTransaction(
    fake.transaction,
    mutation("set"),
    environment,
    superAdmin,
  );
  const removed = await mutateOpenRouterCredentialInTransaction(
    fake.transaction,
    mutation("remove"),
    environment,
    superAdmin,
  );
  assert.equal(removed.configured, false);
  assert.equal(fake.row, null);
  assert.equal(fake.audits[1]?.action, "REMOVE_OPENROUTER_CREDENTIAL");
  await assert.rejects(
    mutateOpenRouterCredentialInTransaction(
      fake.transaction,
      mutation("remove", 1),
      environment,
      superAdmin,
    ),
    { message: OPENROUTER_CREDENTIAL_ERRORS.notConfigured },
  );
  const conflict = transactionFor();
  await mutateOpenRouterCredentialInTransaction(
    conflict.transaction,
    mutation("set"),
    environment,
    superAdmin,
  );
  await mutateOpenRouterCredentialInTransaction(
    conflict.transaction,
    mutation("replace"),
    environment,
    superAdmin,
  );
  await assert.rejects(
    mutateOpenRouterCredentialInTransaction(
      conflict.transaction,
      mutation("remove", 1),
      environment,
      superAdmin,
    ),
    { message: OPENROUTER_CREDENTIAL_ERRORS.changed },
  );
  assert.equal(conflict.audits.length, 2);
});

test("ADMIN mutations are rejected and audit failure propagates for transaction rollback", async () => {
  const fake = transactionFor();
  await assert.rejects(
    mutateOpenRouterCredentialInTransaction(
      fake.transaction,
      mutation("set"),
      environment,
      admin,
    ),
    { message: OPENROUTER_CREDENTIAL_ERRORS.superAdminRequired },
  );
  const failing = transactionFor({ auditFailure: true });
  await assert.rejects(
    mutateOpenRouterCredentialInTransaction(
      failing.transaction,
      mutation("set"),
      environment,
      superAdmin,
    ),
    { message: "audit failure" },
  );
});

test("SET and REPLACE fail closed on unavailable keyring before importing Prisma", async () => {
  const previousKeys = process.env.COMMERCE_CONNECTION_KEYS_JSON;
  const previousActiveKey = process.env.COMMERCE_CONNECTION_ACTIVE_KEY_ID;
  const previousEnvironment = process.env.DEPLOYMENT_ENVIRONMENT_NAME;
  process.env.COMMERCE_CONNECTION_KEYS_JSON = "not-json";
  process.env.COMMERCE_CONNECTION_ACTIVE_KEY_ID = "missing";
  process.env.DEPLOYMENT_ENVIRONMENT_NAME = "test";
  try {
    for (const operation of [
      setOpenRouterCredential(
        { operationId: "set-op", reason: "test", secret: "secret" },
        superAdmin,
      ),
      replaceOpenRouterCredential(
        {
          operationId: "replace-op",
          reason: "test",
          expectedEditVersion: 1,
          secret: "secret",
        },
        superAdmin,
      ),
    ]) {
      await assert.rejects(operation, {
        message: "OpenRouter credential encryption is unavailable.",
      });
    }
  } finally {
    if (previousKeys === undefined)
      delete process.env.COMMERCE_CONNECTION_KEYS_JSON;
    else process.env.COMMERCE_CONNECTION_KEYS_JSON = previousKeys;
    if (previousActiveKey === undefined)
      delete process.env.COMMERCE_CONNECTION_ACTIVE_KEY_ID;
    else process.env.COMMERCE_CONNECTION_ACTIVE_KEY_ID = previousActiveKey;
    if (previousEnvironment === undefined)
      delete process.env.DEPLOYMENT_ENVIRONMENT_NAME;
    else process.env.DEPLOYMENT_ENVIRONMENT_NAME = previousEnvironment;
  }
});
