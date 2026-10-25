/**
 * Run ADMIN-007 test sources as native ES modules.
 *
 * The Admin application is not marked as ESM, so `tsx --test` compiles .ts/.tsx
 * test imports to CommonJS. That cannot load Shared's import-only entrypoints.
 * Conversely `--conditions=import` also changes resolution inside CJS packages,
 * which breaks the `intl-messageformat` -> `tslib` require path.
 *
 * Bundle only this task's local TypeScript/TSX sources into native .mjs files;
 * external packages keep their own normal import/require resolution conditions.
 * This is test tooling only, not an alternative Shared contract or runtime path.
 */
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../", import.meta.url));
const suites = {
  unit: [
    "tests/unit/arch047-template-publication-pure.test.ts",
    "tests/unit/arch047-template-publication-components.test.tsx",
  ],
  postgres: ["tests/integration/arch047-template-publication.postgres.test.ts"],
};
const selected = suites[process.argv[2]];
if (!selected || process.argv.length !== 3) {
  throw new Error("Usage: node scripts/run-arch047-admin-publication-tests.mjs unit|postgres");
}

// Keep bundles inside the Admin repository so normal package resolution finds
// its pinned dependencies. The generated directory is ignored by Git.
const generatedRoot = resolve(root, ".generated");
await mkdir(generatedRoot, { recursive: true });
const outputDir = await mkdtemp(join(generatedRoot, "arch047-publication-test-"));
try {
  await build({
    entryPoints: selected.map((path) => resolve(root, path)),
    outdir: outputDir,
    entryNames: "[name]",
    outExtension: { ".js": ".mjs" },
    platform: "node",
    target: "node22",
    format: "esm",
    bundle: true,
    packages: "external",
    jsx: "automatic",
    tsconfig: resolve(root, "tsconfig.json"),
    sourcemap: "inline",
    logLevel: "warning",
  });
  const compiled = selected.map((path) => join(outputDir, path.split("/").at(-1).replace(/\.tsx?$/, ".mjs")));
  const result = spawnSync(process.execPath, ["--enable-source-maps", "--test", ...compiled], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`ARCH-047 test process terminated: ${result.signal}`);
  process.exitCode = result.status ?? 1;
} finally {
  await rm(outputDir, { recursive: true, force: true });
}
