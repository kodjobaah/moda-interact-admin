/**
 * Run only ARCH-047 Admin translation tests as native ESM.
 *
 * This Next.js repository has no package-wide `type: module`, so `tsx --test`
 * currently executes .ts/.tsx imports through CommonJS. The published Shared
 * package exposes its internationalization and commerce/model subpaths only
 * via `import`, and a CJS test loader cannot resolve them.
 *
 * Bundle repository-local test sources to temporary ESM while keeping npm
 * packages external. Node then resolves the published Shared ESM exports using
 * the same import condition as the running Admin application.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const workspaceRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const testRoot = path.join(workspaceRoot, "tests");
const selected = process.argv.slice(2);
assert.ok(selected.length > 0, "Provide one or more ARCH-047 translation test files.");
const sources = selected.map((entry) => {
  const absolute = path.resolve(workspaceRoot, entry);
  assert.ok(absolute.startsWith(`${testRoot}${path.sep}`), "Test entry must belong to this workspace's tests directory.");
  assert.match(absolute, /\.tsx?$/, "Test entry must be a TypeScript test file.");
  assert.match(path.basename(absolute), /^arch047-template-translation.*\.test\.tsx?$/, "This runner only executes ARCH-047 translation tests.");
  return absolute;
});

const tempParent = path.join(workspaceRoot, "node_modules", ".cache", "arch047-admin-translations-esm");
await mkdir(tempParent, { recursive: true });
const tempDir = await mkdtemp(path.join(tempParent, "run-"));
try {
  await build({
    absWorkingDir: workspaceRoot,
    entryPoints: sources,
    outbase: testRoot,
    outdir: tempDir,
    entryNames: "[dir]/[name]",
    outExtension: { ".js": ".mjs" },
    bundle: true,
    packages: "external",
    platform: "node",
    format: "esm",
    target: "node22",
    jsx: "automatic",
    tsconfig: path.join(workspaceRoot, "tsconfig.json"),
    logLevel: "warning",
  });
  const outputs = sources.map((source) => path.join(tempDir,
    path.relative(testRoot, source).replace(/\.tsx?$/, ".mjs")));
  const child = spawnSync(process.execPath, ["--test", ...outputs], {
    cwd: workspaceRoot,
    // These isolated test processes always resolve the TEST model configuration.
    // Do not depend on the developer shell setting a deployment environment.
    env: { ...process.env, DEPLOYMENT_ENVIRONMENT_NAME: "test" },
    stdio: "inherit",
  });
  if (child.error) throw child.error;
  process.exitCode = child.status === null ? 1 : child.status;
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
