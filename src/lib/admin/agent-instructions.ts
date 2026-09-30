import { createHash, randomUUID } from "node:crypto";
import type {
  CommerceAgentPromptScope,
  CommerceAuditAction,
  CommerceEnvironment,
  Prisma,
} from "@prisma/client";

import { requirePlatformAdminRead } from "../auth/platform-admin.ts";
import { resolveAdminCommerceEnvironment } from "./commerce-environment.ts";
import { prisma } from "../prisma.ts";

type Tx = Prisma.TransactionClient;
type Scope = CommerceAgentPromptScope;

export type PromptMutation =
  | { kind: "create-draft"; scope: Scope; shopId: string | null; reason: string }
  | { kind: "update-draft"; revisionId: string; expectedEditVersion: number; promptText: string; reason: string }
  | { kind: "publish"; revisionId: string; expectedRevisionEditVersion: number; expectedConfigurationPromptEditVersion: number; reason: string }
  | { kind: "activate"; promptRevisionId: string; scope: Scope; shopId: string | null; expectedConfigurationPromptEditVersion: number; reason: string };

function conflict(message = "Agent Instructions changed; reload and retry."): never {
  throw new Error(message);
}

function requireReason(reason: string): string {
  const value = reason.trim();
  if (!value || value.length > 1000) throw new Error("Reason must be between 1 and 1000 characters.");
  return value;
}

export function validatePromptText(promptText: string): string {
  const length = Array.from(promptText).length;
  if (promptText.trim().length === 0 || length > 32_000) {
    throw new Error("Prompt text must be non-empty and at most 32,000 characters.");
  }
  return promptText;
}

function assertUnique<T>(rows: T[], message: string): T | null {
  if (rows.length > 1) conflict(message);
  return rows[0] ?? null;
}

function uniqueDraft<T extends { status: string }>(revisions: T[]): T | null {
  const drafts = revisions.filter((revision) => revision.status === "DRAFT");
  if (drafts.length > 1) conflict("Multiple DRAFT revisions exist in this prompt lineage; resolve the configuration conflict first.");
  return drafts[0] ?? null;
}

async function audit(
  tx: Tx,
  input: {
    action: CommerceAuditAction;
    actorAdminId: string;
    reason: string;
    environment: CommerceEnvironment;
    scope: Scope;
    shopId: string | null;
    promptId?: string;
    revisionId?: string;
    configurationId?: string;
    metadata?: Prisma.InputJsonObject;
  },
) {
  await tx.commerceAuditEvent.create({
    data: {
      action: input.action,
      actorAdminId: input.actorAdminId,
      reason: requireReason(input.reason),
      environment: input.environment,
      shopId: input.shopId,
      agentPromptId: input.promptId,
      agentPromptRevisionId: input.revisionId,
      agentConfigurationId: input.configurationId,
      operationId: randomUUID(),
      metadata: input.metadata ?? {},
    },
  });
}

async function findLineage(tx: Tx, scope: Scope, shopId: string | null) {
  const rows = await tx.commerceAgentPrompt.findMany({
    where: { scope, shopId },
    include: { revisions: { orderBy: [{ revisionNumber: "desc" }, { id: "asc" }] } },
    orderBy: { id: "asc" },
  });
  return assertUnique(rows, `Multiple ${scope === "PLATFORM" ? "Platform" : "Shop"} prompt lineages exist; resolve the configuration conflict first.`);
}

async function findConfiguration(
  tx: Tx,
  environment: CommerceEnvironment,
  scope: Scope,
  shopId: string | null,
) {
  const rows = await tx.commerceAgentConfiguration.findMany({
    where: { environment, scope, shopId },
    include: { activePromptRevision: true },
    orderBy: { id: "asc" },
  });
  return assertUnique(rows, "Multiple Agent configurations exist for this environment and scope.");
}

export async function getAgentInstructionsData(input: {
  shopId?: string;
  shopSearch?: string;
} = {}) {
  await requirePlatformAdminRead();
  const environment = resolveAdminCommerceEnvironment();
  const search = input.shopSearch?.trim() ?? "";
  const shops = await prisma.shop.findMany({
    where: search ? { OR: [{ domain: { contains: search, mode: "insensitive" } }, { id: search }] } : undefined,
    orderBy: [{ domain: "asc" }, { id: "asc" }],
    take: 100,
    select: { id: true, domain: true },
  });
  const selectedShop = input.shopId
    ? await prisma.shop.findUnique({ where: { id: input.shopId }, select: { id: true, domain: true } })
    : shops[0] ?? null;
  const [platform, shopData] = await Promise.all([
    readScope(prisma, environment, "PLATFORM", null),
    selectedShop ? readScope(prisma, environment, "SHOP", selectedShop.id) : Promise.resolve(null),
  ]);
  return { environment, shops, selectedShop, platform, shopData };
}

async function readScope(tx: Tx | typeof prisma, environment: CommerceEnvironment, scope: Scope, shopId: string | null) {
  const [lineage, configurationRows, profile] = await Promise.all([
    findLineage(tx, scope, shopId),
    tx.commerceAgentConfiguration.findMany({
      where: { environment, scope, shopId },
      include: { activePromptRevision: true },
      orderBy: { id: "asc" },
    }),
    scope === "SHOP" && shopId
      ? tx.commerceShopProfile.findUnique({
          where: { shopId },
          include: {
            pendingCategory: { include: { defaultTemplate: { select: { id: true, key: true, displayName: true } } } },
            pendingPromptRevision: { include: { prompt: true, sourceTemplate: { select: { id: true, key: true, displayName: true } } } },
          },
        })
      : Promise.resolve(null),
  ]);
  const configuration = assertUnique(configurationRows, "Multiple Agent configurations exist for this environment and scope.");
  const revisions = lineage?.revisions ?? [];
  const pendingRevisionId = profile?.pendingPromptRevisionId ?? null;
  const pendingRevision = pendingRevisionId
    ? revisions.find((revision) => revision.id === pendingRevisionId) ?? null
    : null;
  if (pendingRevisionId) {
    const category = profile?.pendingCategory;
    const valid = Boolean(
      profile?.pendingCategoryId && profile.pendingSelectedAt && pendingRevision &&
      pendingRevision.status === "DRAFT" && lineage?.scope === "SHOP" &&
      lineage.shopId === shopId && pendingRevision.promptId === lineage.id && category &&
      pendingRevision.sourceTemplateId &&
      pendingRevision.sourceTemplateId === category.defaultTemplateId &&
      pendingRevision.sourceTemplateEditVersion !== null,
    );
    if (!valid) conflict("Pending Store Category prompt configuration conflict; do not edit until reconciled.");
  }
  const activeRevisionId = configuration?.activePromptRevisionId ?? null;
  const active = activeRevisionId
    ? revisions.find((revision) => revision.id === activeRevisionId) ?? null
    : null;
  if (activeRevisionId && (!active || active.status !== "PUBLISHED" || active.promptId !== lineage?.id)) {
    conflict("Active prompt configuration points to an invalid revision.");
  }
  return {
    scope,
    shopId,
    lineageId: lineage?.id ?? null,
    configuration: configuration ? {
      id: configuration.id,
      promptEditVersion: configuration.promptEditVersion,
      activePromptRevisionId: configuration.activePromptRevisionId,
    } : null,
    active,
    draft: pendingRevisionId ? pendingRevision : uniqueDraft(revisions),
    pendingCategory: profile?.pendingCategory ? {
      id: profile.pendingCategory.id,
      displayName: profile.pendingCategory.displayName,
      defaultTemplateId: profile.pendingCategory.defaultTemplateId,
      templateDisplayName: profile.pendingPromptRevision?.sourceTemplate?.displayName ?? null,
      templateKey: profile.pendingPromptRevision?.sourceTemplate?.key ?? null,
      sourceTemplateEditVersion: pendingRevision?.sourceTemplateEditVersion ?? null,
    } : null,
    history: revisions,
  };
}

async function allocateDraft(tx: Tx, input: Extract<PromptMutation, { kind: "create-draft" }>, actorAdminId: string, environment: CommerceEnvironment) {
  if ((input.scope === "PLATFORM" && input.shopId !== null) || (input.scope === "SHOP" && !input.shopId)) {
    throw new Error("Prompt scope and Shop selection do not match.");
  }
  if (input.shopId) {
    const profile = await tx.commerceShopProfile.findUnique({ where: { shopId: input.shopId }, select: { pendingPromptRevisionId: true } });
    if (profile?.pendingPromptRevisionId) conflict("Edit the pending Store Category draft instead of creating another draft.");
  }
  let lineage = await findLineage(tx, input.scope, input.shopId);
  if (!lineage) {
    const prompt = await tx.commerceAgentPrompt.create({ data: { scope: input.scope, shopId: input.shopId } });
    lineage = { ...prompt, revisions: [] };
    await audit(tx, {
      action: "CREATE_AGENT_PROMPT", actorAdminId, reason: input.reason,
      environment, scope: input.scope, shopId: input.shopId, promptId: prompt.id,
    });
  }
  const preLockDraft = uniqueDraft(lineage.revisions);
  if (preLockDraft) return preLockDraft.id;

  const locks = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "commerce"."CommerceAgentPrompt" WHERE "id" = ${lineage.id} FOR UPDATE`;
  if (!locks[0]) conflict("Prompt lineage disappeared; reload and retry.");
  const lockedRevisions = await tx.commerceAgentPromptRevision.findMany({
    where: { promptId: lineage.id },
    orderBy: [{ revisionNumber: "desc" }, { id: "asc" }],
  });
  const existingDraft = uniqueDraft(lockedRevisions);
  if (existingDraft) return existingDraft.id;
  const latest = lockedRevisions[0];
  const currentConfig = await findConfiguration(tx, environment, input.scope, input.shopId);
  let seed = currentConfig?.activePromptRevisionId
    ? await tx.commerceAgentPromptRevision.findUnique({ where: { id: currentConfig.activePromptRevisionId } })
    : null;
  if (seed?.status !== "PUBLISHED" || seed.promptId !== lineage.id) {
    seed = await tx.commerceAgentPromptRevision.findFirst({
      where: { promptId: lineage.id, status: "PUBLISHED" },
      orderBy: [{ revisionNumber: "desc" }, { id: "asc" }],
    });
  }
  const draft = await tx.commerceAgentPromptRevision.create({
    data: {
      promptId: lineage.id,
      revisionNumber: (latest?.revisionNumber ?? 0) + 1,
      status: "DRAFT",
      editVersion: 1,
      promptText: seed?.promptText ?? "",
      sourceTemplateId: seed?.sourceTemplateId ?? null,
      sourceTemplateEditVersion: seed?.sourceTemplateEditVersion ?? null,
      contentHash: null,
      publishedAt: null,
    },
  });
  await audit(tx, {
    action: "CREATE_AGENT_PROMPT_DRAFT", actorAdminId, reason: input.reason,
    environment, scope: input.scope, shopId: input.shopId, promptId: lineage.id,
    revisionId: draft.id,
  });
  return draft.id;
}

async function upsertPromptConfiguration(tx: Tx, input: {
  environment: CommerceEnvironment;
  scope: Scope;
  shopId: string | null;
  revisionId: string;
  expectedEditVersion: number;
  actorAdminId: string;
  reason: string;
  promptId: string;
}) {
  const configuration = await findConfiguration(tx, input.environment, input.scope, input.shopId);
  if (configuration) {
    if (configuration.promptEditVersion !== input.expectedEditVersion) conflict("Agent configuration changed; reload and retry.");
    const updated = await tx.commerceAgentConfiguration.updateMany({
      where: { id: configuration.id, promptEditVersion: input.expectedEditVersion },
      data: { activePromptRevisionId: input.revisionId, promptEditVersion: { increment: 1 } },
    });
    if (updated.count !== 1) conflict();
  } else {
    if (input.expectedEditVersion !== 1) conflict("Agent configuration changed; reload and retry.");
    const created = await tx.commerceAgentConfiguration.create({
      data: {
        environment: input.environment,
        scope: input.scope,
        shopId: input.shopId,
        activePromptRevisionId: input.revisionId,
        promptEditVersion: 2,
      },
    });
    return created.id;
  }
  return configuration.id;
}

export async function mutateAgentInstructions(tx: Tx, mutation: PromptMutation, actorAdminId: string) {
  if (mutation.kind === "update-draft") validatePromptText(mutation.promptText);
  const environment = resolveAdminCommerceEnvironment();
  const reason = requireReason(mutation.reason);
  if (mutation.kind === "create-draft") return allocateDraft(tx, { ...mutation, reason }, actorAdminId, environment);

  if (mutation.kind === "update-draft") {
    const revision = await tx.commerceAgentPromptRevision.findUnique({ where: { id: mutation.revisionId }, include: { prompt: true } });
    if (!revision || revision.status !== "DRAFT" || revision.editVersion !== mutation.expectedEditVersion) conflict();
    const updated = await tx.commerceAgentPromptRevision.updateMany({
      where: { id: revision.id, status: "DRAFT", editVersion: mutation.expectedEditVersion },
      data: { promptText: mutation.promptText, editVersion: { increment: 1 } },
    });
    if (updated.count !== 1) conflict();
    await audit(tx, {
      action: "UPDATE_AGENT_PROMPT_DRAFT", actorAdminId, reason, environment,
      scope: revision.prompt.scope, shopId: revision.prompt.shopId, promptId: revision.promptId,
      revisionId: revision.id,
    });
    return revision.id;
  }

  const revisionId = mutation.kind === "publish" ? mutation.revisionId : mutation.promptRevisionId;
  const revision = await tx.commerceAgentPromptRevision.findUnique({ where: { id: revisionId }, include: { prompt: true } });
  if (!revision || revision.status !== (mutation.kind === "publish" ? "DRAFT" : "PUBLISHED")) conflict("Prompt revision is unavailable.");
  const { scope, shopId } = revision.prompt;
  const configuration = await findConfiguration(tx, environment, scope, shopId);
  const expectedConfigVersion = mutation.expectedConfigurationPromptEditVersion;
  if ((configuration?.promptEditVersion ?? 1) !== expectedConfigVersion) conflict("Agent configuration changed; reload and retry.");
  if (mutation.kind === "activate") {
    if (revision.prompt.scope !== mutation.scope || revision.prompt.shopId !== mutation.shopId) {
      conflict("Published revision does not match the selected prompt scope.");
    }
    const configurationId = await upsertPromptConfiguration(tx, {
      environment, scope, shopId, revisionId, expectedEditVersion: expectedConfigVersion,
      actorAdminId, reason, promptId: revision.promptId,
    });
    await audit(tx, {
      action: "SET_AGENT_PROMPT", actorAdminId, reason, environment, scope, shopId,
      promptId: revision.promptId, revisionId, configurationId,
    });
    return revisionId;
  }

  if (revision.editVersion !== mutation.expectedRevisionEditVersion || !revision.promptText.trim()) conflict("Draft changed or is blank; save it before publishing.");
  const profile = scope === "SHOP" && shopId
    ? await tx.commerceShopProfile.findUnique({
        where: { shopId },
        include: { pendingCategory: true },
      })
    : null;
  const pendingPromotion = profile?.pendingPromptRevisionId === revision.id;
  if (pendingPromotion) {
    const validPending = Boolean(
      profile?.pendingCategoryId && profile.pendingSelectedAt && revision.sourceTemplateId &&
      revision.sourceTemplateEditVersion !== null && profile.pendingCategory?.defaultTemplateId === revision.sourceTemplateId,
    );
    if (!validPending) conflict("Pending Store Category configuration conflict; publishing was cancelled.");
  }
  const published = await tx.commerceAgentPromptRevision.updateMany({
    where: { id: revision.id, promptId: revision.promptId, status: "DRAFT", editVersion: mutation.expectedRevisionEditVersion },
    data: {
      status: "PUBLISHED",
      contentHash: createHash("sha256").update(revision.promptText, "utf8").digest("hex"),
      publishedAt: new Date(),
      editVersion: { increment: 1 },
    },
  });
  if (published.count !== 1) conflict();
  const configurationId = await upsertPromptConfiguration(tx, {
    environment, scope, shopId, revisionId, expectedEditVersion: expectedConfigVersion,
    actorAdminId, reason, promptId: revision.promptId,
  });
  await audit(tx, {
    action: "PUBLISH_AGENT_PROMPT_REVISION", actorAdminId, reason, environment, scope,
    shopId, promptId: revision.promptId, revisionId,
    ...(pendingPromotion ? { metadata: { changeKind: "PENDING_STORE_CATEGORY_PROMOTION" } } : {}),
  });
  await audit(tx, {
    action: "SET_AGENT_PROMPT", actorAdminId, reason, environment, scope, shopId,
    promptId: revision.promptId, revisionId, configurationId,
  });
  if (pendingPromotion && profile?.pendingCategoryId) {
    const now = new Date();
    const profileUpdated = await tx.commerceShopProfile.updateMany({
      where: {
        shopId: profile.shopId,
        pendingCategoryId: profile.pendingCategoryId,
        pendingPromptRevisionId: revision.id,
        pendingSelectedAt: profile.pendingSelectedAt,
        pendingSelectionGeneration: profile.pendingSelectionGeneration,
      },
      data: {
        activeCategoryId: profile.pendingCategoryId,
        activeCategoryActivatedAt: now,
        pendingCategoryId: null,
        pendingPromptRevisionId: null,
        pendingSelectedAt: null,
      },
    });
    if (profileUpdated.count !== 1) conflict("Pending Store Category selection changed; reload and retry.");
  }
  return revision.id;
}