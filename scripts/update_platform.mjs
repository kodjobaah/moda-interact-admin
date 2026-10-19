#!/usr/bin/env node
/** Import approved ARCH-043 platform configuration from a dotenv/export file. */
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";
import { applyPlatformImport, parseEnvironmentFile, planPlatformImport } from "./platform-configuration-env-import.mjs";

const SHELL_STARTUP_FILENAMES = new Set([
  ".zshenv", ".zshrc", ".zprofile", ".zlogin",
  ".bashrc", ".bash_profile", ".bash_login", ".profile",
]);

export function isShellStartupFile(file) {
  return SHELL_STARTUP_FILENAMES.has(basename(file));
}

export function parseArguments(args) {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) return { help: true };
  const paths = args.filter((arg) => !arg.startsWith("--"));
  const flags = args.filter((arg) => arg.startsWith("--"));
  if (paths.length !== 1 || flags.some((flag) => !["--update", "--dry-run", "--shell-file"].includes(flag)) ||
      flags.length !== new Set(flags).size || paths[0].startsWith("-")) {
    throw new Error("Usage: update_platform <env_file> [--update] [--dry-run] [--shell-file]");
  }
  return { file: paths[0], update: flags.includes("--update"), dryRun: flags.includes("--dry-run"), shellFile: flags.includes("--shell-file") };
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: update_platform <env_file> [--update] [--dry-run] [--shell-file]\n" +
      "Without --update, existing (environment,key) records are skipped. Targets: development and test only.\n" +
      "--update updates existing values (preserving unspecified fields) and inserts missing records.\n" +
      "--dry-run previews planned changes without writing.\n" +
      "The file supports KEY=value and export KEY=value; it is parsed, never executed.\n" +
      "Shell startup files such as ~/.zshenv are auto-detected; use --shell-file for other names.");
    return;
  }
  const variables = parseEnvironmentFile(await readFile(args.file, "utf8"), {
    shellFile: args.shellFile || isShellStartupFile(args.file),
  });
  // The CLI uses the same canonical validation, sealed envelope/AAD and Shared
  // cryptography as the Admin service; it never inserts plaintext secret rows.
  const [{ Prisma, PrismaClient }, { PLATFORM_CONFIGURATION_REGISTRY, validateConfiguration },
    { validateSecretPayload }, { createConfigUnsealKeyring, sealSecret, unsealSecret }] = await Promise.all([
    import("@prisma/client"),
    import("../src/lib/admin/platform-configuration/contracts.ts"),
    import("../src/lib/admin/platform-configuration/secret-validation.ts"),
    import("../src/lib/admin/platform-configuration/seal.ts"),
  ]);
  const plan = planPlatformImport(variables, PLATFORM_CONFIGURATION_REGISTRY);
  if (!plan.groups.length) {
    console.log(`No recognised PlatformConfiguration values found (${plan.ignoredCount} other variables ignored).`);
    return;
  }
  const dbUrl = process.env.DATABASE_URL || variables.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is required (in the process environment or the input file).");
  let wrapping;
  const getWrapping = () => {
    if (wrapping) return wrapping;
    try {
      wrapping = createConfigUnsealKeyring(
        process.env.MODA_CONFIG_UNSEAL_KEY || variables.MODA_CONFIG_UNSEAL_KEY,
        process.env.MODA_CONFIG_UNSEAL_ACTIVE_KEY_ID || variables.MODA_CONFIG_UNSEAL_ACTIVE_KEY_ID,
      );
      return wrapping;
    } catch { throw new Error("MODA_CONFIG_UNSEAL_KEY and its active key ID are required to import secret configurations."); }
  };
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    const dependencies = {
      update: args.update, dryRun: args.dryRun, dbNull: Prisma.DbNull,
      validatePolicy: validateConfiguration, validateSecret: validateSecretPayload,
      seal: (input) => sealSecret({ ...input, wrapping: getWrapping() }),
      unseal: (input) => unsealSecret({ ...input, wrapping: getWrapping() }),
    };
    const outcome = await prisma.$transaction((tx) => applyPlatformImport(tx, plan, dependencies), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000,
    });
    for (const entry of outcome) {
      const details = entry.status === "skipped-incomplete" ? ` (missing fields: ${entry.missing.join(", ")})` : "";
      console.log(`${entry.environment} / ${entry.key}: ${entry.status}${details}`);
    }
    const counts = Object.fromEntries([...new Set(outcome.map((entry) => entry.status))].map((status) => [status, outcome.filter((entry) => entry.status === status).length]));
    console.log(`Done: ${JSON.stringify(counts)}; ignored ${plan.ignoredCount} non-platform env variables.${args.dryRun ? " DRY RUN: no writes." : ""}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    // Never include environment/secret values, Prisma connection URLs or stack traces.
    const detail = error instanceof Error && !/^Prisma/.test(error.name)
      ? error.message : "Database or runtime error (details withheld to protect credentials).";
    console.error(`update_platform failed: ${detail}`);
    process.exitCode = 1;
  });
}
