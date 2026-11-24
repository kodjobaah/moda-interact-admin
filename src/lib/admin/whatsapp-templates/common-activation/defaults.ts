import type { Prisma } from "@prisma/client";
import type { CommonRecoveryLayoutReference } from "@modainteract/moda-interact-shared/commerce/presentation";
import { requireCommonLayout } from "../authoring/common-layout";
import { approvedSource } from "../publishing/source";
import { digest, observedMetaContentHash, reject } from "../publishing/validation";
import { COMMON_ACTIVATION_LIMITS as LIMITS, type CommonActivationSelection, type DefaultActivationImpact } from "./contracts";

type Reader = Pick<Prisma.TransactionClient, "whatsAppRecoveryTemplateDefault" | "whatsAppTemplateDefinition" | "whatsAppTemplateMetaEvent">;

/** Global SHARED revision is independent of sender rotation. Include every configured pointer,
 * even when a WABA has no current shops. Never infer a replacement from a merchant override. */
export async function previewDefaultReplacements(db: Reader, selection: CommonActivationSelection,
  commonRefs: CommonRecoveryLayoutReference[]): Promise<DefaultActivationImpact[]> {
  const pointers = await db.whatsAppRecoveryTemplateDefault.findMany({ orderBy: { id: "asc" }, take: LIMITS.defaults + 1,
    select: { id: true, wabaId: true, purpose: true, definitionId: true, updatedAt: true,
      definition: { select: { providerTemplateName: true } } } });
  if (pointers.length > LIMITS.defaults) return reject("BOUNDED_SCOPE", "The configured platform defaults exceed the coordinated review bound.");
  const requested = selection.defaultReplacements ?? [];
  if (pointers.length !== requested.length || pointers.some(pointer => !requested.some(item => item.defaultId === pointer.id))) {
    return reject("DEFAULT_COHORT_MISMATCH", "Choose a reviewed replacement for every configured platform default, even when no shops are assigned. Refresh the activation page if the defaults changed.");
  }
  const result: DefaultActivationImpact[] = [];
  for (const pointer of pointers) {
    const replacement = requested.find(item => item.defaultId === pointer.id)!;
    const source = await approvedSource(db, replacement.definitionId, pointer.wabaId, { requireDefaultEvidence: true });
    if (source.purpose !== pointer.purpose || source.promotionTarget === "ALTERNATIVE_PRODUCT") {
      return reject("DEFAULT_COHORT_MISMATCH", `Platform default ${pointer.purpose} requires a checkout recovery replacement of the same purpose and WABA.`);
    }
    const definition = await db.whatsAppTemplateDefinition.findUniqueOrThrow({ where: { id: source.id },
      include: { locales: { include: { metaRegistrations: { where: { wabaId: pointer.wabaId } } } } } });
    const evidence = definition.locales.map(locale => {
      const expected = commonRefs.find(ref => ref.languageTag === locale.languageTag);
      let reference;
      try { reference = requireCommonLayout((locale.localeAst as { authoring?: { commonLayout?: unknown } } | null)?.authoring?.commonLayout); }
      catch { return reject("COMMON_LAYOUT_REQUIRED", `Clone the ${pointer.purpose} default replacement with the reviewed common layout.`); }
      if (!expected || digest(reference) !== digest(expected)) return reject("COMMON_LAYOUT_MISMATCH", `Every language of the ${pointer.purpose} default replacement must use the selected common revision.`);
      const registration = locale.metaRegistrations[0];
      const reconciledAt = registration?.lastReconciledAt?.getTime();
      const now = Date.now();
      if (locale.status !== "REVIEWED" || !locale.reviewedAt || !locale.reviewedByAdminId || !registration ||
          registration.lastObservedContentHash !== observedMetaContentHash(registration.componentsSnapshot) ||
          reconciledAt === undefined || !Number.isFinite(reconciledAt) || now < reconciledAt || now - reconciledAt > 60 * 60_000) {
        return reject("APPROVAL_PENDING", `The ${pointer.purpose} default needs reviewed English and translations, and current Meta reconciliation for ${locale.languageTag} (within one hour).`);
      }
      return { languageTag: locale.languageTag, id: registration.id, reviewedAt: locale.reviewedAt.toISOString(),
        reviewer: locale.reviewedByAdminId, observedHash: registration.lastObservedContentHash, reconciledAt,
        providerStatus: registration.providerStatus, contentHash: locale.contentHash };
    }).sort((a, b) => a.languageTag.localeCompare(b.languageTag));
    const pending = await db.whatsAppTemplateMetaEvent.findFirst({ where: { registrationId: { in: source.locales.map(locale => locale.registrationId) },
      source: "META_WEBHOOK", outcome: "RECONCILIATION_PENDING", processedAt: null }, select: { id: true } });
    if (pending) return reject("APPROVAL_PENDING", `The ${pointer.purpose} default has a pending provider status observation.`);
    // Store plain JSON rather than Date objects in the immutable activation manifest.
    const { defaultLifecycle, ...approved } = source;
    if (!defaultLifecycle) return reject("INTEGRITY", "Default replacement lifecycle evidence missing.");
    result.push({ defaultId: pointer.id, wabaId: pointer.wabaId, purpose: pointer.purpose,
      previousDefinitionId: pointer.definitionId, previousTemplateName: pointer.definition.providerTemplateName,
      previousUpdatedAt: pointer.updatedAt.toISOString(), source: approved, status: defaultLifecycle.status,
      publishedAt: defaultLifecycle.publishedAt?.toISOString() ?? null, evidenceFingerprint: digest(evidence) });
  }
  return result;
}

/** Called inside the locked activation transaction only after fingerprint revalidation. */
export async function persistDefaultReplacements(tx: Prisma.TransactionClient, defaults: DefaultActivationImpact[],
  actorId: string, coordinatorId: string, reason: string): Promise<void> {
  if (!defaults.length) return;
  const actors = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "public"."PlatformAdmin"
    WHERE "id"=${actorId} AND "active"=true AND "role"='SUPER_ADMIN' FOR SHARE`;
  if (actors.length !== 1) return reject("FORBIDDEN", "An active SUPER_ADMIN must review platform default replacements.");
  for (const item of defaults) {
    if (item.previousDefinitionId === item.source.id && item.status === "PUBLISHED" && item.publishedAt) continue;
    await tx.whatsAppTemplateDefinition.updateMany({ where: { id: item.source.id, retiredAt: null,
      OR: [{ publishedAt: null }, { status: { not: "PUBLISHED" } }] },
      data: { status: "PUBLISHED", publishedAt: item.publishedAt ? new Date(item.publishedAt) : new Date() } });
    const updated = await tx.whatsAppRecoveryTemplateDefault.updateMany({ where: { id: item.defaultId,
      wabaId: item.wabaId, purpose: item.purpose, definitionId: item.previousDefinitionId, updatedAt: new Date(item.previousUpdatedAt) },
      data: { definitionId: item.source.id, updatedByAdminId: actorId } });
    if (updated.count !== 1) return reject("STALE_PREVIEW", "A platform default changed during activation. Review again.");
    await tx.commerceAuditEvent.create({ data: { actorType: "PLATFORM_ADMIN", actorAdminId: actorId,
      action: "PUBLISH_WHATSAPP_TEMPLATE_DEFINITION", operationId: `common-default:${digest([coordinatorId, item.defaultId])}`, reason,
      metadata: { operation: "SET_RECOVERY_TEMPLATE_DEFAULT", scopeMode: "platform_default", coordinatorId,
        defaultId: item.defaultId, previousDefinitionId: item.previousDefinitionId, definitionId: item.source.id,
        wabaId: item.wabaId, purpose: item.purpose, sourceFingerprint: item.source.fingerprint,
        registrationIds: Object.fromEntries(item.source.locales.map(locale => [locale.languageTag, locale.registrationId])) } } });
  }
}
