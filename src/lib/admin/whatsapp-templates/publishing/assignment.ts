import { Prisma } from "@prisma/client";
import type { PublicationDb, OperationSnapshot } from "./operation";
import { operationSnapshot, progressForOperation } from "./operation";
import { eligibleShop } from "./discovery";
import { readShopImpacts, impactKind } from "./impact";
import { approvedSource } from "./source";
import { isValidKey, LANGUAGES, reject, PublicationError } from "./validation";
import { PROCESS_PAGE_SIZE } from "./types";
import type { PublicationProgress } from "./types";
import { configuredSenderWaba } from "./sender";

/** Each shop's 20 languages are saved in a SINGLE serializable transaction.
 * The transaction-scoped advisory lock serialises overlapping ARCH-047 operations
 * at the shop/WABA/purpose boundary, including requests from different instances. */
async function assignShop(db: PublicationDb, operationId: string, definitionId: string,
  actorId: string, snapshot: OperationSnapshot, shopId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS acquired FROM pg_advisory_xact_lock(hashtextextended(${`${shopId}|${snapshot.wabaId}|${snapshot.purpose}`}::text, 0))`;
    if (await configuredSenderWaba(tx) !== snapshot.wabaId) return reject("STALE", "Configured sender WABA changed. Reconfirm publication.");
    const targets = await tx.whatsAppTemplatePublicationTarget.findMany({ where: { operationId, shopId }, orderBy: { languageTag: "asc" } });
    if (targets.length !== LANGUAGES.length || new Set(targets.map((t) => t.languageTag)).size !== LANGUAGES.length ||
        targets.some((t) => !LANGUAGES.includes(t.languageTag as typeof LANGUAGES[number]) ||
          t.metaRegistrationId !== snapshot.registrationIds[t.languageTag])) {
      return reject("INTEGRITY", "Expected 20 valid durable publication targets for shop.");
    }
    if (targets.every((t) => t.status === "SUCCEEDED")) return;
    if (targets.some((t) => t.status === "SUCCEEDED")) return reject("INTEGRITY", "Partially committed shop; manual reconciliation required.");
    const shop = await tx.shop.findUnique({ where: { id: shopId }, select: { id: true, domain: true,
      status: true, platform: true, wooCommerceInstallation: { select: { status: true } } } });
    if (!shop) return reject("INELIGIBLE", "The originally selected shop no longer exists.");
    const candidate = { id: shop.id, domain: shop.domain, status: shop.status, platform: shop.platform,
      wooStatus: shop.wooCommerceInstallation?.status ?? null };
    if (eligibleShop(candidate)) return reject("INELIGIBLE", "Shop eligibility changed. A new preview is required.");
    const source = await approvedSource(tx, definitionId, snapshot.wabaId);
    if (source.purpose !== snapshot.purpose || source.fingerprint !== snapshot.sourceFingerprint ||
        source.locales.some((l) => snapshot.registrationIds[l.languageTag] !== l.registrationId)) return reject("STALE", "Approval or registration changed. Reconfirm publication.");
    const [impact] = await readShopImpacts(tx, source, [candidate], false);
    if (impact.digest !== snapshot.shopDigests[shopId]) return reject("STALE", "Shop's active template changed. Reconfirm publication.");
    if (impact.public.counts.conflict) return reject("CONFLICT", "Ambiguous selectable WhatsApp template slot.");
    if (impact.public.counts.override && !snapshot.acknowledgeOverrides) return reject("OVERRIDE_CONFIRMATION", "Local override replacement was not confirmed.");
    for (const locale of source.locales) {
      const current = impact.variantsByLanguage.get(locale.languageTag) ?? [];
      const previous = current[0];
      const kind = impactKind(current, locale);
      let nextId: string;
      if (kind === "unchanged") {
        nextId = previous.id;
      } else {
        // Never delete historical variants. A previous identical, disabled identity
        // can be explicitly republished without creating a duplicate identity row.
        if (previous) await tx.whatsAppTemplateVariant.updateMany({
          where: { id: previous.id, shopId, enabled: true }, data: { enabled: false },
        });
        const identity = { shopId, providerAccountId: source.wabaId, purpose: source.purpose,
          providerTemplateName: locale.providerTemplateName, providerLanguageCode: locale.providerLanguageCode };
        const existing = await tx.whatsAppTemplateVariant.findUnique({ where: {
          shopId_providerAccountId_purpose_providerTemplateName_providerLanguageCode: identity,
        } });
        if (existing && existing.metaRegistrationId !== locale.registrationId) return reject("CONFLICT", "An external or unrelated provider identity cannot be adopted as a Moda template.");
        const next = existing ? await tx.whatsAppTemplateVariant.update({ where: { id: existing.id }, data: {
          metaRegistrationId: locale.registrationId, providerTemplateId: locale.providerTemplateId,
          languageTag: locale.languageTag, status: "APPROVED", enabled: true,
        } }) : await tx.whatsAppTemplateVariant.create({ data: {
          ...identity, languageTag: locale.languageTag, providerTemplateId: locale.providerTemplateId,
          metaRegistrationId: locale.registrationId, status: "APPROVED", enabled: true,
        } });
        nextId = next.id;
        await tx.commerceAuditEvent.create({ data: {
          actorType: "PLATFORM_ADMIN", actorAdminId: actorId, shopId,
          action: "ASSIGN_WHATSAPP_TEMPLATE_DEFINITION", operationId: operationId.slice(0, 128), reason: snapshot.reason,
          metadata: { definitionId, publicationOperationId: operationId, languageTag: locale.languageTag,
            previousVariantId: previous?.id ?? null, newVariantId: nextId, metaRegistrationId: locale.registrationId,
            impact: kind },
        } });
      }
      await tx.whatsAppTemplatePublicationTarget.update({ where: {
        operationId_shopId_languageTag: { operationId, shopId, languageTag: locale.languageTag },
      }, data: { previousVariantId: previous?.id ?? null, newVariantId: nextId,
        status: "SUCCEEDED", failureCode: null, processedAt: new Date() } });
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
}

/** Initialise targets for the current bounded shop page, safely repeatable. */
async function ensurePageTargets(db: PublicationDb, operationId: string,
  snapshot: OperationSnapshot, shopIds: string[]): Promise<void> {
  await db.whatsAppTemplatePublicationTarget.createMany({ skipDuplicates: true,
    data: shopIds.flatMap((shopId) => LANGUAGES.map((languageTag) => ({
      operationId, shopId, languageTag, metaRegistrationId: snapshot.registrationIds[languageTag], status: "PENDING",
    }))),
  });
}

function failureCode(error: unknown): string {
  if (error instanceof PublicationError) return error.code;
  if (error && typeof error === "object" && "code" in error &&
      (error.code === "P2034" || error.code === "P2028")) return "RETRYABLE_TRANSACTION";
  // No credential, customer text or provider/SQL error string persisted.
  return "PUBLICATION_FAILED";
}

/** One call processes at most five shops. A client can resume/retry without
 * long-held global locks, background workers or stale automatic re-confirmation. */
export async function advancePublication(db: PublicationDb, operationId: string,
  retryFailed = false): Promise<PublicationProgress> {
  if (!isValidKey(operationId) || typeof retryFailed !== "boolean") return reject("INPUT", "Invalid publication progress request.");
  const operation = await db.whatsAppTemplatePublicationOperation.findUnique({ where: { id: operationId } });
  if (!operation) return reject("NOT_FOUND", "Publication operation not found.");
  if (!["IN_PROGRESS", "PARTIAL", "COMPLETE"].includes(operation.status)) return reject("INTEGRITY", "Unknown publication operation status.");
  if (operation.status === "COMPLETE") return progressForOperation(db, operationId);
  const snapshot = operationSnapshot(operation.scopeSnapshot);
  const cursor = Number(operation.nextPageCursor ?? "0");
  if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > snapshot.shopIds.length) return reject("INTEGRITY", "Invalid operation cursor.");
  let shopIds: string[];
  if (retryFailed) {
    if (cursor < snapshot.shopIds.length) return reject("INPUT", "Finish processing pending shops before retrying failures.");
    // A stale / conflicting slot requires NEW confirmation, never blind retry.
    const retryable = await db.whatsAppTemplatePublicationTarget.findMany({ where: {
      operationId, status: "FAILED", failureCode: { in: ["PUBLICATION_FAILED", "RETRYABLE_TRANSACTION"] }, retryCount: { lt: 3 },
    }, select: { shopId: true }, distinct: ["shopId"], orderBy: [{ retryCount: "asc" }, { shopId: "asc" }], take: PROCESS_PAGE_SIZE });
    shopIds = retryable.map((t) => t.shopId);
  } else {
    shopIds = snapshot.shopIds.slice(cursor, cursor + PROCESS_PAGE_SIZE);
  }
  if (shopIds.length) await ensurePageTargets(db, operationId, snapshot, shopIds);
  for (const shopId of shopIds) {
    try {
      await assignShop(db, operationId, operation.definitionId, operation.requestedByAdminId, snapshot, shopId);
    } catch (error) {
      const code = failureCode(error);
      await db.whatsAppTemplatePublicationTarget.updateMany({ where: { operationId, shopId,
        status: { in: ["PENDING", "FAILED"] } }, data: { status: "FAILED", failureCode: code,
        retryCount: { increment: 1 }, processedAt: new Date() } });
    }
  }
  const newCursor = retryFailed ? cursor : Math.min(snapshot.shopIds.length, cursor + shopIds.length);
  const [succeededTargets, failedTargets] = await Promise.all([
    db.whatsAppTemplatePublicationTarget.count({ where: { operationId, status: "SUCCEEDED" } }),
    db.whatsAppTemplatePublicationTarget.count({ where: { operationId, status: "FAILED" } }),
  ]);
  const finished = newCursor === snapshot.shopIds.length;
  const allSucceeded = succeededTargets === snapshot.shopIds.length * LANGUAGES.length;
  const status = allSucceeded ? "COMPLETE" : finished ? "PARTIAL" : "IN_PROGRESS";
  // A competing operation-progress invocation cannot rewind a persisted cursor.
  await db.whatsAppTemplatePublicationOperation.updateMany({ where: { id: operationId,
    nextPageCursor: String(cursor) }, data: {
    nextPageCursor: String(newCursor), succeededTargets, failedTargets, status,
    completedAt: allSucceeded ? new Date() : null,
    failureCode: finished && !allSucceeded ? "PARTIAL_PUBLICATION" : null,
  } });
  if (succeededTargets > 0) await db.whatsAppTemplateDefinition.updateMany({ where: {
    id: operation.definitionId, retiredAt: null, publishedAt: null,
  }, data: { publishedAt: new Date(), status: "PUBLISHED" } });
  return progressForOperation(db, operationId);
}
