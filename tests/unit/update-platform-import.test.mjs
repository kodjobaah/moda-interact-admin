import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  IMPORT_ENVIRONMENTS, IMPORT_ACTOR, PLATFORM_ENV_MAPPINGS,
  parseEnvironmentFile, planPlatformImport, applyPlatformImport,
} from "../../scripts/platform-configuration-env-import.mjs";
import { isShellStartupFile, parseArguments } from "../../scripts/update_platform.mjs";

const policyKeys = new Set(["woo.couponSync", "speech.transcription", "admin.grafana", "omini.moderation"]);
const numericFields = new Set(["dispatchBatchSize", "refreshIntervalMinutes", "dispatchCooldownMinutes", "unavailableRecheckMinutes",
  "staleScanMinutes", "maxPages", "requestTimeoutMs", "maxResponseBytes", "maxScanDurationMs", "workerConcurrency",
  "maxUploadBytes", "maxXlsxUncompressedBytes"]);
const nullableFields = new Set(["baseUrl", "logsUrl", "metricsUrl", "tracesUrl", "platformDashboardUrl"]);
const registry = new Map(PLATFORM_ENV_MAPPINGS.map((mapping) => [mapping.key, {
  key: mapping.key, kind: policyKeys.has(mapping.key) ? "policy" : "secret",
  fields: Object.keys(mapping.fields).map((name) => ({ name,
    kind: numericFields.has(name) ? "integer" : nullableFields.has(name) ? "nullable-https-url" : "secret",
    optional: ["groqApiKey", "openAiApiKey", "apiVersion", "commandHmacKey"].includes(name),
  })),
  defaults: Object.fromEntries(Object.keys(mapping.fields).map((name) => [name, numericFields.has(name) ? 2 :
    nullableFields.has(name) ? null : "default-model"])),
}]));

function createDb() {
  const rows = new Map();
  const audits = [];
  const keyFor = (environment, key) => `${environment}:${key}`;
  const copy = (value) => structuredClone(value);
  return {
    rows, audits,
    platformConfiguration: {
      async findUnique({ where: { environment_key: { environment, key } } }) {
        return rows.has(keyFor(environment, key)) ? copy(rows.get(keyFor(environment, key))) : null;
      },
      async create({ data }) {
        const id = keyFor(data.environment, data.key);
        if (rows.has(id)) throw new Error("unique violation");
        rows.set(id, copy(data));
      },
      async updateMany({ where: { environment, key, version }, data }) {
        const id = keyFor(environment, key);
        const current = rows.get(id);
        if (!current || current.version !== version) return { count: 0 };
        rows.set(id, { ...current, value: copy(data.value), version: current.version + data.version.increment, updatedBy: data.updatedBy });
        return { count: 1 };
      },
    },
    platformConfigurationAudit: { async create({ data }) { audits.push(copy(data)); } },
  };
}
function deps({ update = false, dryRun = false, counter = { sealed: 0 } } = {}) {
  const validatePolicy = (_contract, values) => ({ ok: true, values });
  const validateSecret = (key, values) => {
    const contract = registry.get(key);
    if (contract.fields.some((field) => !field.optional && !Object.hasOwn(values, field.name))) throw new Error("incomplete");
    return values;
  };
  return {
    update, dryRun, dbNull: null, validatePolicy, validateSecret,
    seal: ({ environment, key, version, plaintext }) => {
      counter.sealed++;
      return { kind: "sealed", schemaVersion: 1, environment, key, version, ciphertext: Buffer.from(plaintext).toString("base64") };
    },
    unseal: ({ environment, key, version, value }) => {
      assert.equal(value.environment, environment);
      assert.equal(value.key, key);
      assert.equal(value.version, version);
      return Buffer.from(value.ciphertext, "base64").toString("utf8");
    },
  };
}
const plan = (text) => planPlatformImport(parseEnvironmentFile(text), registry);
const run = (db, text, options) => applyPlatformImport(db, plan(text), deps(options));

test("parses dotenv and export lines without evaluating shell expressions", () => {
  const env = parseEnvironmentFile(` # comment\nexport HOST=localhost\n HOST = other # trailing comment\n A='literal # inside'\n B="quoted value"\n DB=secret#tag\n D=\$(touch /tmp/must-not-run)\n`);
  assert.equal(env.HOST, "other");
  assert.equal(env.A, "literal # inside");
  assert.equal(env.B, "quoted value");
  assert.equal(env.DB, "secret#tag");
  assert.equal(env.D, "$(touch /tmp/must-not-run)");
  assert.throws(() => parseEnvironmentFile("export MALFORMED\n"), /line 1/);
  assert.throws(() => parseEnvironmentFile("A='no closing quote\n"), /line 1/);
});

test("shell startup mode ignores unrelated commands while collecting literal exports", () => {
  const shellFile = [
    '# ~/.zshenv: never execute this file',
    'source "$HOME/.config/shell/environment"',
    'eval "$(mise activate zsh)"',
    'typeset -U path',
    'if [[ -f "$HOME/.secrets" ]]; then',
    '  export PATH="$HOME/bin:$PATH"',
    'fi',
    'function helper() { echo not-run; }',
    'export HOST=localhost',
    'export HOST',
    'export OPENAI_API_KEY="literal-secret"',
    "export GROQ_API_KEY='single-quoted-secret'",
    'export WHATSAPP_TRANSCRIPTION_PROVIDER=groq',
    'PROMPT="broken irrelevant prompt',
  ].join('\n');
  assert.throws(() => parseEnvironmentFile(shellFile), /Invalid environment assignment at line 2/);
  const parsed = parseEnvironmentFile(shellFile, { shellFile: true });
  assert.equal(parsed.OPENAI_API_KEY, 'literal-secret');
  assert.equal(parsed.GROQ_API_KEY, 'single-quoted-secret');
  assert.equal(parsed.WHATSAPP_TRANSCRIPTION_PROVIDER, 'groq');
  assert.equal(parsed.HOST, 'localhost');
  const planned = planPlatformImport(parsed, registry);
  assert.deepEqual(planned.groups.map((group) => group.key), ["speech.transcription", "ai.providers"]);
  assert.equal(Object.keys(parsed).includes('source'), false);
});

test("shell startup parser rejects unsafe known key declarations and interpolations", () => {
  assert.throws(() => parseEnvironmentFile('export OPENAI_API_KEY\n', { shellFile: true }), /OPENAI_API_KEY at line 1/);
  assert.throws(() => parseEnvironmentFile('export OPENAI_API_KEY = abc\n', { shellFile: true }), /OPENAI_API_KEY at line 1/);
  assert.throws(() => parseEnvironmentFile('OPENAI_API_KEY=abc def\n', { shellFile: true }), /OPENAI_API_KEY at line 1/);
  assert.throws(() => parseEnvironmentFile('OPENAI_API_KEY=$SECRET\n', { shellFile: true }), /OPENAI_API_KEY at line 1/);
  assert.throws(() => parseEnvironmentFile('OPENAI_API_KEY="${SECRET}"\n', { shellFile: true }), /OPENAI_API_KEY at line 1/);
  assert.throws(() => parseEnvironmentFile('OPENAI_API_KEY=$(security find-password)\n', { shellFile: true }), /OPENAI_API_KEY at line 1/);
  assert.throws(() => parseEnvironmentFile('OPENAI_API_KEY=`security find-password`\n', { shellFile: true }), /OPENAI_API_KEY at line 1/);
  assert.throws(() => parseEnvironmentFile("OPENAI_API_KEY=$'ansi-quote'\n", { shellFile: true }), /OPENAI_API_KEY at line 1/);
  assert.throws(() => parseEnvironmentFile('OPENAI_API_KEY=~/secret\n', { shellFile: true }), /OPENAI_API_KEY at line 1/);
  assert.throws(() => parseEnvironmentFile('OPENAI_API_KEY=foo\\#bar\n', { shellFile: true }), /OPENAI_API_KEY at line 1/);
  assert.throws(() => parseEnvironmentFile('DATABASE_URL="postgresql://${HOST}/db"\n', { shellFile: true }), /DATABASE_URL at line 1/);
  assert.equal(parseEnvironmentFile("OPENAI_API_KEY='literal${UNEXPANDED}'\n", { shellFile: true }).OPENAI_API_KEY, 'literal${UNEXPANDED}');
  assert.equal(parseEnvironmentFile('OPENAI_API_KEY="literal\\$UNEXPANDED"\n', { shellFile: true }).OPENAI_API_KEY, 'literal$UNEXPANDED');
});

test("shell startup file detection is based on the filename or --shell-file flag", () => {
  assert.equal(isShellStartupFile('/Users/example/.zshenv'), true);
  assert.equal(isShellStartupFile('/Users/example/.zshrc'), true);
  assert.equal(isShellStartupFile('/Users/example/.bash_profile'), true);
  assert.equal(isShellStartupFile('/Users/example/settings.env'), false);
  assert.equal(isShellStartupFile('/Users/example/.envrc'), false);
  assert.deepEqual(parseArguments(['settings.env', '--shell-file']), {
    file: 'settings.env', update: false, dryRun: false, shellFile: true,
  });
});

test("recognises canonical env mappings; ignores HOST, DATABASE_URL, MODA_CONFIG_UNSEAL_KEY", () => {
  const parsed = plan("export HOST=localhost\nDATABASE_URL=postgres://nowhere\nMODA_CONFIG_UNSEAL_KEY=external\nWOO_COUPON_SYNC_DISPATCH_BATCH_SIZE=8\n");
  assert.equal(parsed.ignoredCount, 3);
  assert.equal(parsed.groups.length, 1);
  assert.equal(parsed.groups[0].key, "woo.couponSync");
  assert.equal(parsed.groups[0].values.dispatchBatchSize, 8);
  assert.equal(parsed.groups[0].contract.kind, "policy");
});

test("inserts two environment-scoped policy records with audits; skips existing by default", async () => {
  const db = createDb();
  const env = "WOO_COUPON_SYNC_DISPATCH_BATCH_SIZE=8\n";
  const first = await run(db, env);
  assert.deepEqual(first.map((row) => row.environment), IMPORT_ENVIRONMENTS);
  assert.deepEqual(first.map((row) => row.status), ["created", "created"]);
  assert.equal(db.rows.size, 2);
  assert.equal(db.audits.length, 2);
  assert.deepEqual(db.rows.get("test:woo.couponSync").value, db.rows.get("development:woo.couponSync").value);
  assert.equal(db.rows.get("test:woo.couponSync").value.dispatchBatchSize, 8);
  assert.equal(db.rows.get("test:woo.couponSync").version, 1);
  assert.equal(db.audits[0].actorId, IMPORT_ACTOR);
  assert.equal(db.audits[0].expectedVersion, 0);
  assert.equal(db.audits[0].resultingVersion, 1);
  const second = await run(db, "WOO_COUPON_SYNC_DISPATCH_BATCH_SIZE=12\n");
  assert.deepEqual(second.map((row) => row.status), ["skipped-existing", "skipped-existing"]);
  assert.equal(db.rows.get("test:woo.couponSync").value.dispatchBatchSize, 8);
  assert.equal(db.audits.length, 2);
});

test("--update replaces only supplied policy fields, increments revision and audit once", async () => {
  const db = createDb();
  await run(db, "WOO_COUPON_SYNC_DISPATCH_BATCH_SIZE=8\n");
  const updated = await run(db, "export WOO_COUPON_SYNC_DISPATCH_BATCH_SIZE=12\n", { update: true });
  assert.deepEqual(updated.map((row) => row.status), ["updated", "updated"]);
  assert.equal(db.rows.get("test:woo.couponSync").version, 2);
  assert.equal(db.rows.get("development:woo.couponSync").version, 2);
  assert.equal(db.rows.get("test:woo.couponSync").value.dispatchBatchSize, 12);
  assert.equal(db.rows.get("test:woo.couponSync").value.maxPages, 2); // existing field preserved
  assert.deepEqual(db.audits.map((row) => row.resultingVersion), [1, 1, 2, 2]);
  assert.deepEqual((await run(db, "WOO_COUPON_SYNC_DISPATCH_BATCH_SIZE=12\n", { update: true })).map((row) => row.status), ["unchanged", "unchanged"]);
  assert.equal(db.audits.length, 4);
});

test("seals secrets separately for development/test; audits never contain secrets", async () => {
  const db = createDb();
  const counter = { sealed: 0 };
  const env = "SHOPIFY_API_KEY=key-demo\nexport SHOPIFY_API_SECRET=the-secret\n";
  const changes = await run(db, env, { counter });
  assert.deepEqual(changes.map((row) => row.status), ["created", "created"]);
  assert.equal(counter.sealed, 2);
  assert.equal(db.rows.get("development:shopify.oauth").value.environment, "development");
  assert.equal(db.rows.get("test:shopify.oauth").value.environment, "test");
  for (const audit of db.audits) {
    assert.deepEqual(audit.afterValue, { redacted: true, configured: true });
    assert.equal(audit.beforeValue, null);
    assert.equal(audit.reason, "initial-setup");
    assert.ok(!JSON.stringify(audit).includes("the-secret"));
  }
  const again = await run(db, "SHOPIFY_API_KEY=new-key\nSHOPIFY_API_SECRET=new-secret\n", { counter });
  assert.deepEqual(again.map((row) => row.status), ["skipped-existing", "skipped-existing"]);
  assert.equal(counter.sealed, 2);
});

test("--update preserves unspecified existing secret fields and reseals with incremented AAD revision", async () => {
  const db = createDb();
  await run(db, "GROQ_API_KEY=groq-old\nOPENAI_API_KEY=openai-old\n");
  const updated = await run(db, "OPENAI_API_KEY=openai-new\n", { update: true });
  assert.deepEqual(updated.map((row) => row.status), ["updated", "updated"]);
  for (const environment of IMPORT_ENVIRONMENTS) {
    const row = db.rows.get(`${environment}:ai.providers`);
    assert.equal(row.version, 2);
    const body = JSON.parse(Buffer.from(row.value.ciphertext, "base64").toString("utf8"));
    assert.deepEqual(body, { groqApiKey: "groq-old", openAiApiKey: "openai-new" });
  }
  assert.equal(db.audits.length, 4);
  assert.deepEqual(db.audits.slice(-2).map((row) => row.afterValue), [{ redacted: true, configured: true }, { redacted: true, configured: true }]);
  assert.deepEqual((await run(db, "OPENAI_API_KEY=openai-new\n", { update: true })).map((row) => row.status), ["unchanged", "unchanged"]);
});

test("Shopify App GID is preserved in separate development and test secret records", async () => {
  const appId = "gid://shopify/App/413747675137";
  const db = createDb();
  const text = [
    "SHOPIFY_PARTNER_ACCESS_TOKEN=test-token",
    "SHOPIFY_PARTNER_ORG_ID=partner-org-1",
    `SHOPIFY_APP_ID=${appId}`,
    "SHOPIFY_PARTNER_API_VERSION=2026-10",
  ].join("\n");
  const result = await run(db, text);
  assert.deepEqual(result.map((row) => row.status), ["created", "created"]);
  for (const environment of IMPORT_ENVIRONMENTS) {
    const row = db.rows.get(`${environment}:shopify.partner`);
    const fields = JSON.parse(Buffer.from(row.value.ciphertext, "base64").toString("utf8"));
    assert.equal(fields.appId, appId);
    assert.equal(fields.apiVersion, "2026-10");
    assert.equal(row.value.environment, environment);
  }
});

test("incomplete new secret groups are skipped, including with --update", async () => {
  const db = createDb();
  const outcome = await run(db, "SHOPIFY_API_KEY=some-key\n", { update: true });
  assert.deepEqual(outcome.map((item) => item.status), ["skipped-incomplete", "skipped-incomplete"]);
  assert.deepEqual(outcome[0].missing, ["apiSecret"]);
  assert.equal(db.rows.size, 0);
  assert.equal(db.audits.length, 0);
});

test("alias conflicts and non-integer values fail before database writes", () => {
  assert.throws(() => plan("SHOPIFY_PARTNER_API_TOKEN=one\nSHOPIFY_PARTNER_ACCESS_TOKEN=two\n"), /Conflicting environment aliases/);
  assert.throws(() => plan("WOO_COUPON_SYNC_MAX_PAGES=1.5\n"), /non-negative integer/);
  assert.deepEqual(plan("SHOPIFY_PARTNER_ORG_ID=same\nSHOPIFY_PARTNER_ORGANIZATION_ID=same\n").groups[0].values, { organizationId: "same" });
});

test("dry-run selects intended changes but makes no writes", async () => {
  const db = createDb();
  const proposed = await run(db, "SHOPIFY_API_KEY=key-demo\nSHOPIFY_API_SECRET=the-secret\n", { dryRun: true });
  assert.deepEqual(proposed.map((row) => row.status), ["would-create", "would-create"]);
  assert.equal(db.rows.size, 0);
  assert.equal(db.audits.length, 0);
  await run(db, "GROQ_API_KEY=old\n");
  const update = await run(db, "GROQ_API_KEY=new\n", { dryRun: true, update: true });
  assert.deepEqual(update.map((row) => row.status), ["would-update", "would-update"]);
  assert.equal(db.rows.get("test:ai.providers").version, 1);
  assert.equal(db.audits.length, 2);
});

test("flags default to insert-only; --update enables changes; unknown flags refused", () => {
  assert.deepEqual(parseArguments(["settings.env"]), { file: "settings.env", update: false, dryRun: false, shellFile: false });
  assert.deepEqual(parseArguments(["settings.env", "--update"]), { file: "settings.env", update: true, dryRun: false, shellFile: false });
  assert.deepEqual(parseArguments(["--dry-run", "settings.env"]), { file: "settings.env", update: false, dryRun: true, shellFile: false });
  assert.deepEqual(parseArguments(["--help"]), { help: true });
  assert.throws(() => parseArguments(["settings.env", "--production"]), /Usage:/);
  assert.throws(() => parseArguments(["settings.env", "--update", "--update"]), /Usage:/);
});


test("both update_platform entrypoints activate the ESM import condition", () => {
  const launcher = readFileSync(new URL("../../scripts/update_platform", import.meta.url), "utf8");
  const manifest = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  assert.match(launcher, /exec node --conditions=import --import tsx /);
  assert.equal(manifest.scripts.update_platform, "node --conditions=import --import tsx scripts/update_platform.mjs");
});

test("importer and Admin sealing share one keyring factory; raw secret keys are never logged", () => {
  const importer = readFileSync(new URL("../../scripts/update_platform.mjs", import.meta.url), "utf8");
  const sealer = readFileSync(new URL("../../src/lib/admin/platform-configuration/seal.ts", import.meta.url), "utf8");
  assert.match(importer, /createConfigUnsealKeyring\(/);
  assert.doesNotMatch(importer, /import\("@modainteract\/moda-interact-shared\/security\/credentials\/node"\)/);
  assert.match(sealer, /export function createConfigUnsealKeyring\(/);
  assert.match(sealer, /const keyring = parseCredentialKeyring\(raw\)/);
  assert.doesNotMatch(sealer, /error: process\.env\.MODA_CONFIG_UNSEAL_KEY/);
  assert.doesNotMatch(sealer, /error: process\.env\.MODA_CONFIG_UNSEAL_ACTIVE_KEY_ID/);
});

test("import condition allows CommonJS to resolve an import-only Shared entrypoint", (t) => {
  const fixture = mkdtempSync(join(tmpdir(), "moda-shared-import-condition-"));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const packageDir = join(fixture, "node_modules", "@modainteract", "moda-interact-shared");
  mkdirSync(join(packageDir, "dist", "security", "credentials"), { recursive: true });
  writeFileSync(join(packageDir, "package.json"), JSON.stringify({
    name: "@modainteract/moda-interact-shared",
    type: "module",
    exports: { "./security/credentials/node": { import: "./dist/security/credentials/node.js" } },
  }));
  writeFileSync(join(packageDir, "dist", "security", "credentials", "node.js"), "export const marker = 'shared-ok';\n");
  writeFileSync(join(fixture, "probe.cjs"),
    "process.stdout.write(require('@modainteract/moda-interact-shared/security/credentials/node').marker);\n");
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  const missing = spawnSync(process.execPath, ["probe.cjs"], { cwd: fixture, encoding: "utf8", env });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /ERR_PACKAGE_PATH_NOT_EXPORTED/);
  const resolved = spawnSync(process.execPath, ["--conditions=import", "probe.cjs"], {
    cwd: fixture, encoding: "utf8", env,
  });
  assert.equal(resolved.status, 0, resolved.stderr);
  assert.equal(resolved.stdout, "shared-ok");
});


test("dry-run reports safe canonical secret validation reasons without exposing values", async () => {
  const db = createDb();
  const text = [
    "MERCHANT_KNOWLEDGE_R2_ENDPOINT=https://invalid-host.test",
    "MERCHANT_KNOWLEDGE_R2_BUCKET=valid-bucket",
    "MERCHANT_KNOWLEDGE_R2_ACCESS_KEY_ID=key-from-input",
    "MERCHANT_KNOWLEDGE_R2_SECRET_ACCESS_KEY=confidential-input-value",
    "MERCHANT_KNOWLEDGE_MAX_UPLOAD_BYTES=1000",
    "MERCHANT_KNOWLEDGE_MAX_XLSX_UNCOMPRESSED_BYTES=2000",
  ].join("\n");
  const validation = deps({ dryRun: true });
  validation.validateSecret = () => {
    const error = new Error("Invalid Cloudflare R2 location.");
    error.name = "ConfigurationError";
    error.code = "INVALID_INPUT";
    throw error;
  };
  await assert.rejects(
    applyPlatformImport(db, plan(text), validation),
    (error) => {
      assert.match(error.message, /merchant\.knowledge\.r2: Invalid Cloudflare R2 location\./);
      assert.ok(!error.message.includes("confidential-input-value"));
      assert.ok(!error.message.includes("key-from-input"));
      return true;
    },
  );
  assert.equal(db.rows.size, 0);
  assert.equal(db.audits.length, 0);
});

test("unrecognised secret validation exception messages are never revealed", async () => {
  const db = createDb();
  const validation = deps({ dryRun: true });
  validation.validateSecret = () => {
    const error = new Error("unexpected credential value: super-secret-value");
    error.name = "ConfigurationError";
    error.code = "INVALID_INPUT";
    throw error;
  };
  await assert.rejects(
    applyPlatformImport(db, plan("SHOPIFY_API_KEY=key\nSHOPIFY_API_SECRET=secret\n"), validation),
    (error) => {
      assert.match(error.message, /Invalid secret fields for shopify\.oauth; no records were written\./);
      assert.ok(!error.message.includes("super-secret-value"));
      return true;
    },
  );
  assert.equal(db.rows.size, 0);
});

test("live update also reports only approved canonical validation reasons", async () => {
  const db = createDb();
  const validation = deps({ update: true });
  validation.validateSecret = () => {
    const error = new Error("Uncompressed XLSX limit cannot be lower than upload limit.");
    error.name = "ConfigurationError";
    error.code = "INVALID_INPUT";
    throw error;
  };
  const text = [
    "MERCHANT_KNOWLEDGE_R2_ENDPOINT=https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.r2.cloudflarestorage.com",
    "MERCHANT_KNOWLEDGE_R2_BUCKET=valid-bucket",
    "MERCHANT_KNOWLEDGE_R2_ACCESS_KEY_ID=key",
    "MERCHANT_KNOWLEDGE_R2_SECRET_ACCESS_KEY=secret",
    "MERCHANT_KNOWLEDGE_MAX_UPLOAD_BYTES=5000",
    "MERCHANT_KNOWLEDGE_MAX_XLSX_UNCOMPRESSED_BYTES=1000",
  ].join("\n");
  await assert.rejects(
    applyPlatformImport(db, plan(text), validation),
    /merchant\.knowledge\.r2: Uncompressed XLSX limit cannot be lower than upload limit\./,
  );
  assert.equal(db.rows.size, 0);
  assert.equal(db.audits.length, 0);
});


test("Shopify Partner diagnostics name the invalid field and never reveal identity or token values", async () => {
  const cases = [
    ["Invalid Shopify Partner organisation ID.", "organizationId"],
    ["Invalid Shopify application ID.", "appId"],
    ["Invalid Shopify Partner API version.", "apiVersion"],
  ];
  const text = [
    "SHOPIFY_PARTNER_ACCESS_TOKEN=private-partner-token",
    "SHOPIFY_PARTNER_ORG_ID=private-organisation-id",
    "SHOPIFY_APP_ID=private-app-id",
    "SHOPIFY_PARTNER_API_VERSION=2026-10",
  ].join("\n");
  for (const [reason, field] of cases) {
    const db = createDb();
    const validation = deps({ dryRun: true });
    validation.validateSecret = () => {
      const error = new Error(reason);
      error.name = "ConfigurationError";
      error.code = "INVALID_INPUT";
      throw error;
    };
    await assert.rejects(
      applyPlatformImport(db, plan(text), validation),
      (error) => {
        assert.match(error.message, /Invalid secret fields for shopify\.partner:/);
        assert.ok(error.message.includes(reason));
        assert.ok(!error.message.includes("private-partner-token"));
        assert.ok(!error.message.includes("private-organisation-id"));
        assert.ok(!error.message.includes("private-app-id"));
        assert.ok(!error.message.includes("2026-10"));
        assert.ok(error.message.includes("no records were written"));
        return true;
      },
      `${field} failure must be specific and redact input`,
    );
    assert.equal(db.rows.size, 0);
    assert.equal(db.audits.length, 0);
  }
});
