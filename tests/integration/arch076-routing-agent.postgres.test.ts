import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test, after, before } from "node:test";
import { PrismaClient } from "@prisma/client";
import { PLATFORM_POLICY_REGISTRY } from "../../src/lib/admin/platform-configuration/contracts.ts";
import { mutateConfigurationWithDependencies } from "../../src/lib/admin/platform-configuration/mutate.ts";
import { readConfiguration, readConfigurationHistory } from "../../src/lib/admin/platform-configuration/repository.ts";
import { publishRoutingPromptWithDependencies } from "../../src/lib/admin/platform-configuration/routing-agent-prompts.ts";
import { getAgentInstructionsScopeData, mutateAgentInstructions } from "../../src/lib/admin/agent-instructions.ts";

if (process.env.ARCH076_DISPOSABLE_POSTGRES !== "1") throw new Error("Refusing non-disposable database");
const db = new PrismaClient();
after(async () => db.$disconnect());
const actorId = "arch076-routing-admin";
const dependencies = { principal: { role: "SUPER_ADMIN" }, actorId, environment: "test", db, registry: PLATFORM_POLICY_REGISTRY };
const normalText = "Normal customer response instructions.";
let lineageId: string; let normalRevisionId: string; let routingRevisionId: string;
const policy = () => ({ schemaVersion: 1, enabled: true, modelBinding: { kind: "FIXED_CATALOGUE", modelCatalogueEntryId: "arch076-platform-model" }, promptRevisionId: routingRevisionId, wrapperAudience: "ROUTER", confidenceThreshold: 85,
  budget: { deadlineMs: 15000, outputTokens: 1200, toolCalls: 0 }, retry: { maxAttempts: 2, backoffMs: 300 }, input: { maxHistoryMessages: 8, maxInputCharacters: 10000, maxCandidates: 10 }, decisionTTLms: 60000, retentionMs: 120000 });
const save = (expectedVersion: number, values = policy()) => mutateConfigurationWithDependencies({ key: "recovery.routingAgent", expectedVersion, values, reason: "routing fixture" }, "save", dependencies);

before(async () => {
  await db.platformAdmin.create({ data: { id: actorId, email: "arch076@example.invalid", role: "SUPER_ADMIN", active: true } });
  const lineage = await db.commerceAgentPrompt.findFirst({ where: { scope: "PLATFORM", shopId: null } }) ?? await db.commerceAgentPrompt.create({ data: { scope: "PLATFORM", shopId: null } });
  lineageId = lineage.id;
  const maximum = await db.commerceAgentPromptRevision.aggregate({ where: { promptId: lineageId }, _max: { revisionNumber: true } });
  const revision = await db.commerceAgentPromptRevision.create({ data: { promptId: lineageId, revisionNumber: (maximum._max.revisionNumber ?? 0) + 1, status: "PUBLISHED", promptText: normalText, contentHash: createHash("sha256").update(normalText).digest("hex"), publishedAt: new Date() } });
  normalRevisionId = revision.id;
  const existing = await db.commerceAgentConfiguration.findFirst({ where: { environment: "TEST", scope: "PLATFORM", shopId: null } });
  if (existing) await db.commerceAgentConfiguration.update({ where: { id: existing.id }, data: { activePromptRevisionId: normalRevisionId } });
  else await db.commerceAgentConfiguration.create({ data: { environment: "TEST", scope: "PLATFORM", shopId: null, activePromptRevisionId: normalRevisionId } });
  const availability = await db.commerceModelAvailability.findFirst({ where: { scope: "PLATFORM", shopId: null } }) ?? await db.commerceModelAvailability.create({ data: { scope: "PLATFORM", shopId: null, enabled: true } });
  await db.commerceModelAvailability.update({ where: { id: availability.id }, data: { enabled: true } });
  await db.commerceModelCatalogueEntry.create({ data: { id: "arch076-platform-model", availabilityId: availability.id, provider: "deepseek", providerModelId: "deepseek-chat", displayName: "Routing fixture", enabled: true, configuration: {}, createdByAdminId: actorId, updatedByAdminId: actorId } });
});

test("dedicated publication is audited, CAS-protected and never activates or seeds normal agent", async () => {
  const latest = await db.commerceAgentPromptRevision.aggregate({ where: { promptId: lineageId }, _max: { revisionNumber: true } });
  const input = { promptText: "Classify the customer intent and choose only a verified basket.", expectedLatestRevisionNumber: latest._max.revisionNumber ?? 0, reason: "explicit routing publication" };
  const published = await publishRoutingPromptWithDependencies(input, dependencies); routingRevisionId = published.id;
  const row = await db.commerceAgentPromptRevision.findUniqueOrThrow({ where: { id: routingRevisionId } });
  assert.deepEqual(row.sourceContext, { purpose: "RECOVERY_ROUTING", schemaVersion: 1 });
  assert.equal(row.contentHash, createHash("sha256").update(input.promptText).digest("hex"));
  const active = await db.commerceAgentConfiguration.findFirstOrThrow({ where: { environment: "TEST", scope: "PLATFORM", shopId: null } });
  assert.equal(active.activePromptRevisionId, normalRevisionId);
  const audit = await db.commerceAuditEvent.findFirstOrThrow({ where: { agentPromptRevisionId: routingRevisionId } });
  assert.equal(audit.action, "PUBLISH_AGENT_PROMPT_REVISION");
  assert.equal((audit.metadata as Record<string, unknown>).activatesCommerceAgent, false);
  await assert.rejects(publishRoutingPromptWithDependencies(input, dependencies), /history changed/);
  const view = await getAgentInstructionsScopeData(db, "TEST", "PLATFORM", null);
  assert.equal(view.active?.id, normalRevisionId);
  assert.equal(view.history.some((item) => item.id === routingRevisionId), false);
  await assert.rejects(db.$transaction((tx) => mutateAgentInstructions(tx, { kind: "activate", promptRevisionId: routingRevisionId, scope: "PLATFORM", shopId: null, expectedConfigurationPromptEditVersion: active.promptEditVersion, reason: "forbidden routing activation" }, actorId)), /unavailable/);
  const draftId = await db.$transaction((tx) => mutateAgentInstructions(tx, { kind: "create-draft", scope: "PLATFORM", shopId: null, reason: "normal draft still uses normal seed" }, actorId));
  const draft = await db.commerceAgentPromptRevision.findUniqueOrThrow({ where: { id: draftId } });
  assert.equal(draft.promptText, normalText);
  assert.equal((draft.sourceContext as Record<string, unknown> | null)?.purpose, undefined);
  // No active pointer: the latest published routing revision must never become
  // the normal commerce fallback seed either.
  await db.commerceAuditEvent.deleteMany({ where: { agentPromptRevisionId: draft.id } });
  await db.commerceAgentPromptRevision.delete({ where: { id: draft.id } });
  await db.commerceAgentConfiguration.update({ where: { id: active.id }, data: { activePromptRevisionId: null } });
  const fallbackId = await db.$transaction((tx) => mutateAgentInstructions(tx, { kind: "create-draft", scope: "PLATFORM", shopId: null, reason: "normal fallback isolation" }, actorId));
  assert.equal((await db.commerceAgentPromptRevision.findUniqueOrThrow({ where: { id: fallbackId } })).promptText, normalText);
  await db.commerceAgentConfiguration.update({ where: { id: active.id }, data: { activePromptRevisionId: normalRevisionId } });
});

test("settings save/replay conflict audit preserves normal model and prompt state", async () => {
  const before = await db.commerceAgentConfiguration.findMany({ orderBy: { id: "asc" } });
  assert.equal((await readConfiguration(db, "test", "recovery.routingAgent", PLATFORM_POLICY_REGISTRY)).value, null);
  assert.equal((await save(0)).version, 1);
  const results = await Promise.allSettled([save(1, { ...policy(), confidenceThreshold: 86 }), save(1, { ...policy(), confidenceThreshold: 87 })]);
  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal((await readConfigurationHistory(db, "test", "recovery.routingAgent")).entries.length, 2);
  assert.deepEqual(await db.commerceAgentConfiguration.findMany({ orderBy: { id: "asc" } }), before);
  assert.equal((await readConfiguration(db, "production", "recovery.routingAgent", PLATFORM_POLICY_REGISTRY)).value, null);
});

test("invalid references and privileges create neither policy revision nor audit", async () => {
  const version = (await readConfiguration(db, "test", "recovery.routingAgent", PLATFORM_POLICY_REGISTRY)).version;
  const count = await db.platformConfigurationAudit.count({ where: { key: "recovery.routingAgent" } });
  await assert.rejects(save(version, { ...policy(), promptRevisionId: normalRevisionId }), /routing prompt/);
  await assert.rejects(save(version, { ...policy(), promptRevisionId: "missing" }), /routing prompt/);
  await db.commerceModelCatalogueEntry.update({ where: { id: "arch076-platform-model" }, data: { enabled: false } });
  await assert.rejects(save(version), /enabled model/);
  await db.commerceModelCatalogueEntry.update({ where: { id: "arch076-platform-model" }, data: { enabled: true } });
  const shop = await db.shop.create({ data: { domain: "routing-fixture.myshopify.com" } });
  const shopPrompt = await db.commerceAgentPrompt.create({ data: { scope: "SHOP", shopId: shop.id } });
  const shopRevision = await db.commerceAgentPromptRevision.create({ data: { promptId: shopPrompt.id, revisionNumber: 1, status: "PUBLISHED", promptText: "private shop", contentHash: createHash("sha256").update("private shop").digest("hex"), publishedAt: new Date(), sourceContext: { purpose: "RECOVERY_ROUTING", schemaVersion: 1 } } });
  await assert.rejects(save(version, { ...policy(), promptRevisionId: shopRevision.id }), /platform routing/);
  await assert.rejects(mutateConfigurationWithDependencies({ key: "recovery.routingAgent", expectedVersion: version, values: policy() }, "save", { ...dependencies, principal: { role: "ADMIN" } }), /SUPER_ADMIN/);
  assert.equal(await db.platformConfigurationAudit.count({ where: { key: "recovery.routingAgent" } }), count);
  assert.equal((await readConfiguration(db, "test", "recovery.routingAgent", PLATFORM_POLICY_REGISTRY)).version, version);
});
