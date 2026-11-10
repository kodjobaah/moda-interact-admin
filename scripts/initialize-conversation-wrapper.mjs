#!/usr/bin/env node
import { pathToFileURL, fileURLToPath } from "node:url";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const invalid = () => { const error = new Error("INVALID_ARGUMENT"); error.code = "INVALID_ARGUMENT"; throw error; };
export function parseArguments(args) {
  const values = new Map();
  for (const arg of args) {
    if (typeof arg !== "string") invalid();
    if (arg === "--apply" || arg === "--dry-run") {
      if (values.has("mode")) invalid();
      values.set("mode", arg === "--apply" ? "APPLY" : "DRY_RUN");
      continue;
    }
    const split = arg.indexOf("=");
    const name = arg.slice(0, split);
    if (split < 0 || !["--environment", "--actor-admin-email", "--reason"].includes(name) || values.has(name)) invalid();
    values.set(name, arg.slice(split + 1));
  }
  const environment = values.get("--environment");
  const actorAdminEmail = values.get("--actor-admin-email");
  const reason = values.get("--reason");
  if (!["test", "production"].includes(environment) || typeof actorAdminEmail !== "string" || !/^\S+@\S+\.\S+$/.test(actorAdminEmail.trim()) || actorAdminEmail.length > 320 ||
      /[\u0000-\u001f\u007f]/.test(actorAdminEmail) || typeof reason !== "string" || reason.trim().length < 10 || reason.length > 500) invalid();
  return { environment, actorAdminEmail: actorAdminEmail.trim().toLowerCase(), reason, mode: values.get("mode") ?? "DRY_RUN" };
}

export async function main(args = process.argv.slice(2)) {
  const input = parseArguments(args);
  // Native ESM avoids the repository's CommonJS TS loader selecting incompatible
  // require/import conditions in Shared's transitive packages. Only local Admin
  // source is bundled; every npm dependency uses its installed public export.
  const { build } = await import("esbuild");
  const temp = await mkdtemp(path.join(tmpdir(), "moda-wrapper-initializer-"));
  let db;
  try {
    const output = path.join(temp, "initialize.mjs");
    await build({
      absWorkingDir: fileURLToPath(new URL("..", import.meta.url)),
      entryPoints: [fileURLToPath(new URL("../src/lib/admin/whatsapp-templates/wrappers/initialize.ts", import.meta.url))],
      outfile: output, bundle: true, packages: "external", platform: "node", format: "esm", target: "node22", logLevel: "silent",
      plugins: [{ name: "installed-public-dependencies", setup(api) {
        api.onResolve({ filter: /^[^./]/ }, (args) => {
          if (args.path.startsWith("@/")) return; // Preserve the Admin tsconfig source alias.
          return { path: import.meta.resolve(args.path), external: true };
        });
      } }],
    });
    const [{ initializeConversationWrapper }, { PrismaClient }] = await Promise.all([
      import(pathToFileURL(output).href), import("@prisma/client"),
    ]);
    db = new PrismaClient();
    console.log(JSON.stringify(await initializeConversationWrapper(input, { db })));
  } finally {
    try { await db?.$disconnect(); }
    finally { await rm(temp, { recursive: true, force: true }); }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const known = new Set(["INVALID_ARGUMENT", "ENVIRONMENT_MISMATCH", "ACTOR_DENIED", "IMMUTABLE_CONFLICT", "SLOT_OCCUPIED", "CONCURRENT_STATE_CHANGE"]);
    const code = known.has(error?.code) ? error.code : "CONCURRENT_STATE_CHANGE";
    console.error(JSON.stringify({ status: "FAILED", code }));
    process.exitCode = 1;
  });
}
