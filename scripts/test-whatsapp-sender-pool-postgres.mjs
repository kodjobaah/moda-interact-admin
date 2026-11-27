import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  readFileSync,
  readdirSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const container = `moda-arch076-sender-pool-${randomUUID()}`;
const dbName = "arch076_sender_pool_fixture";
const migrations = new URL("../database/prisma/migrations/", import.meta.url);
let started = false;
// Bundle local TypeScript as ESM, preserving normal package export conditions.
// Running TS directly under tsx's CJS resolver cannot consume import-only Shared exports.
const generated = fileURLToPath(new URL("../.generated/", import.meta.url));
mkdirSync(generated, { recursive: true });
const testOutput = mkdtempSync(join(generated, "sender-pool-postgres-"));
const docker = (args, options) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
try {
  await build({
    entryPoints: [
      fileURLToPath(
        new URL(
          "../tests/integration/whatsapp-sender-pool.postgres.test.ts",
          import.meta.url,
        ),
      ),
    ],
    outfile: join(testOutput, "wrappers.test.mjs"),
    bundle: true,
    packages: "external",
    platform: "node",
    format: "esm",
    target: "node24",
    tsconfig: fileURLToPath(new URL("../tsconfig.json", import.meta.url)),
    plugins: [
      {
        name: "offline-auth-boundary",
        setup(api) {
          // The real authenticated HTTP entrypoints are checked separately. PG calls
          // the trusted injectable workflows; any accidental auth call fails closed.
          api.onResolve(
            { filter: /(?:^|\/)auth\/platform-admin(?:\.ts)?$/ },
            () => ({ path: "auth-fixture", namespace: "auth-fixture" }),
          );
          api.onLoad({ filter: /.*/, namespace: "auth-fixture" }, () => ({
            contents: `export class PlatformAdminUnauthorizedError extends Error {}
export const requirePlatformAdminRead = async()=>{throw new PlatformAdminUnauthorizedError("HTTP auth unavailable in disposable fixture");};
export const requirePlatformAdminMutation = requirePlatformAdminRead;`,
            loader: "js",
          }));
        },
      },
    ],
  });
  assert.ok(
    !process.env.ARCH076_ALLOW_EXTERNAL_DATABASE,
    "Refusing an external database override",
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
    `POSTGRES_DB=${dbName}`,
    "pgvector/pgvector:pg17",
  ]);
  started = true;
  for (let i = 0; i < 90; i++) {
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
        dbName,
      ]);
      break;
    } catch {
      if (i === 89) throw new Error("Disposable PostgreSQL startup timed out");
      await delay(500);
    }
  }
  const entries = readdirSync(migrations)
    .filter((name) => /^\d{14}_/.test(name))
    .sort();
  assert.ok(
    entries.some((name) => name.includes("whatsapp_sender_pool")),
    "ARCH-076 sender pool migration missing",
  );
  for (const entry of entries)
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
        dbName,
      ],
      {
        input: readFileSync(
          new URL(`${entry}/migration.sql`, migrations),
          "utf8",
        ),
      },
    );
  const port = docker(["port", container, "5432/tcp"])
    .trim()
    .match(/:(\d+)$/)?.[1];
  assert.ok(port);
  execFileSync(
    process.execPath,
    ["--test", join(testOutput, "wrappers.test.mjs")],
    {
      env: {
        ...process.env,
        DATABASE_URL: `postgresql://postgres:fixture-only@127.0.0.1:${port}/${dbName}?schema=public`,
        ARCH076_SENDER_POOL_DISPOSABLE_POSTGRES: "1",
        DEPLOYMENT_ENVIRONMENT_NAME: "test",
      },
      stdio: "inherit",
    },
  );
  console.log("PASS ARCH-076 ADMIN-001 disposable PostgreSQL");
} finally {
  rmSync(testOutput, { recursive: true, force: true });
  if (started) {
    try {
      docker(["rm", "--force", container]);
    } catch (error) {
      console.error("Temporary PostgreSQL cleanup failed:", container, error);
      process.exitCode = 1;
    }
  }
}
