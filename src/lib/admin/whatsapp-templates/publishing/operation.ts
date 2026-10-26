import { Prisma, type PrismaClient } from "@prisma/client";
import type { PlatformAdminPrincipal } from "../../../auth/platform-admin";
import { requireTemplateSuperAdmin } from "../authoring/service";
import { computePreview, assertFreshPreview } from "./preview";
import { parseScope, isValidDefinitionId, isValidKey, reasonText, reject } from "./validation";
import { configuredSenderWaba } from "./sender";
import type { ConfirmationRequest, PublicationProgress, PublicationScope } from "./types";
import { EXPECTED_LANGUAGES } from "./types";

export type PublicationDb = Pick<PrismaClient, "platformConfiguration" | "whatsAppTemplateDefinition" | "shop" |
  "whatsAppTemplateVariant" | "shopBrand" | "whatsAppTemplatePublicationOperation" |
  "whatsAppTemplatePublicationTarget" | "$transaction">;
export type OperationSnapshot = {
  schemaVersion: 1; scope: PublicationScope; shopIds: string[]; shopDigests: Record<string, string>;
  wabaId: string; purpose: string; sourceFingerprint: string; previewFingerprint: string;
  registrationIds: Record<string, string>; reason: string; acknowledgeOverrides: boolean;
};
function snapshotFrom(value: unknown): OperationSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return reject("INTEGRITY", "Invalid saved publication snapshot.");
  const v = value as Partial<OperationSnapshot>;
  if (v.schemaVersion !== 1 || !Array.isArray(v.shopIds) || !v.shopDigests ||
      !v.registrationIds || typeof v.sourceFingerprint !== "string" || typeof v.wabaId !== "string" ||
      typeof v.purpose !== "string" || typeof v.reason !== "string" ||
      !v.shopIds.every((s) => typeof s === "string" && typeof v.shopDigests?.[s] === "string")) return reject("INTEGRITY", "Invalid saved publication snapshot.");
  return v as OperationSnapshot;
}
export function operationSnapshot(value: unknown): OperationSnapshot { return snapshotFrom(value); }

export async function confirmPublication(input: ConfirmationRequest, deps: {
  principal: PlatformAdminPrincipal; db: PublicationDb;
  getWaba?: () => Promise<string>; ensureActor?: (tx: Prisma.TransactionClient) => Promise<void>;
}): Promise<PublicationProgress> {
  requireTemplateSuperAdmin(deps.principal);
  if (!input || typeof input !== "object" || Object.keys(input).some((key) =>
      !["definitionId", "scope", "previewFingerprint", "previewIssuedAt", "operationKey", "reason", "acknowledgeOverrides"].includes(key)) ||
      !isValidDefinitionId(input.definitionId) || !isValidKey(input.operationKey) || input.operationKey.length > 128 ||
      !/^[a-f0-9]{64}$/.test(input.previewFingerprint) || typeof input.acknowledgeOverrides !== "boolean") return reject("INPUT", "Invalid publication request.");
  assertFreshPreview(input.previewIssuedAt, input.previewFingerprint);
  const scope = parseScope(input.scope);
  const reason = reasonText(input.reason);
  const previous = await deps.db.whatsAppTemplatePublicationOperation.findUnique({ where: { operationKey: input.operationKey } });
  if (previous) {
    const old = snapshotFrom(previous.scopeSnapshot);
    if (previous.definitionId !== input.definitionId || previous.requestedByAdminId !== deps.principal.id ||
        old.previewFingerprint !== input.previewFingerprint || old.reason !== reason ||
        old.acknowledgeOverrides !== input.acknowledgeOverrides) return reject("COLLISION", "Operation key already belongs to a different publication.");
    return progressForOperation(deps.db, previous.id);
  }
  const wabaId = await (deps.getWaba?.() ?? configuredSenderWaba(deps.db as PrismaClient));
  const preview = await computePreview(deps.db, input.definitionId, scope, wabaId, input.previewIssuedAt);
  if (preview.previewFingerprint !== input.previewFingerprint) return reject("STALE_PREVIEW", "Shop assignments or template approval changed. Review current impact again.");
  if (preview.impactCounts.conflict) return reject("CONFLICT", "Ambiguous approved slots must be resolved before publishing.");
  if (preview.impactCounts.override && !input.acknowledgeOverrides) return reject("OVERRIDE_CONFIRMATION", "Explicitly confirm replacement of merchant overrides.");
  const snapshot: OperationSnapshot = {
    schemaVersion: 1, scope, wabaId, purpose: preview.source.purpose,
    shopIds: preview.shopIds, shopDigests: preview.shopDigests,
    sourceFingerprint: preview.source.fingerprint, previewFingerprint: input.previewFingerprint,
    registrationIds: Object.fromEntries(preview.source.locales.map((l) => [l.languageTag, l.registrationId])),
    reason, acknowledgeOverrides: input.acknowledgeOverrides,
  };
  try {
    const row = await deps.db.$transaction(async (tx) => {
      await deps.ensureActor?.(tx);
      const created = await tx.whatsAppTemplatePublicationOperation.create({ data: {
        definitionId: input.definitionId, requestedByAdminId: deps.principal.id,
        operationKey: input.operationKey, scopeSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        status: "IN_PROGRESS", totalTargets: preview.shopIds.length * EXPECTED_LANGUAGES, nextPageCursor: "0",
      } });
      await tx.commerceAuditEvent.create({ data: {
        actorType: "PLATFORM_ADMIN", actorAdminId: deps.principal.id,
        action: "PUBLISH_WHATSAPP_TEMPLATE_DEFINITION", operationId: created.id.slice(0, 128), reason,
        metadata: { definitionId: input.definitionId, publicationOperationId: created.id, scopeMode: scope.mode,
          shopCount: preview.shopIds.length, targetCount: preview.shopIds.length * EXPECTED_LANGUAGES,
          previewFingerprint: input.previewFingerprint, overwriteAcknowledged: input.acknowledgeOverrides },
      } });
      return created;
    });
    return progressForOperation(deps.db, row.id);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      const replay = await deps.db.whatsAppTemplatePublicationOperation.findUnique({ where: { operationKey: input.operationKey } });
      if (replay && replay.definitionId === input.definitionId && replay.requestedByAdminId === deps.principal.id &&
          snapshotFrom(replay.scopeSnapshot).previewFingerprint === input.previewFingerprint &&
          snapshotFrom(replay.scopeSnapshot).reason === reason &&
          snapshotFrom(replay.scopeSnapshot).acknowledgeOverrides === input.acknowledgeOverrides) return progressForOperation(deps.db, replay.id);
      return reject("COLLISION", "Operation key already belongs to another publication.");
    }
    throw error;
  }
}

export async function progressForOperation(db: PublicationDb, operationId: string): Promise<PublicationProgress> {
  if (!isValidKey(operationId)) return reject("INPUT", "Invalid operation ID.");
  const operation = await db.whatsAppTemplatePublicationOperation.findUnique({ where: { id: operationId } });
  if (!operation) return reject("NOT_FOUND", "Publication operation not found.");
  const snapshot = snapshotFrom(operation.scopeSnapshot);
  const [succeededTargets, failedTargets] = await Promise.all([
    db.whatsAppTemplatePublicationTarget.count({ where: { operationId, status: "SUCCEEDED" } }),
    db.whatsAppTemplatePublicationTarget.count({ where: { operationId, status: "FAILED" } }),
  ]);
  const totalTargets = snapshot.shopIds.length * EXPECTED_LANGUAGES;
  return { operationId, status: operation.status, totalShops: snapshot.shopIds.length,
    succeededShops: Math.floor(succeededTargets / EXPECTED_LANGUAGES),
    failedShops: Math.floor(failedTargets / EXPECTED_LANGUAGES),
    pendingShops: snapshot.shopIds.length - Math.floor((succeededTargets + failedTargets) / EXPECTED_LANGUAGES),
    totalTargets, succeededTargets, failedTargets, pendingTargets: totalTargets - succeededTargets - failedTargets,
    nextPageCursor: operation.nextPageCursor, failureCode: operation.failureCode };
}
