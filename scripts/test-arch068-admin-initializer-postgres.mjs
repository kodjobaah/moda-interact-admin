import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { build } from "esbuild";
const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const container = `moda-arch068-initializer-${randomUUID()}`;
const database = "arch068_initializer_fixture";
const migrations = new URL("../database/prisma/migrations/", import.meta.url);
const docker = (args, options = {}) => execFileSync("docker", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, ...options });
let started = false; let temp;
try {
  assert.ok(!process.env.ARCH068_ALLOW_EXTERNAL_DATABASE, "External database overrides are not accepted");
  docker(["run", "--detach", "--name", container, "--publish", "127.0.0.1::5432", "--env", "POSTGRES_PASSWORD=fixture-only", "--env", `POSTGRES_DB=${database}`, "pgvector/pgvector:pg17"]);
  started = true;
  for (let i = 0; i < 90; i++) {
    try { docker(["exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres", "-d", database], { stdio: "ignore" }); break; }
    catch { if (i === 89) throw new Error("Disposable PostgreSQL startup timed out"); await delay(500); }
  }
  for (const entry of readdirSync(migrations).filter((name) => /^\d{14}_/.test(name)).sort()) {
    docker(["exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], { input: readFileSync(new URL(`${entry}/migration.sql`, migrations), "utf8"), stdio: ["pipe", "pipe", "pipe"] });
  }
  const port = docker(["port", container, "5432/tcp"]).trim().match(/:(\d+)$/)?.[1]; assert.ok(port);
  const cache = path.join(root, "node_modules/.cache/arch068-admin-initializer"); await mkdir(cache, { recursive: true });
  temp = await mkdtemp(path.join(cache, "run-"));
  const output = path.join(temp, "initializer.test.mjs");
  await build({ absWorkingDir: root, entryPoints: ["tests/integration/arch068-conversation-wrapper-initializer.postgres.test.ts"], outfile: output, bundle: true, packages: "external", format: "esm", platform: "node", target: "node22", logLevel: "warning" });
  execFileSync(process.execPath, ["--test", output], { cwd: root, stdio: "inherit", env: {
    ...process.env, DATABASE_URL: `postgresql://postgres:fixture-only@127.0.0.1:${port}/${database}?schema=public`,
    DEPLOYMENT_ENVIRONMENT_NAME: "test", NODE_ENV: "test", ARCH068_DISPOSABLE_POSTGRES: "1",
  } });
  console.log("PASS ARCH-068 ADMIN-002 disposable PostgreSQL (no deployed environment initialized)");
} finally {
  if (temp) await rm(temp, { recursive: true, force: true });
  if (started) docker(["rm", "--force", container]);
}
