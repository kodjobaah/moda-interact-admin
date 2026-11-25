import { Prisma, type PrismaClient } from "@prisma/client";
import { createLogger } from "@modainteract/moda-interact-shared/logging";
import { resolveDeploymentEnvironmentName } from "../../../auth/environment";
import type { PlatformAdminPrincipal } from "../../../auth/platform-admin";
import { requireTemplateSuperAdmin } from "../authoring/super-admin";
import { REVIEW_LANGUAGES } from "../compilation/language-codes";
import { configuredSenderWaba } from "../publishing/sender";
import type { RecoveryWorkflowFacts, WorkflowOverview } from "./contracts";

const logger = createLogger({ serviceName: "moda-interact-admin", environment: resolveDeploymentEnvironmentName() });
const languages = Prisma.join([...REVIEW_LANGUAGES]);

/** Return counts per immutable definition, never sums across saved versions.
 * Only current-WABA observations count. This deliberately does not recompile
 * every definition or claim that a stored APPROVED observation proves eligibility. */
export async function readRecoveryWorkflow(db: PrismaClient, principal: PlatformAdminPrincipal,
  definitionId?: string): Promise<WorkflowOverview> {
  requireTemplateSuperAdmin(principal);
  let wabaId: string | null = null;
  try { wabaId = await configuredSenderWaba(db); }
  catch (error) { logger.error("admin.whatsapp_workflow.sender_unavailable", { error }); }
  const [active, facts] = await Promise.all([
    db.whatsAppConversationWrapperActiveSlot.findUnique({ where: { audience: "SHARED" },
      select: { definition: { select: { id: true, createdAt: true } } } }),
    db.$queryRaw<RecoveryWorkflowFacts[]>(Prisma.sql`
      WITH latest AS (
        SELECT DISTINCT ON (d."purpose", d."offerType", (CASE WHEN (e."localeAst"#>'{prepared,components}') @> '[{"type":"HEADER","format":"IMAGE"}]'::jsonb THEN 'IMAGE' ELSE 'TEXT' END)) d.id
        FROM whatsapp."WhatsAppTemplateDefinition" d
        JOIN whatsapp."WhatsAppTemplateLocale" e ON e."definitionId"=d.id AND e."languageTag"='en'
        WHERE d.kind='META_RECOVERY' AND d."retiredAt" IS NULL AND d.status<>'RETIRED'
          AND d."purpose" IN ('INITIAL','FOLLOW_UP') AND d."offerType" IN ('NO_OFFER','CODE_OFFER','AUTOMATIC_OFFER')
          AND COALESCE(e."localeAst"#>>'{authoring,promotionTarget}', 'CHECKOUT')='CHECKOUT'
        ORDER BY d."purpose", d."offerType", (CASE WHEN (e."localeAst"#>'{prepared,components}') @> '[{"type":"HEADER","format":"IMAGE"}]'::jsonb THEN 'IMAGE' ELSE 'TEXT' END), d."createdAt" DESC, d.id DESC
      ), wanted AS (
        ${definitionId ? Prisma.sql`SELECT ${definitionId}::text AS id` : Prisma.sql`
          SELECT id FROM latest UNION SELECT p."definitionId" FROM whatsapp."WhatsAppRecoveryTemplateDefault" p WHERE p."wabaId"=${wabaId}`}
      ), assigned AS (
        SELECT DISTINCT v.purpose, v."shopId", l."definitionId",
          CASE WHEN r.id IS NULL THEN 'UNKNOWN' WHEN r."componentsSnapshot" @> '[{"type":"HEADER","format":"IMAGE"}]'::jsonb THEN 'IMAGE' ELSE 'TEXT' END AS format
        FROM whatsapp."WhatsAppTemplateVariant" v
        LEFT JOIN whatsapp."WhatsAppTemplateMetaRegistration" r ON r.id=v."metaRegistrationId"
        LEFT JOIN whatsapp."WhatsAppTemplateLocale" l ON l.id=r."localeId"
        WHERE v."providerAccountId"=${wabaId} AND v.enabled AND v.status='APPROVED'
          AND v."languageTag" IN (${languages})
          ${definitionId ? Prisma.sql`AND v.purpose=(SELECT d."purpose" || '_' || d."offerType" FROM whatsapp."WhatsAppTemplateDefinition" d WHERE d.id=${definitionId})` : Prisma.empty}
          AND v.purpose IN ('INITIAL_NO_OFFER','INITIAL_CODE_OFFER','INITIAL_AUTOMATIC_OFFER','FOLLOW_UP_NO_OFFER','FOLLOW_UP_CODE_OFFER','FOLLOW_UP_AUTOMATIC_OFFER')
      ), version_assignments AS (
        SELECT purpose, format, "definitionId", count(DISTINCT "shopId")::int AS shops
        FROM assigned GROUP BY purpose, format, "definitionId"
      ), other_assignments AS (
        SELECT a.purpose, a.format, count(DISTINCT a."shopId")::int AS shops FROM assigned a
        LEFT JOIN whatsapp."WhatsAppRecoveryTemplateDefault" p ON p."wabaId"=${wabaId} AND p.purpose=a.purpose AND p.format=a.format
        WHERE p."definitionId" IS NULL OR a."definitionId" IS DISTINCT FROM p."definitionId"
        GROUP BY a.purpose, a.format
      )
      SELECT d.id AS "definitionId", d."purpose" || '_' || d."offerType" AS purpose,
        CASE WHEN (e."localeAst"#>'{prepared,components}') @> '[{"type":"HEADER","format":"IMAGE"}]'::jsonb THEN 'IMAGE' ELSE 'TEXT' END AS format,
        d."providerTemplateName", d.status, d."createdAt", (d."retiredAt" IS NOT NULL OR d.status='RETIRED') AS retired,
        COALESCE(e."localeAst"#>>'{authoring,promotionTarget}', 'CHECKOUT')='CHECKOUT' AS "checkoutTarget",
        w.id AS "activeLayoutId",
        COALESCE(e."localeAst"#>>'{authoring,commonLayout,definitionId}'=w.id
          AND e."localeAst"#>>'{authoring,commonLayout,sourceHash}'=w."sourceHash", false) AS "sourceMatchesActive",
        COALESCE(a."localeCount",0)::int AS "localeCount", COALESCE(a."matchingCount",0)::int AS "matchingCount",
        COALESCE(a."reviewedCount",0)::int AS "reviewedCount", COALESCE(a."registeredCount",0)::int AS "registeredCount",
        COALESCE(a."approvedCount",0)::int AS "approvedCount", COALESCE(t."translatedCount",0)::int AS "translatedCount",
        t.status AS "translationRunStatus", p."definitionId" AS "defaultDefinitionId", (latest.id IS NOT NULL) AS "latestCandidate",
        COALESCE(va.shops,0)::int AS "assignedShops", COALESCE(oa.shops,0)::int AS "otherAssignedShops",
        op.id AS "publicationId", op.status AS "publicationStatus"
      FROM wanted JOIN whatsapp."WhatsAppTemplateDefinition" d ON d.id=wanted.id AND d.kind='META_RECOVERY'
      LEFT JOIN latest ON latest.id=d.id
      LEFT JOIN whatsapp."WhatsAppTemplateLocale" e ON e."definitionId"=d.id AND e."languageTag"='en'
      LEFT JOIN version_assignments va ON va."definitionId"=d.id AND va.purpose=d."purpose" || '_' || d."offerType"
        AND va.format=CASE WHEN (e."localeAst"#>'{prepared,components}') @> '[{"type":"HEADER","format":"IMAGE"}]'::jsonb THEN 'IMAGE' ELSE 'TEXT' END
      LEFT JOIN other_assignments oa ON oa.purpose=d."purpose" || '_' || d."offerType"
        AND oa.format=CASE WHEN (e."localeAst"#>'{prepared,components}') @> '[{"type":"HEADER","format":"IMAGE"}]'::jsonb THEN 'IMAGE' ELSE 'TEXT' END
      LEFT JOIN whatsapp."WhatsAppRecoveryTemplateDefault" p ON p."wabaId"=${wabaId} AND p.purpose=d."purpose" || '_' || d."offerType"
        AND p.format=CASE WHEN (e."localeAst"#>'{prepared,components}') @> '[{"type":"HEADER","format":"IMAGE"}]'::jsonb THEN 'IMAGE' ELSE 'TEXT' END
      LEFT JOIN whatsapp."WhatsAppConversationWrapperActiveSlot" s ON s.audience='SHARED'
      LEFT JOIN whatsapp."WhatsAppTemplateDefinition" w ON w.id=s."definitionId"
      LEFT JOIN LATERAL (
        SELECT count(DISTINCT l.id)::int AS "localeCount",
          count(DISTINCT l.id) FILTER (WHERE l."localeAst"#>>'{authoring,commonLayout,definitionId}'=w.id
            AND l."localeAst"#>>'{authoring,commonLayout,sourceHash}'=w."sourceHash"
            AND l."localeAst"#>>'{authoring,commonLayout,localeId}'=wl.id
            AND l."localeAst"#>>'{authoring,commonLayout,languageTag}'=l."languageTag"
            AND l."localeAst"#>>'{authoring,commonLayout,contentHash}'=wl."contentHash")::int AS "matchingCount",
          count(DISTINCT l.id) FILTER (WHERE l."contentHash" IS NOT NULL AND l."localeAst" IS NOT NULL
            AND ((l."languageTag"='en' AND l.status IN ('SOURCE_SAVED','REVIEWED')) OR
              (l.status='REVIEWED' AND l."reviewedAt" IS NOT NULL AND l."reviewedByAdminId" IS NOT NULL)))::int AS "reviewedCount",
          count(DISTINCT l.id) FILTER (WHERE r.id IS NOT NULL)::int AS "registeredCount",
          count(DISTINCT l.id) FILTER (WHERE r."providerStatus"='APPROVED' AND r."submissionState"='SUBMITTED'
            AND r."providerTemplateId" IS NOT NULL AND r."failureCode" IS NULL AND r."driftDetectedAt" IS NULL
            AND r."lastReconciledAt" IS NOT NULL AND r."lastObservedContentHash" IS NOT NULL
            AND r."lastObservedCategory"='MARKETING' AND r."submittedContentHash"=l."contentHash")::int AS "approvedCount"
        FROM whatsapp."WhatsAppTemplateLocale" l
        LEFT JOIN whatsapp."WhatsAppTemplateLocale" wl ON wl."definitionId"=w.id AND wl."languageTag"=l."languageTag"
        LEFT JOIN whatsapp."WhatsAppTemplateMetaRegistration" r ON r."localeId"=l.id AND r."wabaId"=${wabaId}
        WHERE l."definitionId"=d.id AND l."languageTag" IN (${languages})
      ) a ON true
      LEFT JOIN LATERAL (
        SELECT tr.status, (SELECT count(DISTINCT i."targetLanguageTag")::int
          FROM whatsapp."WhatsAppTemplateTranslationItem" i WHERE i."runId"=tr.id
            AND i."targetLanguageTag" IN (${languages}) AND i."targetLanguageTag"<>'en'
            AND i.status IN ('COMPLETED','COMPLETE','SUCCEEDED','AVAILABLE') AND i."failureCode" IS NULL
            AND i."translatedAst" IS NOT NULL AND i."outputContentHash" IS NOT NULL) AS "translatedCount"
        FROM whatsapp."WhatsAppTemplateTranslationRun" tr WHERE tr."definitionId"=d.id AND tr."sourceHash"=d."sourceHash"
        ORDER BY tr."requestedAt" DESC,tr.id DESC LIMIT 1
      ) t ON true
      LEFT JOIN LATERAL (
        SELECT o.id,o.status FROM whatsapp."WhatsAppTemplatePublicationOperation" o
        WHERE o."definitionId"=d.id AND o."scopeSnapshot"->>'wabaId'=${wabaId}
          AND o."scopeSnapshot"->'automatedOnboarding' IS NULL AND o."scopeSnapshot"->>'schemaVersion'='1'
          AND o."scopeSnapshot"#>>'{scope,mode}' IN ('one','selected','all') AND o.status IN ('IN_PROGRESS','PARTIAL','COMPLETE')
        ORDER BY (o.status IN ('IN_PROGRESS','PARTIAL')) DESC, o."createdAt" DESC,o.id DESC LIMIT 1
      ) op ON true
    `),
  ]);
  return { wabaId, activeLayout: active ? { id: active.definition.id, createdAt: active.definition.createdAt.toISOString() } : null, facts };
}
