import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const container = `moda-arch043-admin-${randomUUID()}`;
const dbName = "arch043_admin_fixture";
const migrations = new URL("../database/prisma/migrations/", import.meta.url);
let started = false;
const docker = (args, options = {}) => execFileSync("docker", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, ...options });
const psql = (sql) => docker(["exec", "-i", container, "psql", "-h", "127.0.0.1", "-p", "5432", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", dbName], { input: sql });
try {
  assert.ok(!process.env.ARCH043_ALLOW_EXTERNAL_DATABASE, "Refusing external database test mode");
  docker(["run", "--detach", "--name", container, "--publish", "127.0.0.1::5432", "--env", "POSTGRES_PASSWORD=fixture-only", "--env", `POSTGRES_DB=${dbName}`, "pgvector/pgvector:pg17"]);
  started = true;
  // During initialisation, the Docker image starts a temporary socket-only PostgreSQL
  // server before stopping it and starting the final TCP listener. Only the final
  // server should count as ready; a socket-only pg_isready check races the restart.
  for (let i = 0; i < 90; i++) {
    try { docker(["exec", container, "pg_isready", "-h", "127.0.0.1", "-p", "5432", "-U", "postgres", "-d", dbName], { stdio: "pipe" }); break; }
    catch { if (i === 89) throw new Error("PostgreSQL startup timeout"); await delay(500); }
  }
  const ordered = readdirSync(migrations).filter((entry) => /^\d{14}_/.test(entry)).sort();
  assert.ok(ordered.some((entry) => entry.includes("arch043_platform_configuration")), "Admin database submodule lacks ARCH-043 migration; update it to the accepted DATABASE-001 commit");
  for (const entry of ordered) psql(readFileSync(new URL(`${entry}/migration.sql`, migrations), "utf8"));
  const port = docker(["port", container, "5432/tcp"]).trim().match(/:(\d+)$/)?.[1];
  assert.ok(port, "Unable to resolve disposable PostgreSQL port");
  const databaseUrl = `postgresql://postgres:fixture-only@127.0.0.1:${port}/${dbName}?schema=public`;
  execFileSync(process.execPath, ["--conditions=import", "--import", "tsx", "--test", "tests/integration/arch043-platform-configuration.postgres.test.ts"], {
    env: { ...process.env, DATABASE_URL: databaseUrl, ARCH043_DISPOSABLE_POSTGRES: "1" }, stdio: "inherit",
  });
  console.log("PASS ARCH-043 ADMIN-001 disposable PostgreSQL");
} finally {
  if (started) {
    try { docker(["rm", "--force", container]); }
    catch (error) { console.error("Cleanup failed for disposable PostgreSQL", container, error); process.exitCode = 1; }
  }
}
