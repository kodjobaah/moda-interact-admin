import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { PlatformAdminPrincipal } from "../../../auth/platform-admin";
import { getConfigurationEnvironment } from "../../platform-configuration/environment";
import { requireTemplateSuperAdmin } from "../authoring/super-admin";
import { assertCommonSourceGate, lockCommonActivation } from "../common-activation/gates";
import { assertFreshPreview } from "../publishing/preview";
import { configuredSenderWaba } from "../publishing/sender";
import { approvedSource } from "../publishing/source";
import { digest, isValidDefinitionId, LANGUAGES, reasonText, reject } from "../publishing/validation";
import { RECOVERY_DEFAULT_PURPOSES, type RecoveryDefaultPurpose, type DefaultPointerView,
  type RecoveryDefaultOverview, type RecoveryDefaultPreview, type SetRecoveryDefaultInput,
  type SetRecoveryDefaultResult } from "./contracts";

type Principal = Pick<PlatformAdminPrincipal, "id" | "role">;
const pointerSelect = {
  id: true, purpose: true, definitionId: true, updatedAt: true,
  definition: { select: { providerTemplateName: true, status: true, publishedAt: true } },
} satisfies Prisma.WhatsAppRecoveryTemplateDefaultSelect;
type Pointer = Prisma.WhatsAppRecoveryTemplateDefaultGetPayload<{ select: typeof pointerSelect }>;
const view = (row: Pointer | null): DefaultPointerView | null => row ? {
  definitionId: row.definitionId, providerTemplateName: row.definition.providerTemplateName,
  definitionStatus: row.definition.status, publishedAt: row.definition.publishedAt?.toISOString() ?? null,
  updatedAt: row.updatedAt.toISOString(),
} : null;

/** The overview reports configured pointers, not a guarantee of current Meta eligibility. */
export async function readRecoveryDefaults(db: PrismaClient, principal: Principal): Promise<RecoveryDefaultOverview> {
  requireTemplateSuperAdmin(principal);
  const wabaId = await configuredSenderWaba(db);
  const rows = await db.whatsAppRecoveryTemplateDefault.findMany({ where: { wabaId }, select: pointerSelect });
  return { wabaId, slots: RECOVERY_DEFAULT_PURPOSES.map(purpose => ({
    purpose, current: view(rows.find(row => row.purpose === purpose) ?? null),
  })) };
}

export async function verifiedPreview(tx: Prisma.TransactionClient, definitionId: string, wabaId: string, issuedAt: string) {
  // Reuse the existing immutable authoring, 20-locale provider, binding and common-layout gates.
  const source = await approvedSource(tx, definitionId, wabaId, { requireDefaultEvidence: true });
  await assertCommonSourceGate(tx, definitionId, "assignment");
  if (!RECOVERY_DEFAULT_PURPOSES.includes(source.purpose as RecoveryDefaultPurpose) ||
      source.promotionTarget === "ALTERNATIVE_PRODUCT") {
    return reject("NOT_READY", "Select a checkout recovery definition, not an alternative-product template, for this platform default.");
  }
  const purpose = source.purpose as RecoveryDefaultPurpose;
  const pointer = await tx.whatsAppRecoveryTemplateDefault.findUnique({
    where: { wabaId_purpose: { wabaId, purpose } }, select: pointerSelect,
  });
  const preview: RecoveryDefaultPreview = {
    definitionId, purpose, wabaId, providerTemplateName: source.name, headerKind: source.headerKind,
    languageTags: source.locales.map(locale => locale.languageTag), current: view(pointer), issuedAt,
    fingerprint: digest({ definitionId, wabaId, purpose, issuedAt, source: source.fingerprint,
      providerIdentities: source.locales.map(locale => [locale.languageTag, locale.registrationId, locale.providerTemplateId]),
      pointer: pointer ? [pointer.id, pointer.definitionId, pointer.updatedAt.toISOString(), pointer.definition.status, pointer.definition.publishedAt?.toISOString() ?? null] : null }),
  };
  return { preview, source, pointer };
}

export async function previewRecoveryDefault(db: PrismaClient, principal: Principal, definitionId: string): Promise<RecoveryDefaultPreview> {
  requireTemplateSuperAdmin(principal);
  if (!isValidDefinitionId(definitionId)) return reject("INPUT", "Invalid recovery definition.");
  const issuedAt = new Date().toISOString();
  return db.$transaction(async tx => {
    const wabaId = await configuredSenderWaba(tx);
    return (await verifiedPreview(tx, definitionId, wabaId, issuedAt)).preview;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15_000 });
}

/** Serialize with publication/common activation and fence provider reconciliation before admission. */
export async function lockCandidate(tx: Prisma.TransactionClient, definitionId: string, wabaId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "whatsapp"."WhatsAppTemplateDefinition" WHERE "id"=${definitionId} FOR UPDATE`;
  const locales = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "whatsapp"."WhatsAppTemplateLocale"
    WHERE "definitionId"=${definitionId} ORDER BY "id" LIMIT 21 FOR UPDATE`;
  if (locales.length !== LANGUAGES.length) return reject("NOT_READY", "All 20 supported locales must exist.");
  const registrations = await tx.$queryRaw<Array<{ id: string }>>`SELECT r."id" FROM "whatsapp"."WhatsAppTemplateMetaRegistration" r
    JOIN "whatsapp"."WhatsAppTemplateLocale" l ON l."id"=r."localeId"
    WHERE l."definitionId"=${definitionId} AND r."wabaId"=${wabaId} ORDER BY r."id" LIMIT 21 FOR UPDATE OF r`;
  if (registrations.length !== LANGUAGES.length) return reject("NOT_READY", "All 20 supported languages must have a registration for the configured WABA.");
  // Same ordering as coordinated common activation: source/registration locks before configuration.
  await tx.$queryRaw`SELECT "id" FROM "public"."PlatformConfiguration"
    WHERE "environment"=${getConfigurationEnvironment()} AND "key"='messaging.sender' FOR SHARE`;
}

/** No shop discovery, targets, variants or publication operations are written here. */
export async function setRecoveryDefault(input: SetRecoveryDefaultInput, deps: {
  db: PrismaClient; principal: Principal; ensureActor?: (tx: Prisma.TransactionClient) => Promise<void>;
}): Promise<SetRecoveryDefaultResult> {
  requireTemplateSuperAdmin(deps.principal);
  if (!input || typeof input !== "object" || Object.keys(input).sort().join() !== "definitionId,fingerprint,issuedAt,reason" ||
      !isValidDefinitionId(input.definitionId)) return reject("INPUT", "Invalid default selection.");
  const reason = reasonText(input.reason);
  assertFreshPreview(input.issuedAt, input.fingerprint);
  return deps.db.$transaction(async tx => {
    await lockCommonActivation(tx);
    const wabaId = await configuredSenderWaba(tx);
    await lockCandidate(tx, input.definitionId, wabaId);
    const { preview, source, pointer } = await verifiedPreview(tx, input.definitionId, wabaId, input.issuedAt);
    assertFreshPreview(input.issuedAt, input.fingerprint);
    if (preview.fingerprint !== input.fingerprint) return reject("STALE_PREVIEW", "The selected definition, sender, approvals or current default changed. Review again.");
    return persistVerifiedDefault(tx, { preview, source, pointer }, reason, deps);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
}

/** Shared default writer. Call only after locking candidate, validating current sender,
 * recomputing the preview and checking the confirmation fingerprint in this transaction. */
export async function persistVerifiedDefault(tx: Prisma.TransactionClient,
  verified: Awaited<ReturnType<typeof verifiedPreview>>, reason: string, deps: {
    principal: Principal; ensureActor?: (tx: Prisma.TransactionClient) => Promise<void>;
  }): Promise<SetRecoveryDefaultResult> {
  const { preview, source, pointer } = verified;
  const wabaId = preview.wabaId;
  await deps.ensureActor?.(tx);
  const actors = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "public"."PlatformAdmin"
    WHERE "id"=${deps.principal.id} AND "active"=true AND "role"='SUPER_ADMIN' FOR SHARE`;
  if (actors.length !== 1) return reject("FORBIDDEN", "An active SUPER_ADMIN must select the default.");
  if (pointer?.definitionId === source.id && pointer.definition.status === "PUBLISHED" && pointer.definition.publishedAt) {
    return { definitionId: source.id, purpose: preview.purpose, unchanged: true };
  }
  const lifecycle = source.defaultLifecycle;
  if (!lifecycle) return reject("INTEGRITY", "Verified definition lifecycle unavailable.");
  // A verified default is a platform publication-readiness milestone, even with zero shops.
  // Preserve the existing first-publication timestamp and every frozen source/registration byte.
  if (lifecycle.status !== "PUBLISHED" || !lifecycle.publishedAt) {
    await tx.whatsAppTemplateDefinition.update({ where: { id: source.id },
      data: { publishedAt: lifecycle.publishedAt ?? new Date(), status: "PUBLISHED" } });
  }
  const next = await tx.whatsAppRecoveryTemplateDefault.upsert({
    where: { wabaId_purpose: { wabaId, purpose: preview.purpose } },
    create: { wabaId, purpose: preview.purpose, definitionId: source.id, updatedByAdminId: deps.principal.id },
    update: { definitionId: source.id, updatedByAdminId: deps.principal.id },
    select: { id: true },
  });
  await tx.commerceAuditEvent.create({ data: {
    actorType: "PLATFORM_ADMIN", actorAdminId: deps.principal.id,
    action: "PUBLISH_WHATSAPP_TEMPLATE_DEFINITION", operationId: `recovery-default:${randomUUID()}`, reason,
    metadata: { operation: "SET_RECOVERY_TEMPLATE_DEFAULT", scopeMode: "platform_default", defaultId: next.id,
      definitionId: source.id, previousDefinitionId: pointer?.definitionId ?? null, wabaId, purpose: preview.purpose,
      sourceFingerprint: source.fingerprint, registrationIds: Object.fromEntries(source.locales.map(locale => [locale.languageTag, locale.registrationId])),
      languageCount: source.locales.length },
  } });
  return { definitionId: source.id, purpose: preview.purpose, unchanged: false };
}
