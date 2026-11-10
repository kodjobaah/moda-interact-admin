import assert from "node:assert/strict";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { canonicalConversationWrapper, initializeConversationWrapper, INITIALIZER_SUBMISSION_ID } from "../../src/lib/admin/whatsapp-templates/wrappers/initialize.ts";
import { compileTemplateAst } from "../../src/lib/admin/whatsapp-templates/authoring/compiler.ts";
import { definitionIdForSubmit, templateHash } from "../../src/lib/admin/whatsapp-templates/authoring/identifiers.ts";
import { REVIEW_LANGUAGES } from "../../src/lib/admin/whatsapp-templates/compilation/language-codes.ts";
const { parseArguments } = await import(pathToFileURL(path.resolve("scripts/initialize-conversation-wrapper.mjs")).href);
const args = ["--environment=test", "--actor-admin-email=admin@example.com", "--reason=Approve structural conversation wrapper"];
const input = { environment: "test" as const, actorAdminEmail: "admin@example.com", reason: "Approve structural conversation wrapper" };
const code = (expected: string) => (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === expected;

test("CLI defaults to dry-run and accepts only exact, unique flags with bounded required values", () => {
  assert.equal(parseArguments(args).mode, "DRY_RUN");
  assert.equal(parseArguments([args[0], "--actor-admin-email= Admin@Example.COM ", args[2]]).actorAdminEmail, "admin@example.com");
  assert.throws(() => parseArguments([args[0], "--actor-admin-email=not-an-email", args[2]]), code("INVALID_ARGUMENT"));
  assert.throws(() => parseArguments([args[0], "--actor-admin-id=existing-admin", args[2]]), code("INVALID_ARGUMENT"));
  assert.equal(parseArguments([...args, "--apply"]).mode, "APPLY");
  assert.equal(parseArguments([...args, "--dry-run"]).mode, "DRY_RUN");
  // Parsing the supported production spelling does not run initialization in that environment.
  assert.equal(parseArguments(args.map((value) => value === "--environment=test" ? "--environment=production" : value)).environment, "production");
  for (const invalid of [[], args.slice(1), [...args, "--force"], [...args, "--apply", "--dry-run"], [...args, "--apply", "--apply"], [...args, args[0]], [...args, "--reason=again"], args.map((value) => value.startsWith("--reason=") ? "--reason=short" : value), args.map((value) => value.startsWith("--reason=") ? `--reason=${"x".repeat(501)}` : value), ["--environment=staging", ...args.slice(1)], ["--environment", "test", ...args.slice(1)], [...args, "positional"]]) {
    assert.throws(() => parseArguments(invalid), code("INVALID_ARGUMENT"));
  }
  assert.equal(parseArguments([args[0], args[1], "--reason=Operator approval: x=y, preserve exact context"]).reason, "Operator approval: x=y, preserve exact context");
});

test("canonical source has only response.body and the exact optional image binding", () => {
  assert.deepEqual(canonicalConversationWrapper(), {
    schemaVersion: 1, family: "MODA_CONVERSATION_WRAPPER", sourceLanguageTag: "en", audience: "AI", header: [],
    body: [{ type: "slot", name: "response.body" }], footer: [], conditionals: [],
    productImage: { variable: "response.productImage", placement: "BEFORE_BODY", optional: true },
  });
  assert.equal(INITIALIZER_SUBMISSION_ID, "e14e7967-05bb-4a5c-bacf-0663b42b37d5");
  assert.equal(REVIEW_LANGUAGES.length, 20);
  assert.equal(new Set(REVIEW_LANGUAGES).size, 20);
});

test("invalid arguments and environment mismatch fail before database access", async () => {
  let calls = 0;
  const db = { $transaction: async () => { calls++; throw new Error("must not connect"); } };
  await assert.rejects(initializeConversationWrapper({ ...input, mode: "WRITE" } as never, { db } as never), code("INVALID_ARGUMENT"));
  await assert.rejects(initializeConversationWrapper({ ...input, force: true } as never, { db } as never), code("INVALID_ARGUMENT"));
  await assert.rejects(initializeConversationWrapper(input, { db, resolveEnvironment: () => "development" } as never), code("ENVIRONMENT_MISMATCH"));
  assert.equal(calls, 0);
});

test("dry-run uses SERIALIZABLE read-only intent and reports stable planned identity/hashes/current pointer", async () => {
  let writes = 0; let options: unknown;
  const forbidden = () => { writes++; throw new Error("dry-run write"); };
  const tx = {
    platformAdmin: { findUnique: async (query: unknown) => { assert.deepEqual(query, { where: { email: "admin@example.com" }, select: { id: true, role: true, active: true } }); return { id: "existing-admin", role: "SUPER_ADMIN", active: true }; }, create: forbidden, update: forbidden },
    whatsAppTemplateDefinition: { findUnique: async () => null, create: forbidden },
    whatsAppConversationWrapperActiveSlot: { findUnique: async () => null, create: forbidden },
    whatsAppTemplateLocale: { create: forbidden }, commerceAuditEvent: { create: forbidden },
  };
  const db = { $transaction: async (run: (tx: unknown) => Promise<unknown>, config: unknown) => { options = config; return run(tx); } };
  const result = await initializeConversationWrapper(input, { db, resolveEnvironment: () => "test" } as never);
  assert.equal(result.status, "DRY_RUN"); assert.equal(result.action, "CREATED_AND_ACTIVATED");
  assert.equal(result.plannedDefinitionId, definitionIdForSubmit("existing-admin", INITIALIZER_SUBMISSION_ID));
  assert.equal(result.sourceHash, templateHash(canonicalConversationWrapper()));
  assert.equal(result.contentHash, templateHash(compileTemplateAst(canonicalConversationWrapper())));
  assert.equal(result.currentPointer, null); assert.equal(result.localeCount, REVIEW_LANGUAGES.length);
  assert.equal(writes, 0); assert.deepEqual(options, { isolationLevel: "Serializable", timeout: 10000 });
});

test("actor must already exist, be active, and have SUPER_ADMIN role", async () => {
  for (const actor of [null, { id: "existing-admin", role: "ADMIN", active: true }, { id: "existing-admin", role: "SUPER_ADMIN", active: false }]) {
    const db = { $transaction: async (run: (tx: unknown) => Promise<unknown>) => run({ platformAdmin: { findUnique: async () => actor } }) };
    await assert.rejects(initializeConversationWrapper(input, { db, resolveEnvironment: () => "test" } as never), code("ACTOR_DENIED"));
  }
});

test("CLI invalid argument output is typed and never echoes supplied values or stack traces", () => {
  const result = spawnSync(process.execPath, ["scripts/initialize-conversation-wrapper.mjs", "--unknown=private-token-customer-data"], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stderr), { status: "FAILED", code: "INVALID_ARGUMENT" });
  assert.equal(result.stdout, ""); assert.doesNotMatch(result.stderr, /private-token|customer-data|stack|Prisma/);
});


test("native CLI loads the real core and refuses a mismatched runtime before database access", () => {
  const result = spawnSync(process.execPath, ["scripts/initialize-conversation-wrapper.mjs", ...args], { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, DEPLOYMENT_ENVIRONMENT_NAME: "development", NODE_ENV: "test" } });
  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stderr), { status: "FAILED", code: "ENVIRONMENT_MISMATCH" });
  assert.equal(result.stdout, "");
});
