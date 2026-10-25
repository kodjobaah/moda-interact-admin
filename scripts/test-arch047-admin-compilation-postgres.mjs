import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

/** Disposable-only, matching ADMIN-003's migration-based integration harness. */
const container = `moda-arch047-compilation-${randomUUID()}`;
const dbName = "arch047_compilation_fixture";
const migrations = new URL("../database/prisma/migrations/", import.meta.url);
let started = false;
const docker = (args, options) => execFileSync("docker", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, ...options });
try {
  assert.ok(!process.env.ARCH047_ALLOW_EXTERNAL_DATABASE, "Refusing external database override");
  docker(["run", "--detach", "--name", container, "--publish", "127.0.0.1::5432", "--env", "POSTGRES_PASSWORD=fixture-only",
    "--env", `POSTGRES_DB=${dbName}`, "pgvector/pgvector:pg17"]);
  started = true;
  for (let i = 0; i < 90; i++) {
    try { docker(["exec", container, "pg_isready", "-h", "127.0.0.1", "-p", "5432", "-U", "postgres", "-d", dbName]); break; }
    catch { if (i === 89) throw new Error("Disposable PostgreSQL startup timed out"); await delay(500); }
  }
  const entries = readdirSync(migrations).filter((name) => /^\d{14}_/.test(name)).sort();
  assert.ok(entries.some((entry) => entry.includes("arch047_whatsapp_template")), "Missing ARCH-047 database migration");
  for (const entry of entries) docker(["exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", dbName], {
    input: readFileSync(new URL(`${entry}/migration.sql`, migrations), "utf8"),
  });
  const port = docker(["port", container, "5432/tcp"]).trim().match(/:(\d+)$/)?.[1];
  assert.ok(port);
  execFileSync(process.execPath, ["--import", "tsx", "--test", "tests/integration/arch047-template-compilation.postgres.test.ts"], {
    env: { ...process.env, DATABASE_URL: `postgresql://postgres:fixture-only@127.0.0.1:${port}/${dbName}?schema=public`, ARCH047_DISPOSABLE_POSTGRES: "1" }, stdio: "inherit",
  });
  console.log("PASS ARCH-047 ADMIN-005 disposable PostgreSQL");
} finally {
  if (started) {
    try { docker(["rm", "--force", container]); }
    catch (error) { console.error("Disposable container cleanup failed", container, error); process.exitCode = 1; }
  }
}
