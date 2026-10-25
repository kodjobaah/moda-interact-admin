import type { CommerceEnvironment, Prisma, PrismaClient } from "@prisma/client";
import { resolveCommerceEnvironment } from "../../openrouter-credential-environment";
import { TRANSLATION_PROVIDER } from "../../translation-configuration-validation";
import { targetTranslationLanguages } from "./locale-contract";
import { makeTranslationSourceSnapshot } from "./source-snapshot";
import { projectTranslationProgress, type TranslationWorkspaceState } from "./progress";

export type TranslationDatabase = Pick<PrismaClient,
  "$transaction" | "whatsAppTemplateDefinition" | "whatsAppTemplateTranslationRun">;

const LOCK_TAG = "ARCH-047-WHATSAPP-TRANSLATION:";
const ACTIVE = ["PENDING", "QUEUED", "TRANSLATING", "PROCESSING", "PARTIALLY_FAILED", "RETRY_REQUESTED"];

async function lockDefinition(tx: Prisma.TransactionClient, definitionId: string): Promise<void> {
  // No unique (definition, source, model) constraint in DB001. This PostgreSQL transaction-scoped
  // advisory lock makes creation and retry idempotent across Admin instances/processes.
  // PostgreSQL returns void; $queryRaw cannot deserialize void, so execute the lock as a statement.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${LOCK_TAG + definitionId}::text, 0::bigint))`;
}

export function validateTranslationDefinitionId(id: unknown): asserts id is string {
  if (typeof id !== "string" || !/^wtdef_[a-f0-9]{64}$/.test(id)) throw new Error("Invalid template definition ID.");
}

/** Database state is the only handoff to Background. No provider or queue operation in this transaction. */
export async function insertTranslationRun(db: TranslationDatabase, input: {
  definitionId: string; actorId: string;
  ensureActor?: (tx: Prisma.TransactionClient) => Promise<void>;
}): Promise<{ runId: string; reused: boolean }> {
  validateTranslationDefinitionId(input.definitionId);
  return db.$transaction(async (tx) => {
    await lockDefinition(tx, input.definitionId);
    const definition = await tx.whatsAppTemplateDefinition.findUnique({
      where: { id: input.definitionId }, include: { locales: { where: { languageTag: "en" }, take: 1 } },
    });
    if (!definition || !["SAVED", "TRANSLATION_QUEUED", "TRANSLATING", "PARTIALLY_FAILED", "READY_FOR_REVIEW"].includes(definition.status)) {
      throw new Error("A saved English template is required before requesting translation.");
    }
    const english = definition.locales[0];
    if (!english || english.status !== "SOURCE_SAVED") throw new Error("The immutable English locale has not committed.");
    const snapshot = makeTranslationSourceSnapshot({
      definitionId: definition.id, sourceHash: definition.sourceHash,
      sourceLanguageTag: definition.sourceLanguageTag, englishLocaleAst: english.localeAst,
      englishContentHash: english.contentHash,
    });
    const model = await tx.commerceTranslationModelConfiguration.findFirst({
      where: { environment: resolveCommerceEnvironment() as CommerceEnvironment, provider: TRANSLATION_PROVIDER,
        enabled: true, automaticDefault: true },
      select: { id: true, provider: true, providerModelId: true, editVersion: true,
        credential: { select: { id: true } } },
    });
    if (!model?.credential) throw new Error("Configure an enabled automatic-default translation model with provider credentials in System Controls / Translations.");
    const existing = await tx.whatsAppTemplateTranslationRun.findFirst({ where: {
      definitionId: definition.id, sourceHash: definition.sourceHash,
      translationModelConfigurationId: model.id, modelConfigurationVersion: model.editVersion,
    }, orderBy: [{ requestedAt: "desc" }, { id: "desc" }], select: { id: true } });
    if (existing) return { runId: existing.id, reused: true };
    const competing = await tx.whatsAppTemplateTranslationRun.findFirst({ where: {
      definitionId: definition.id, status: { in: ACTIVE },
    }, select: { id: true } });
    if (competing) throw new Error("This definition already has an active translation run with another model configuration.");
    const targets = targetTranslationLanguages();
    await input.ensureActor?.(tx);
    const run = await tx.whatsAppTemplateTranslationRun.create({ data: {
      definitionId: definition.id, translationModelConfigurationId: model.id,
      provider: model.provider, providerModelId: model.providerModelId,
      modelConfigurationVersion: model.editVersion, sourceSchemaVersion: snapshot.schemaVersion,
      sourceHash: definition.sourceHash, sourceSnapshot: snapshot as unknown as Prisma.InputJsonObject,
      status: "PENDING", requestedByAdminId: input.actorId,
      items: { create: targets.map((targetLanguageTag) => ({ targetLanguageTag, status: "PENDING" })) },
    }, select: { id: true } });
    await tx.whatsAppTemplateDefinition.updateMany({
      where: { id: definition.id, status: "SAVED" }, data: { status: "TRANSLATION_QUEUED" },
    });
    await tx.commerceAuditEvent.create({ data: {
      actorType: "PLATFORM_ADMIN", actorAdminId: input.actorId,
      action: "REQUEST_WHATSAPP_TEMPLATE_TRANSLATION", operationId: run.id.slice(0, 128),
      reason: "Translation requested for immutable English template",
      translationModelConfigurationId: model.id,
      metadata: { definitionId: definition.id, runId: run.id, targetCount: targets.length,
        sourceHash: definition.sourceHash, modelVersion: model.editVersion },
    } });
    return { runId: run.id, reused: false };
  }, { maxWait: 10_000, timeout: 20_000 });
}

/** Retry only failed or still-pending language work; never reset completed/in-flight languages. */
export async function requestFailedTranslationRetry(db: TranslationDatabase, input: {
  definitionId: string; actorId: string;
  ensureActor?: (tx: Prisma.TransactionClient) => Promise<void>;
}): Promise<{ runId: string; retryRequested: number }> {
  validateTranslationDefinitionId(input.definitionId);
  return db.$transaction(async (tx) => {
    await lockDefinition(tx, input.definitionId);
    const run = await tx.whatsAppTemplateTranslationRun.findFirst({ where: { definitionId: input.definitionId },
      orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
      include: { items: { select: { id: true, status: true, nextAttemptAt: true } } },
    });
    if (!run) throw new Error("No translation run exists for this template.");
    if (["CANCELLED", "STALE"].includes(run.status)) throw new Error("This translation run can no longer be retried.");
    const failedIds = run.items.filter((item) => ["FAILED", "PERMANENTLY_FAILED"].includes(item.status)).map((item) => item.id);
    const pendingIds = run.items.filter((item) => item.status === "PENDING" && !item.nextAttemptAt).map((item) => item.id);
    const count = failedIds.length + pendingIds.length;
    if (!count) return { runId: run.id, retryRequested: 0 };
    await input.ensureActor?.(tx);
    const when = new Date();
    if (failedIds.length) await tx.whatsAppTemplateTranslationItem.updateMany({
      where: { runId: run.id, id: { in: failedIds }, status: { in: ["FAILED", "PERMANENTLY_FAILED"] } },
      data: { status: "PENDING", failureCode: null, nextAttemptAt: when, currentBatchId: null },
    });
    if (pendingIds.length) await tx.whatsAppTemplateTranslationItem.updateMany({
      where: { runId: run.id, id: { in: pendingIds }, status: "PENDING" },
      data: { nextAttemptAt: when },
    });
    if (["FAILED", "PARTIALLY_FAILED", "READY_FOR_REVIEW"].includes(run.status)) {
      await tx.whatsAppTemplateTranslationRun.update({ where: { id: run.id },
        data: { status: "PENDING", failureCode: null, completedAt: null } });
    }
    await tx.whatsAppTemplateDefinition.updateMany({ where: {
      id: input.definitionId, status: { in: ["PARTIALLY_FAILED", "READY_FOR_REVIEW"] },
    }, data: { status: "TRANSLATION_QUEUED" } });
    await tx.commerceAuditEvent.create({ data: {
      actorType: "PLATFORM_ADMIN", actorAdminId: input.actorId,
      action: "REQUEST_WHATSAPP_TEMPLATE_TRANSLATION", operationId: `${run.id.slice(0, 100)}:retry`,
      reason: "Retry requested for pending or failed language items",
      metadata: { definitionId: input.definitionId, runId: run.id, retriedFailed: failedIds.length,
        requeuedPending: pendingIds.length },
    } });
    return { runId: run.id, retryRequested: count };
  }, { maxWait: 10_000, timeout: 20_000 });
}

/** Bounded, tenant-independent SUPER_ADMIN operational read. */
export async function readTranslationWorkspace(db: TranslationDatabase, definitionId: string): Promise<TranslationWorkspaceState> {
  validateTranslationDefinitionId(definitionId);
  const definition = await db.whatsAppTemplateDefinition.findUnique({ where: { id: definitionId },
    select: { id: true, kind: true, purpose: true, sourceHash: true,
      sourceLanguageTag: true, status: true },
  });
  if (!definition || definition.sourceLanguageTag !== "en") throw new Error("Saved English template not found.");
  const run = await db.whatsAppTemplateTranslationRun.findFirst({ where: { definitionId },
    orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
    include: { translationModel: { select: { displayName: true } },
      items: { select: { targetLanguageTag: true, status: true, failureCode: true, retryCount: true, completedAt: true },
        orderBy: { targetLanguageTag: "asc" }, take: 20 },
    },
  });
  return projectTranslationProgress({ definitionId, family: definition.kind, purpose: definition.purpose,
    sourceHash: definition.sourceHash, definitionStatus: definition.status, run });
}
