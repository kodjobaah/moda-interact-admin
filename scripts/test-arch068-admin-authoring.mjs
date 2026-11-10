// Resolve the published Shared ESM package exactly as Next.js does, while
// bundling only repository-local tests (the repository has no type:module).
import { createRequire } from "node:module";
import { build } from "esbuild";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const selected = process.argv.slice(2);
const files = selected.length ? selected : [
  "tests/unit/arch068-conversation-product-image.test.ts",
  "tests/unit/arch068-conversation-product-image-components.test.tsx",
];
for (const file of files) if (!/^tests\/unit\/arch(?:047|049|068)-[\w-]+\.test\.tsx?$/.test(file)) throw new Error("Expected a task-related unit test.");
const parent = path.join(root, "node_modules/.cache/arch068-admin-authoring");
await mkdir(parent, { recursive: true });
const temp = await mkdtemp(path.join(parent, "run-"));
try {
  await build({ absWorkingDir: root, entryPoints: files, outbase: "tests", outdir: temp, outExtension: { ".js": ".mjs" }, bundle: true, packages: "external", platform: "node", format: "esm", target: "node22", jsx: "automatic", logLevel: "warning", plugins: [{ name: "next-node-esm", setup(api) { api.onResolve({ filter: /^next\// }, (args) => ({ path: require.resolve(args.path), external: true })); } }] });
  const outputs = files.map((file) => path.join(temp, file.replace(/^tests\//, "").replace(/\.tsx?$/, ".mjs")));
  const result = spawnSync(process.execPath, ["--test", ...outputs], { cwd: root, env: { ...process.env, DEPLOYMENT_ENVIRONMENT_NAME: "test" }, stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally { await rm(temp, { recursive: true, force: true }); }
