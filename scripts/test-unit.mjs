/** Execute Admin unit suites as native ESM with bounded concurrency.
 * Bundling local sources preserves normal package export conditions; forcing the
 * global import condition breaks CommonJS dependencies such as intl-messageformat.
 */
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { readdir, readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const unit = path.join(root, 'tests/unit');
const requested = process.argv.slice(2);
const files = requested.length ? requested.map(file => {
  if (!/^tests\/unit\/[\w-]+\.test\.(?:tsx?|mjs)$/.test(file)) throw new Error('Expected a unit test path');
  return path.basename(file);
}) : (await readdir(unit)).filter(name => /\.test\.(?:tsx?|mjs)$/.test(name)).sort();
const parent = path.join(root, '.generated');
await mkdir(parent, { recursive: true });
const output = await mkdtemp(path.join(parent, 'unit-tests-'));
try {
  const sources = files.filter(name => /\.tsx?$/.test(name));
  await build({
    absWorkingDir: root, entryPoints: sources.map(name => path.join(unit, name)),
    outdir: output, outExtension: { '.js': '.mjs' }, bundle: true,
    packages: 'external', platform: 'node', format: 'esm', target: 'node24',
    jsx: 'automatic', tsconfig: path.join(root, 'tsconfig.json'), logLevel: 'warning',
    plugins: [{ name: 'source-locations-and-next', setup(api) {
      api.onResolve({ filter: /^next\// }, args => ({ path: require.resolve(args.path), external: true }));
      api.onLoad({ filter: /\.tsx?$/ }, async args => {
        if (!args.path.startsWith(root) || args.path.includes('/node_modules/')) return;
        // Source-reading assertions must still inspect the real repository files.
        const contents = (await readFile(args.path, 'utf8')).replaceAll('import.meta.url', JSON.stringify(pathToFileURL(args.path).href));
        return { contents, loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts' };
      });
    } }],
  });
  const entries = files.map(name => name.endsWith('.mjs') ? path.join(unit, name) : path.join(output, name.replace(/\.tsx?$/, '.mjs')));
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', '--test-concurrency=2', ...entries], {
    cwd: root, env: { ...process.env, DEPLOYMENT_ENVIRONMENT_NAME: 'test' }, stdio: 'inherit',
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally { await rm(output, { recursive: true, force: true }); }
