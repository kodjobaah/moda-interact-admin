import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const container = `moda-arch036-admin-${randomUUID()}`;
const databaseName = "arch036_admin_fixture";
const migrations = new URL("../database/prisma/migrations/", import.meta.url);
let started = false;
let mappedPort;
const docker = (args, options) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });

try {
  assert.ok(
    !process.env.ARCH036_ALLOW_EXTERNAL_DATABASE,
    "External database test mode is not supported.",
  );
  docker([
    "run",
    "--detach",
    "--name",
    container,
    "--publish",
    "127.0.0.1::5432",
    "--env",
    "POSTGRES_PASSWORD=fixture-only",
    "--env",
    `POSTGRES_DB=${databaseName}`,
    "pgvector/pgvector:pg17",
  ]);
  started = true;

  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      docker([
        "exec",
        container,
        "pg_isready",
        "-h",
        "127.0.0.1",
        "-p",
        "5432",
        "-U",
        "postgres",
        "-d",
        databaseName,
      ]);
      break;
    } catch {
      if (attempt === 89) throw new Error("PostgreSQL startup timeout");
      await delay(500);
    }
  }

  const migrationDirectory = readdirSync(migrations)
    .filter((name) => /^\d{14}_/.test(name))
    .sort();
  assert.ok(migrationDirectory.length > 0, "No Prisma migrations found.");
  for (const migration of migrationDirectory) {
    docker(
      [
        "exec",
        "-i",
        container,
        "psql",
        "-X",
        "-q",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "postgres",
        "-d",
        databaseName,
      ],
      {
        input: readFileSync(
          new URL(`${migration}/migration.sql`, migrations),
          "utf8",
        ),
      },
    );
  }

  mappedPort = docker(["port", container, "5432/tcp"])
    .trim()
    .match(/:(\d+)$/)?.[1];
  assert.ok(mappedPort, "Could not resolve the disposable PostgreSQL port.");
  execFileSync(
    process.execPath,
    [
      "--conditions=import",
      "--import",
      "tsx",
      "--test",
      "tests/integration/arch036-admin-recovery-policy.postgres.test.ts",
    ],
    {
      env: {
        ...process.env,
        DATABASE_URL: `postgresql://postgres:fixture-only@127.0.0.1:${mappedPort}/${databaseName}?schema=public`,
        ARCH036_DISPOSABLE_POSTGRES: "1",
      },
      stdio: "inherit",
    },
  );
  console.log("PASS ARCH-036 Admin disposable PostgreSQL tests");
} finally {
  if (started) {
    if (process.env.ARCH036_KEEP_DISPOSABLE_DATABASE === "1") {
      console.log(
        `Kept disposable PostgreSQL container ${container} on 127.0.0.1:${mappedPort}`,
      );
    } else {
    try {
      docker(["rm", "--force", container]);
    } catch (error) {
      console.error("Disposable PostgreSQL cleanup failed", container, error);
      process.exitCode = 1;
    }
    }
  }
}