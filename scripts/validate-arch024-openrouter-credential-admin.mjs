import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { randomBytes, randomUUID, createDecipheriv } from "node:crypto";
import { promisify } from "node:util";
import {
  PrismaClient,
  CommerceAuditAction,
  CommerceEnvironment,
} from "@prisma/client";
import { createCommerceOpenRouterCredentialAad } from "@modainteract/moda-interact-shared/commerce/model";
import { sealOpenRouterCredential } from "../src/lib/admin/openrouter-credential-crypto.ts";

const execFile = promisify(execFileCallback);
const root = new URL("../", import.meta.url);
const labelKey = "moda.arch024.openrouter-admin.run";
const runId = randomUUID().replaceAll("-", "").slice(0, 16);
const resourceLabel = `${labelKey}=${runId}`;
const containerName = `arch024-openrouter-admin-${runId}`;
const networkName = `arch024-openrouter-admin-${runId}`;
const databaseName = "arch024_openrouter_admin";
const password = randomBytes(24).toString("hex");
const image = "pgvector/pgvector:pg16";
const owned = { container: false, network: false };
const testKey = new Uint8Array(Buffer.alloc(32, 36));
const keyId = "arch024-test-key";
const credentialA = "credential-A";
const credentialB = "credential-B";
const operations = {
  set: `arch024-${runId}-set`,
  replace: `arch024-${runId}-replace`,
  remove: `arch024-${runId}-remove`,
};

async function docker(args, label) {
  try {
    const { stdout } = await execFile("docker", args, { encoding: "utf8" });
    return stdout.trim();
  } catch {
    throw new Error(`Disposable PostgreSQL ${label} failed.`);
  }
}

async function waitForPostgres() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      await docker(
        [
          "exec",
          containerName,
          "pg_isready",
          "-h",
          "127.0.0.1",
          "-U",
          "fixture",
          "-d",
          databaseName,
        ],
        "readiness check",
      );
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  throw new Error("Disposable PostgreSQL did not become ready.");
}

async function provision() {
  const context = await docker(
    ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"],
    "Docker context validation",
  );
  assert.ok(
    context.startsWith("unix://"),
    "A local Docker context is required.",
  );
  await docker(
    ["version", "--format", "{{.Server.Version}}"],
    "availability check",
  );
  await docker(["pull", image], "PostgreSQL image pull");
  await docker(
    ["network", "create", "--label", resourceLabel, networkName],
    "network creation",
  );
  owned.network = true;
  await docker(
    [
      "create",
      "--name",
      containerName,
      "--label",
      resourceLabel,
      "--network",
      networkName,
      "--publish",
      "127.0.0.1::5432",
      "--env",
      "POSTGRES_USER=fixture",
      "--env",
      `POSTGRES_PASSWORD=${password}`,
      "--env",
      `POSTGRES_DB=${databaseName}`,
      image,
    ],
    "container creation",
  );
  owned.container = true;
  await docker(["start", containerName], "container startup");
  await waitForPostgres();
  const published = await docker(
    ["port", containerName, "5432/tcp"],
    "port discovery",
  );
  const port = published.match(/^127\.0\.0\.1:(\d+)$/)?.[1];
  assert.ok(port, "PostgreSQL must bind to an ephemeral IPv4 loopback port.");
  return `postgresql://fixture:${password}@127.0.0.1:${port}/${databaseName}`;
}

async function migrate(databaseUrl) {
  try {
    await execFile(
      process.execPath,
      [
        "node_modules/prisma/build/index.js",
        "migrate",
        "deploy",
        "--schema",
        "database/prisma/schema.prisma",
      ],
      {
        cwd: new URL(root).pathname,
        env: { ...process.env, DATABASE_URL: databaseUrl },
        encoding: "utf8",
      },
    );
  } catch {
    throw new Error(
      "Accepted Prisma migrations failed on disposable PostgreSQL.",
    );
  }
}

function decryptCredential(row, expectedEnvironment, expectedKey) {
  const decipher = createDecipheriv("aes-256-gcm", expectedKey, row.nonce);
  decipher.setAAD(
    Buffer.from(
      createCommerceOpenRouterCredentialAad({
        environment: row.environment,
        keyId: row.keyId,
      }),
      "utf8",
    ),
  );
  decipher.setAuthTag(row.authTag);
  const plaintext = Buffer.concat([
    decipher.update(row.ciphertext),
    decipher.final(),
  ]).toString("utf8");
  assert.equal(row.environment, expectedEnvironment);
  assert.equal(row.keyId, keyId);
  return plaintext;
}

function assertCredentialMatches(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} plaintext verification failed.`);
  }
}

async function cleanup() {
  const errors = [];
  if (owned.container) {
    try {
      const found = await docker(
        [
          "ps",
          "-aq",
          "--filter",
          `label=${resourceLabel}`,
          "--filter",
          `name=^${containerName}$`,
        ],
        "container cleanup inventory",
      );
      if (found) {
        const owner = await docker(
          [
            "inspect",
            "--format",
            `{{index .Config.Labels "${labelKey}"}}`,
            containerName,
          ],
          "container ownership check",
        );
        assert.equal(owner, runId, "Refusing to remove an unowned container.");
        await docker(
          ["rm", "--force", "--volumes", containerName],
          "container cleanup",
        );
      }
      const remaining = await docker(
        ["ps", "-aq", "--filter", `label=${resourceLabel}`],
        "container cleanup verification",
      );
      assert.equal(remaining, "", "An owned PostgreSQL container remains.");
    } catch (error) {
      errors.push(error);
    }
  }
  if (owned.network) {
    try {
      const owner = await docker(
        ["inspect", "--format", `{{index .Labels "${labelKey}"}}`, networkName],
        "network ownership check",
      );
      assert.equal(owner, runId, "Refusing to remove an unowned network.");
      await docker(["network", "rm", networkName], "network cleanup");
      const remaining = await docker(
        ["network", "ls", "-q", "--filter", `label=${resourceLabel}`],
        "network cleanup verification",
      );
      assert.equal(remaining, "", "An owned PostgreSQL network remains.");
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length) {
    throw new Error("Disposable PostgreSQL resource cleanup failed.");
  }
}

async function proveLifecycle(databaseUrl) {
  process.env.COMMERCE_CONNECTION_KEYS_JSON = JSON.stringify({
    [keyId]: Buffer.from(testKey).toString("base64"),
  });
  process.env.COMMERCE_CONNECTION_ACTIVE_KEY_ID = keyId;
  process.env.DEPLOYMENT_ENVIRONMENT_NAME = "test";

  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });
  try {
    const adminId = `arch024-openrouter-admin-${runId}`;
    await prisma.platformAdmin.create({
      data: {
        id: adminId,
        provider: "validation",
        providerSubject: `arch024-openrouter-${runId}`,
        email: `arch024-openrouter-${runId}@example.invalid`,
        displayName: "ARCH-024 OpenRouter validation fixture",
        role: "SUPER_ADMIN",
        active: true,
      },
    });
    assert.equal(
      await prisma.commerceOpenRouterCredential.findUnique({
        where: { environment: CommerceEnvironment.TEST },
        select: { environment: true },
      }),
      null,
    );

    const sealedA = sealOpenRouterCredential({
      environment: "TEST",
      secret: credentialA,
      keyring: { [keyId]: testKey },
      activeKeyId: keyId,
    });
    await prisma.$transaction(async (transaction) => {
      await transaction.commerceOpenRouterCredential.create({
        data: {
          environment: CommerceEnvironment.TEST,
          ...sealedA,
          editVersion: 1,
          updatedByAdminId: adminId,
        },
      });
      await transaction.commerceAuditEvent.create({
        data: {
          actorType: "PLATFORM_ADMIN",
          actorAdminId: adminId,
          operationId: operations.set,
          action: CommerceAuditAction.SET_OPENROUTER_CREDENTIAL,
          environment: CommerceEnvironment.TEST,
          reason: "Disposable credential SET proof",
          metadata: { editVersion: 1 },
        },
      });
    });
    const storedA = await prisma.commerceOpenRouterCredential.findUniqueOrThrow(
      {
        where: { environment: CommerceEnvironment.TEST },
      },
    );
    assertCredentialMatches(
      decryptCredential(storedA, "TEST", testKey),
      credentialA,
      "SET credential",
    );

    const sealedB = sealOpenRouterCredential({
      environment: "TEST",
      secret: credentialB,
      keyring: { [keyId]: testKey },
      activeKeyId: keyId,
    });
    await prisma.$transaction(async (transaction) => {
      const result = await transaction.commerceOpenRouterCredential.updateMany({
        where: { environment: CommerceEnvironment.TEST, editVersion: 1 },
        data: {
          ...sealedB,
          editVersion: { increment: 1 },
          updatedByAdminId: adminId,
        },
      });
      assert.equal(result.count, 1);
      await transaction.commerceAuditEvent.create({
        data: {
          actorType: "PLATFORM_ADMIN",
          actorAdminId: adminId,
          operationId: operations.replace,
          action: CommerceAuditAction.REPLACE_OPENROUTER_CREDENTIAL,
          environment: CommerceEnvironment.TEST,
          reason: "Disposable credential REPLACE proof",
          metadata: { previousEditVersion: 1, editVersion: 2 },
        },
      });
    });
    await prisma.$transaction(async (transaction) => {
      const stale = await transaction.commerceOpenRouterCredential.updateMany({
        where: { environment: CommerceEnvironment.TEST, editVersion: 1 },
        data: {
          ...sealedA,
          editVersion: { increment: 1 },
          updatedByAdminId: adminId,
        },
      });
      assert.equal(stale.count, 0);
    });
    const storedB = await prisma.commerceOpenRouterCredential.findUniqueOrThrow(
      {
        where: { environment: CommerceEnvironment.TEST },
      },
    );
    assert.equal(storedB.editVersion, 2);
    assertCredentialMatches(
      decryptCredential(storedB, "TEST", testKey),
      credentialB,
      "REPLACE credential",
    );

    await prisma.$transaction(async (transaction) => {
      const deleted = await transaction.commerceOpenRouterCredential.deleteMany(
        {
          where: { environment: CommerceEnvironment.TEST, editVersion: 2 },
        },
      );
      assert.equal(deleted.count, 1);
      await transaction.commerceAuditEvent.create({
        data: {
          actorType: "PLATFORM_ADMIN",
          actorAdminId: adminId,
          operationId: operations.remove,
          action: CommerceAuditAction.REMOVE_OPENROUTER_CREDENTIAL,
          environment: CommerceEnvironment.TEST,
          reason: "Disposable credential REMOVE proof",
          metadata: { previousEditVersion: 2 },
        },
      });
    });
    const staleDelete = await prisma.commerceOpenRouterCredential.deleteMany({
      where: { environment: CommerceEnvironment.TEST, editVersion: 2 },
    });
    assert.equal(staleDelete.count, 0);
    assert.equal(
      await prisma.commerceOpenRouterCredential.findUnique({
        where: { environment: CommerceEnvironment.TEST },
        select: { environment: true },
      }),
      null,
    );

    const audits = await prisma.commerceAuditEvent.findMany({
      where: {
        actorAdminId: adminId,
        operationId: { in: Object.values(operations) },
      },
      select: {
        operationId: true,
        action: true,
        environment: true,
        metadata: true,
      },
    });
    assert.equal(audits.length, 3);
    assert.deepEqual(
      audits.map((audit) => audit.action).sort(),
      [
        CommerceAuditAction.SET_OPENROUTER_CREDENTIAL,
        CommerceAuditAction.REPLACE_OPENROUTER_CREDENTIAL,
        CommerceAuditAction.REMOVE_OPENROUTER_CREDENTIAL,
      ].sort(),
    );
    const forbiddenAuditValues = [
      credentialA,
      credentialB,
      keyId,
      Buffer.from(sealedA.ciphertext).toString("base64"),
      Buffer.from(sealedA.nonce).toString("base64"),
      Buffer.from(sealedA.authTag).toString("base64"),
    ];
    for (const audit of audits) {
      assert.equal(audit.environment, CommerceEnvironment.TEST);
      const metadata = JSON.stringify(audit.metadata);
      for (const forbidden of forbiddenAuditValues) {
        assert.equal(metadata.includes(forbidden), false);
      }
    }

    const rollbackOperation = `arch024-${runId}-rollback`;
    await assert.rejects(
      prisma.$transaction(async (transaction) => {
        await transaction.commerceOpenRouterCredential.create({
          data: {
            environment: CommerceEnvironment.TEST,
            ...sealedA,
            editVersion: 1,
            updatedByAdminId: adminId,
          },
        });
        await transaction.commerceAuditEvent.create({
          data: {
            actorType: "PLATFORM_ADMIN",
            actorAdminId: `missing-admin-${runId}`,
            operationId: rollbackOperation,
            action: CommerceAuditAction.SET_OPENROUTER_CREDENTIAL,
            environment: CommerceEnvironment.TEST,
            reason: "Rollback proof",
            metadata: { editVersion: 1 },
          },
        });
      }),
    );
    assert.equal(
      await prisma.commerceOpenRouterCredential.findUnique({
        where: { environment: CommerceEnvironment.TEST },
        select: { environment: true },
      }),
      null,
    );
    assert.equal(
      await prisma.commerceAuditEvent.count({
        where: { operationId: rollbackOperation },
      }),
      0,
    );
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  let failure;
  try {
    const databaseUrl = await provision();
    await migrate(databaseUrl);
    console.log("Accepted migrations applied to disposable PostgreSQL.");
    await proveLifecycle(databaseUrl);
    console.log(
      "SET -> REPLACE -> stale CAS -> REMOVE and Shared-AAD decrypt proof passed.",
    );
  } catch (error) {
    failure =
      error instanceof Error
        ? error
        : new Error("Credential lifecycle proof failed.");
  } finally {
    try {
      await cleanup();
      console.log("Owned disposable PostgreSQL resources cleaned up.");
    } catch (cleanupError) {
      failure =
        cleanupError instanceof Error
          ? cleanupError
          : new Error("Disposable resource cleanup failed.");
    }
  }
  if (failure) throw failure;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
