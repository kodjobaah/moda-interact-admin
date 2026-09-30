import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { mutateAgentInstructions, validatePromptText } from "../../src/lib/admin/agent-instructions.ts";
import { resolveAdminCommerceEnvironment } from "../../src/lib/admin/commerce-environment.ts";

function makePromotionTransaction(options: { configurationConflict?: boolean; profileConflict?: boolean } = {}) {
  const state = {
    revision: {
      id: "shop-revision-2",
      promptId: "shop-prompt",
      revisionNumber: 2,
      status: "DRAFT",
      editVersion: 4,
      promptText: "Canonical instructions\nKeep exact whitespace.  ",
      contentHash: null,
      publishedAt: null,
      sourceTemplateId: "template-home",
      sourceTemplateEditVersion: 7,
      prompt: { scope: "SHOP", shopId: "shop-1" },
    },
    configuration: {
      id: "shop-config",
      environment: "PRODUCTION",
      scope: "SHOP",
      shopId: "shop-1",
      activePromptRevisionId: "shop-revision-1",
      promptEditVersion: 5,
      modelId: "model-1",
      modelEditVersion: 3,
    },
    profile: {
      shopId: "shop-1",
      activeCategoryId: "category-old",
      activeCategoryActivatedAt: new Date("2026-01-01T00:00:00.000Z"),
      pendingCategoryId: "category-home",
      pendingPromptRevisionId: "shop-revision-2",
      pendingSelectedAt: new Date("2026-09-30T12:00:00.000Z"),
      pendingSelectionGeneration: 9,
      pendingCategory: { defaultTemplateId: "template-home" },
    },
    audits: [] as Array<Record<string, unknown>>,
  };
  const apply = (target: Record<string, unknown>, data: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === "object" && value !== null && "increment" in value) {
        target[key] = Number(target[key]) + Number(value.increment);
      } else {
        target[key] = value;
      }
    }
  };
  const tx = {
    commerceAgentPromptRevision: {
      findUnique: async () => state.revision,
      updateMany: async ({ where, data }: { where: { status: string; editVersion: number }; data: Record<string, unknown> }) => {
        if (state.revision.status !== where.status || state.revision.editVersion !== where.editVersion) return { count: 0 };
        apply(state.revision, data);
        return { count: 1 };
      },
    },
    commerceAgentConfiguration: {
      findMany: async () => [state.configuration],
      updateMany: async ({ where, data }: { where: { promptEditVersion: number }; data: Record<string, unknown> }) => {
        if (options.configurationConflict || state.configuration.promptEditVersion !== where.promptEditVersion) return { count: 0 };
        apply(state.configuration, data);
        return { count: 1 };
      },
    },
    commerceShopProfile: {
      findUnique: async () => state.profile,
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        if (options.profileConflict || Object.entries(where).some(([key, value]) => state.profile[key as keyof typeof state.profile] !== value)) return { count: 0 };
        apply(state.profile, data);
        return { count: 1 };
      },
    },
    commerceAuditEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.audits.push(data);
        return data;
      },
    },
  };
  const transaction = async <T>(callback: (client: typeof tx) => Promise<T>): Promise<T> => {
    const before = structuredClone(state);
    try {
      return await callback(tx);
    } catch (error) {
      Object.assign(state, before);
      throw error;
    }
  };
  return { state, transaction };
}

async function withProductionEnvironment<T>(callback: () => Promise<T>): Promise<T> {
  const previous = process.env.DEPLOYMENT_ENVIRONMENT_NAME;
  process.env.DEPLOYMENT_ENVIRONMENT_NAME = "production";
  try {
    return await callback();
  } finally {
    if (previous === undefined) delete process.env.DEPLOYMENT_ENVIRONMENT_NAME;
    else process.env.DEPLOYMENT_ENVIRONMENT_NAME = previous;
  }
}

test("maps every supported deployment environment exactly", () => {
  const previous = process.env.DEPLOYMENT_ENVIRONMENT_NAME;
  try {
    for (const [source, expected] of [
      ["local", "LOCAL"],
      ["test", "TEST"],
      ["development", "DEVELOPMENT"],
      ["staging", "STAGING"],
      ["production", "PRODUCTION"],
    ] as const) {
      process.env.DEPLOYMENT_ENVIRONMENT_NAME = source;
      assert.equal(resolveAdminCommerceEnvironment(), expected);
    }
  } finally {
    if (previous === undefined) delete process.env.DEPLOYMENT_ENVIRONMENT_NAME;
    else process.env.DEPLOYMENT_ENVIRONMENT_NAME = previous;
  }
});

test("rejects unsupported deployment environments without fallback", () => {
  const previous = process.env.DEPLOYMENT_ENVIRONMENT_NAME;
  try {
    process.env.DEPLOYMENT_ENVIRONMENT_NAME = "preview";
    assert.throws(resolveAdminCommerceEnvironment, {
      message: "Commerce environment is unavailable.",
    });
  } finally {
    if (previous === undefined) delete process.env.DEPLOYMENT_ENVIRONMENT_NAME;
    else process.env.DEPLOYMENT_ENVIRONMENT_NAME = previous;
  }
});

test("accepts exactly 32,000 prompt characters and rejects 32,001 before database access", async () => {
  assert.equal(validatePromptText("x".repeat(32_000)).length, 32_000);
  assert.throws(() => validatePromptText("x".repeat(32_001)), {
    message: "Prompt text must be non-empty and at most 32,000 characters.",
  });
  await withProductionEnvironment(async () => {
    const noDatabaseAccess = new Proxy({}, {
      get() {
        throw new Error("Database access occurred before prompt validation.");
      },
    });
    await assert.rejects(mutateAgentInstructions(noDatabaseAccess as never, {
      kind: "update-draft",
      revisionId: "revision-1",
      expectedEditVersion: 1,
      promptText: "x".repeat(32_001),
      reason: "Reject oversized prompt",
    }, "admin-1"), /at most 32,000 characters/);
  });
});

test("new lineage and draft audit rows receive distinct operation IDs", async () => {
  await withProductionEnvironment(async () => {
    const audits: Array<Record<string, unknown>> = [];
    const tx = {
      commerceAgentPrompt: {
        findMany: async () => [],
        create: async () => ({ id: "platform-prompt", scope: "PLATFORM", shopId: null }),
      },
      commerceAgentPromptRevision: {
        findMany: async () => [],
        findFirst: async () => null,
        create: async () => ({ id: "platform-revision-1" }),
      },
      commerceAgentConfiguration: { findMany: async () => [] },
      $queryRaw: async () => [{ id: "platform-prompt" }],
      commerceAuditEvent: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          audits.push(data);
          return data;
        },
      },
    };
    await mutateAgentInstructions(tx as never, {
      kind: "create-draft",
      scope: "PLATFORM",
      shopId: null,
      reason: "Create Platform draft",
    }, "admin-1");
    assert.deepEqual(audits.map((event) => event.action), ["CREATE_AGENT_PROMPT", "CREATE_AGENT_PROMPT_DRAFT"]);
    assert.ok(audits.every((event) => typeof event.operationId === "string" && event.operationId.length > 0));
    assert.notEqual(audits[0]?.operationId, audits[1]?.operationId);
  });
});

const serviceSource = await readFile(
  new URL("../../src/lib/admin/agent-instructions.ts", import.meta.url),
  "utf8",
);
const routeSource = await readFile(
  new URL("../../src/app/(protected)/system-controls/agent-instructions/page.tsx", import.meta.url),
  "utf8",
);
const consoleSource = await readFile(
  new URL("../../src/components/admin/agent-instructions/agent-instructions-console.tsx", import.meta.url),
  "utf8",
);
const sidebarSource = await readFile(
  new URL("../../src/components/admin/sidebar.tsx", import.meta.url),
  "utf8",
);

test("fails closed for duplicate prompt lineages and configurations", () => {
  assert.match(serviceSource, /findMany\(\{\s*where: \{ scope, shopId \}/);
  assert.match(serviceSource, /Multiple .* prompt lineages exist/);
  assert.match(serviceSource, /Multiple Agent configurations exist/);
  assert.match(serviceSource, /Multiple DRAFT revisions exist/);
  assert.match(serviceSource, /assertUnique\(rows,/);
});

test("allocates at most one locked draft and copies only published seed provenance", () => {
  assert.match(serviceSource, /CommerceAgentPrompt" WHERE "id" = \$\{lineage\.id\} FOR UPDATE/);
  assert.match(serviceSource, /const existingDraft = uniqueDraft\(lockedRevisions\)/);
  assert.match(serviceSource, /revisionNumber: \(latest\?\.revisionNumber \?\? 0\) \+ 1/);
  assert.match(serviceSource, /promptText: seed\?\.promptText \?\? ""/);
  assert.match(serviceSource, /sourceTemplateEditVersion: seed\?\.sourceTemplateEditVersion \?\? null/);
});

test("draft save is CAS-protected and publish hashes exact prompt text", () => {
  assert.match(serviceSource, /status: "DRAFT", editVersion: mutation\.expectedEditVersion/);
  assert.match(serviceSource, /promptText: mutation\.promptText, editVersion: \{ increment: 1 \}/);
  assert.match(serviceSource, /createHash\("sha256"\)\.update\(revision\.promptText, "utf8"\)\.digest\("hex"\)/);
  assert.match(serviceSource, /status: "PUBLISHED"[\s\S]*?contentHash:/);
  assert.match(serviceSource, /revision\.status !== \(mutation\.kind === "publish" \? "DRAFT" : "PUBLISHED"\)/);
});

test("ordinary publish atomically updates the environment-scoped pointer and audits both changes", () => {
  assert.match(serviceSource, /action: "PUBLISH_AGENT_PROMPT_REVISION"/);
  assert.match(serviceSource, /action: "SET_AGENT_PROMPT"/);
  assert.match(serviceSource, /promptEditVersion: \{ increment: 1 \}/);
  const updateStart = serviceSource.indexOf("const updated = await tx.commerceAgentConfiguration.updateMany");
  const updateEnd = serviceSource.indexOf("if (updated.count !== 1)", updateStart);
  const pointerUpdate = serviceSource.slice(updateStart, updateEnd);
  assert.match(pointerUpdate, /activePromptRevisionId: input\.revisionId/);
  assert.doesNotMatch(pointerUpdate, /modelId|modelEditVersion/);
  assert.match(serviceSource, /environment, scope, shopId/);
});

test("pending category publish promotes only its exact revision and retains the generation counter", () => {
  assert.match(serviceSource, /profile\?\.pendingPromptRevisionId === revision\.id/);
  assert.match(serviceSource, /pendingCategory\?\.defaultTemplateId === revision\.sourceTemplateId/);
  assert.match(serviceSource, /sourceTemplateEditVersion !== null/);
  assert.match(serviceSource, /changeKind: "PENDING_STORE_CATEGORY_PROMOTION"/);
  assert.match(serviceSource, /pendingSelectionGeneration: profile\.pendingSelectionGeneration/);
  assert.match(serviceSource, /activeCategoryId: profile\.pendingCategoryId/);
  assert.doesNotMatch(serviceSource, /commercePromptTemplate\.(find|findUnique|findFirst)/);
});

test("historical activation is constrained to the selected scope and changes only the prompt pointer", () => {
  assert.match(serviceSource, /revision\.prompt\.scope !== mutation\.scope \|\| revision\.prompt\.shopId !== mutation\.shopId/);
  assert.match(serviceSource, /activePromptRevisionId: input\.revisionId, promptEditVersion: \{ increment: 1 \}/);
  const activationStart = serviceSource.indexOf('if (mutation.kind === "activate")');
  const activationEnd = serviceSource.indexOf('if (revision.editVersion !== mutation.expectedRevisionEditVersion');
  assert.doesNotMatch(serviceSource.slice(activationStart, activationEnd), /activeCategoryId:/);
});

test("protected page and navigation expose the Agent Instructions workflow", () => {
  assert.match(routeSource, /requirePlatformAdminPage\(\)/);
  assert.match(routeSource, /getAgentInstructionsData/);
  assert.match(sidebarSource, /href="\/system-controls\/agent-instructions"/);
  assert.match(sidebarSource, /Agent Instructions/);
  assert.match(consoleSource, /Platform Instructions/);
  assert.match(consoleSource, /Shop Instructions/);
  assert.match(consoleSource, /Publishing this draft will activate the pending Store Category/);
  assert.match(consoleSource, /disabled=\{!promptText\.trim\(\) \|\| promptText !== savedText\}/);
});

test("pending category publish atomically promotes the exact edited prompt and preserves selection generation", async () => {
  await withProductionEnvironment(async () => {
    const { state, transaction } = makePromotionTransaction();
    await transaction((tx) => mutateAgentInstructions(tx as never, {
      kind: "publish",
      revisionId: "shop-revision-2",
      expectedRevisionEditVersion: 4,
      expectedConfigurationPromptEditVersion: 5,
      reason: "Promote reviewed category instructions",
    }, "admin-1"));

    assert.equal(state.revision.status, "PUBLISHED");
    assert.equal(state.revision.contentHash, createHash("sha256").update(state.revision.promptText, "utf8").digest("hex"));
    assert.equal(state.configuration.activePromptRevisionId, "shop-revision-2");
    assert.equal(state.configuration.modelId, "model-1");
    assert.equal(state.profile.activeCategoryId, "category-home");
    assert.equal(state.profile.pendingCategoryId, null);
    assert.equal(state.profile.pendingPromptRevisionId, null);
    assert.equal(state.profile.pendingSelectionGeneration, 9);
    assert.deepEqual(state.audits.map((event) => event.action), ["PUBLISH_AGENT_PROMPT_REVISION", "SET_AGENT_PROMPT"]);
    assert.ok(state.audits.every((event) => typeof event.operationId === "string" && event.operationId.length > 0));
    assert.notEqual(state.audits[0]?.operationId, state.audits[1]?.operationId);
    assert.deepEqual(state.audits[0]?.metadata, { changeKind: "PENDING_STORE_CATEGORY_PROMOTION" });
  });
});

test("pending category publish rolls back prompt, pointer, category, and audits on stale configuration CAS", async () => {
  await withProductionEnvironment(async () => {
    const { state, transaction } = makePromotionTransaction({ configurationConflict: true });
    await assert.rejects(transaction((tx) => mutateAgentInstructions(tx as never, {
      kind: "publish",
      revisionId: "shop-revision-2",
      expectedRevisionEditVersion: 4,
      expectedConfigurationPromptEditVersion: 5,
      reason: "Promote reviewed category instructions",
    }, "admin-1")), /Agent Instructions changed; reload and retry\./);

    assert.equal(state.revision.status, "DRAFT");
    assert.equal(state.configuration.activePromptRevisionId, "shop-revision-1");
    assert.equal(state.profile.activeCategoryId, "category-old");
    assert.equal(state.profile.pendingCategoryId, "category-home");
    assert.equal(state.profile.pendingSelectionGeneration, 9);
    assert.deepEqual(state.audits, []);
  });
});

test("pending category publish rolls back every write when profile CAS loses the selection race", async () => {
  await withProductionEnvironment(async () => {
    const { state, transaction } = makePromotionTransaction({ profileConflict: true });
    await assert.rejects(transaction((tx) => mutateAgentInstructions(tx as never, {
      kind: "publish",
      revisionId: "shop-revision-2",
      expectedRevisionEditVersion: 4,
      expectedConfigurationPromptEditVersion: 5,
      reason: "Promote reviewed category instructions",
    }, "admin-1")), /Pending Store Category selection changed; reload and retry\./);

    assert.equal(state.revision.status, "DRAFT");
    assert.equal(state.configuration.activePromptRevisionId, "shop-revision-1");
    assert.equal(state.profile.activeCategoryId, "category-old");
    assert.equal(state.profile.pendingCategoryId, "category-home");
    assert.equal(state.profile.pendingPromptRevisionId, "shop-revision-2");
    assert.deepEqual(state.audits, []);
  });
});