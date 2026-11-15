import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { PLATFORM_POLICY_REGISTRY, publicContracts, validateConfiguration } from "../../src/lib/admin/platform-configuration/contracts";
import { ROUTING_AGENT_CONTRACT, validateRoutingAgentPolicy } from "../../src/lib/admin/platform-configuration/routing-agent-contract";
import { validateRoutingAgentReferences } from "../../src/lib/admin/platform-configuration/routing-agent-references";
import { publishRoutingPromptWithDependencies } from "../../src/lib/admin/platform-configuration/routing-agent-prompts";
import { mutateConfigurationWithDependencies } from "../../src/lib/admin/platform-configuration/mutate";
import { readConfigurationHistory } from "../../src/lib/admin/platform-configuration/repository";
import { routingDraft, routingDraftPayload } from "../../src/components/admin/platform-configuration/routing-agent-fields";

export const policy = {
  schemaVersion: 1, enabled: true, modelBinding: { kind: "FIXED_CATALOGUE", modelCatalogueEntryId: "model-platform" },
  promptRevisionId: "prompt-routing", wrapperAudience: "ROUTER", confidenceThreshold: 83,
  budget: { deadlineMs: 13000, outputTokens: 1400, toolCalls: 0 }, retry: { maxAttempts: 2, backoffMs: 250 },
  input: { maxHistoryMessages: 8, maxInputCharacters: 12000, maxCandidates: 12 }, decisionTTLms: 60000, retentionMs: 180000,
};

test("complete nested policy is registered without defaults/reset and public descriptors omit functions", () => {
  assert.deepEqual(validateConfiguration(ROUTING_AGENT_CONTRACT, policy), { ok: true, values: policy });
  assert.equal(PLATFORM_POLICY_REGISTRY.get("recovery.routingAgent"), ROUTING_AGENT_CONTRACT);
  assert.equal(ROUTING_AGENT_CONTRACT.defaults, undefined);
  assert.equal(ROUTING_AGENT_CONTRACT.defaultsOnRead, undefined);
  assert.equal(ROUTING_AGENT_CONTRACT.canReset, false);
  const descriptor = publicContracts().find((item) => item.key === "recovery.routingAgent")!;
  assert.equal("validate" in descriptor, false);
  assert.equal("refine" in descriptor, false);
  assert.equal(descriptor.editor, "routing-agent");
});

test("all attributes required, strict nested fields, no credentials, coercion, partial disabled policy or inheritance leftovers", () => {
  for (const key of Object.keys(policy)) {
    const missing: Record<string, unknown> = { ...policy }; delete missing[key];
    assert.equal(validateRoutingAgentPolicy(missing).ok, false, key);
  }
  for (const key of ["budget", "retry", "input", "modelBinding"] as const) {
    assert.equal(validateRoutingAgentPolicy({ ...policy, [key]: { ...policy[key], apiKey: "never" } }).ok, false);
  }
  for (const value of [null, {}, { enabled: false }, { ...policy, credentials: "secret" }, { ...policy, confidenceThreshold: 101 }, { ...policy, confidenceThreshold: "83" }, { ...policy, retentionMs: 1 }, { ...policy, modelBinding: { kind: "VERIFIED_SHOP_INHERIT", modelCatalogueEntryId: "model-platform" } }]) assert.equal(validateRoutingAgentPolicy(value).ok, false);
  const prototypeKey = JSON.parse(JSON.stringify(policy).replace('{"schemaVersion":', '{"__proto__":"unsupported","schemaVersion":'));
  assert.equal(validateRoutingAgentPolicy(prototypeKey).ok, false, "all own JSON keys are rejected, including prototype-named keys");
  assert.equal(validateRoutingAgentPolicy({ ...policy, enabled: false }).ok, true);
  assert.equal(validateRoutingAgentPolicy({ ...policy, modelBinding: { kind: "VERIFIED_SHOP_INHERIT" } }).ok, true);
  assert.equal(validateRoutingAgentPolicy(routingDraftPayload(routingDraft(null))).ok, false, "empty numeric controls cannot become valid zero defaults");
  assert.deepEqual(routingDraftPayload(routingDraft(policy)), policy);
});

function references(options: { prompt?: Record<string, unknown>; model?: Record<string, unknown>; normalAgent?: unknown } = {}) {
  const promptText = "Select a basket only from verified same-shop facts.";
  const prompt = { id: "prompt-routing", status: "PUBLISHED", promptText, contentHash: createHash("sha256").update(promptText).digest("hex"), publishedAt: new Date(), sourceContext: { purpose: "RECOVERY_ROUTING", schemaVersion: 1 }, prompt: { scope: "PLATFORM", shopId: null }, ...options.prompt };
  const model = { id: "model-platform", enabled: true, provider: "deepseek", providerModelId: "deepseek-chat", configurationSchemaVersion: 1, configuration: {}, availability: { scope: "PLATFORM", shopId: null, enabled: true }, ...options.model };
  return { commerceAgentPromptRevision: { findUnique: async () => prompt }, commerceAgentConfiguration: { findFirst: async () => options.normalAgent ?? null }, commerceModelCatalogueEntry: { findUnique: async () => model } };
}

test("references reject wrong prompt purpose/scope/hash/draft, disabled or shop model and normal pointer reuse", async () => {
  await validateRoutingAgentReferences(references() as never, "recovery.routingAgent", policy);
  for (const prompt of [{ status: "DRAFT" }, { sourceContext: null }, { sourceContext: { purpose: "RECOVERY_ROUTING", schemaVersion: 2 } }, { contentHash: "0".repeat(64) }, { prompt: { scope: "SHOP", shopId: "shop-A" } }]) await assert.rejects(validateRoutingAgentReferences(references({ prompt }) as never, "recovery.routingAgent", policy), /published platform routing/);
  for (const model of [{ enabled: false }, { availability: { enabled: false, scope: "PLATFORM", shopId: null } }, { availability: { enabled: true, scope: "SHOP", shopId: "shop-A" } }, { configuration: { apiKey: "never" } }]) await assert.rejects(validateRoutingAgentReferences(references({ model }) as never, "recovery.routingAgent", policy));
  await assert.rejects(validateRoutingAgentReferences(references({ normalAgent: { id: "normal" } }) as never, "recovery.routingAgent", policy), /separate/);
  const inherited = { ...policy, modelBinding: { kind: "VERIFIED_SHOP_INHERIT" } };
  const inheritedDb = references(); inheritedDb.commerceModelCatalogueEntry.findUnique = async () => { throw new Error("must not invent shop/model"); };
  await validateRoutingAgentReferences(inheritedDb as never, "recovery.routingAgent", inherited);
});

test("mutation and prompt publishing reject unprivileged callers before database access", async () => {
  const dependencies = { principal: { role: "ADMIN" }, environment: "test", actorId: "admin", db: {} as never, registry: PLATFORM_POLICY_REGISTRY };
  await assert.rejects(mutateConfigurationWithDependencies({ key: "recovery.routingAgent", expectedVersion: 0, values: policy }, "save", dependencies), /SUPER_ADMIN/);
  await assert.rejects(publishRoutingPromptWithDependencies({ promptText: "routing", reason: "reviewed", expectedLatestRevisionNumber: 0 }, dependencies), /SUPER_ADMIN/);
  await assert.rejects(mutateConfigurationWithDependencies({ key: "recovery.routingAgent", expectedVersion: 0 }, "reset", { ...dependencies, principal: { role: "SUPER_ADMIN" } }), /no safe reset defaults/);
});

test("invalid historical routing JSON never exposes unknown secret values", async () => {
  const history = await readConfigurationHistory({ platformConfigurationAudit: { findMany: async () => [{ id: "audit-1", expectedVersion: 0, resultingVersion: 1, beforeValue: { apiKey: "sensitive-test-value" }, afterValue: policy, actorId: "admin", reason: null, createdAt: new Date() }] } } as never, "test", "recovery.routingAgent");
  assert.deepEqual(history.entries[0].beforeValue, { invalidStoredValue: true });
  assert.deepEqual(history.entries[0].afterValue, policy);
  assert.equal(JSON.stringify(history).includes("sensitive-test-value"), false);
});
