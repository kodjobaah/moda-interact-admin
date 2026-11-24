import { readSavedCommonLayout } from "./common-layout-repository";
import type { TemplateDetail, TemplateListItem, ImmutableAuthoringRecord } from "./types";
import { Prisma } from "@prisma/client";
import { requirePlatformAdminRead } from "../../../auth/platform-admin";
import { requireTemplateSuperAdmin } from "./service";
import { prisma } from "../../../prisma";
import { templateHash } from "./identifiers";

import { scenarioCoverage, type CoverageRow } from "./coverage";
const PAGE_SIZE = 20;
export async function getScenarioCoverage() {
  requireTemplateSuperAdmin(await requirePlatformAdminRead());
  const rows = await prisma.$queryRaw<CoverageRow[]>(Prisma.sql`
    WITH defs AS (SELECT "id", "purpose", "offerType" FROM whatsapp."WhatsAppTemplateDefinition"
      WHERE "kind"='META_RECOVERY' AND "retiredAt" IS NULL AND status<>'RETIRED'),
    counts AS (SELECT "purpose", "offerType", count(*)::int AS definitions FROM defs GROUP BY 1,2),
    locales AS (SELECT d."purpose", d."offerType", count(*)::int AS n,
      array_agg(DISTINCT coalesce(l."localeAst"->'authoring'->>'promotionTarget', CASE WHEN d."offerType"='NO_OFFER' THEN 'NONE' ELSE 'CHECKOUT' END)) AS targets
      FROM defs d JOIN whatsapp."WhatsAppTemplateLocale" l ON l."definitionId"=d.id
      WHERE l.status IN ('SOURCE_SAVED','REVIEWED') GROUP BY 1,2),
    approvals AS (SELECT d."purpose", d."offerType", count(*)::int AS n
      FROM defs d JOIN whatsapp."WhatsAppTemplateLocale" l ON l."definitionId"=d.id
      JOIN whatsapp."WhatsAppTemplateMetaRegistration" m ON m."localeId"=l.id
      WHERE m."providerStatus"='APPROVED' AND m."providerTemplateId" IS NOT NULL AND m."driftDetectedAt" IS NULL AND m."failureCode" IS NULL GROUP BY 1,2),
    assignments AS (SELECT d."purpose", d."offerType", count(*)::int AS n
      FROM defs d JOIN whatsapp."WhatsAppTemplateLocale" l ON l."definitionId"=d.id
      JOIN whatsapp."WhatsAppTemplateMetaRegistration" m ON m."localeId"=l.id
      JOIN whatsapp."WhatsAppTemplateVariant" v ON v."metaRegistrationId"=m.id
      WHERE v.enabled AND v.status='APPROVED' AND m."providerStatus"='APPROVED' AND m."driftDetectedAt" IS NULL AND m."failureCode" IS NULL GROUP BY 1,2)
    SELECT c."purpose",c."offerType",c.definitions,coalesce(l.n,0)::int AS "reviewedLocales",
      coalesce(a.n,0)::int AS "approvedRegistrations",coalesce(v.n,0)::int AS "assignedVariants",l.targets
    FROM counts c LEFT JOIN locales l USING ("purpose","offerType") LEFT JOIN approvals a USING ("purpose","offerType") LEFT JOIN assignments v USING ("purpose","offerType")
  `);
  return scenarioCoverage(rows);
}
function item(row: {
  id: string; kind: string; purpose: string | null; offerType: string | null;
  audience: string | null; sourceLanguageTag: string; status: string;
  providerTemplateName: string | null; createdAt: Date;
}): TemplateListItem {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

export async function listDefinitions(page = 1, search = "", filters: { kind?: string; status?: string } = {}): Promise<{ items: TemplateListItem[]; page: number; hasNext: boolean }> {
  requireTemplateSuperAdmin(await requirePlatformAdminRead());
  const safePage = Math.min(1000, Math.max(1, Number.isInteger(page) ? page : 1));
  const query = search.trim().slice(0, 90);
  const where: Prisma.WhatsAppTemplateDefinitionWhereInput = {};
  if (query) where.OR = [
    { id: { contains: query, mode: "insensitive" } },
    { providerTemplateName: { contains: query, mode: "insensitive" } },
  ];
  if (filters.kind && ["META_RECOVERY", "MODA_CONVERSATION_WRAPPER"].includes(filters.kind)) where.kind = filters.kind;
  if (filters.status && ["SAVED", "PUBLISHED", "RETIRED"].includes(filters.status)) where.status = filters.status;
  const rows = await prisma.whatsAppTemplateDefinition.findMany({
    where,
    select: { id: true, kind: true, purpose: true, offerType: true, audience: true,
      sourceLanguageTag: true, status: true, providerTemplateName: true, createdAt: true, sourceHash: true,
      translationRuns: { orderBy: [{ requestedAt: "desc" }, { id: "desc" }], take: 1, select: { status: true, sourceHash: true, items: { select: { status: true, failureCode: true, resultLocaleId: true }, take: 20 } } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (safePage - 1) * PAGE_SIZE, take: PAGE_SIZE + 1,
  });
  const recoveryIds = rows.slice(0, PAGE_SIZE).filter(row => row.kind === "META_RECOVERY").map(row => row.id);
  const coverage = recoveryIds.length ? await prisma.$queryRaw<Array<{ id: string; active: boolean; localeCount: number; matchingCount: number }>>(Prisma.sql`
    SELECT d.id, (s."definitionId" IS NOT NULL) AS active, count(l.id)::int AS "localeCount",
      count(l.id) FILTER (WHERE l."localeAst"#>>'{authoring,commonLayout,definitionId}' = s."definitionId"
        AND l."localeAst"#>>'{authoring,commonLayout,sourceHash}' = w."sourceHash"
        AND l."localeAst"#>>'{authoring,commonLayout,localeId}' = wl.id
        AND l."localeAst"#>>'{authoring,commonLayout,languageTag}' = l."languageTag"
        AND l."localeAst"#>>'{authoring,commonLayout,contentHash}' = wl."contentHash")::int AS "matchingCount"
    FROM whatsapp."WhatsAppTemplateDefinition" d
    LEFT JOIN whatsapp."WhatsAppTemplateLocale" l ON l."definitionId" = d.id
    LEFT JOIN whatsapp."WhatsAppConversationWrapperActiveSlot" s ON s.audience = 'SHARED'
    LEFT JOIN whatsapp."WhatsAppTemplateDefinition" w ON w.id = s."definitionId"
    LEFT JOIN whatsapp."WhatsAppTemplateLocale" wl ON wl."definitionId" = w.id AND wl."languageTag" = l."languageTag"
    WHERE d.id IN (${Prisma.join(recoveryIds)}) GROUP BY d.id, s."definitionId"
  `) : [];
  const coverageById = new Map(coverage.map(({ id, ...facts }) => [id, facts]));
  return { items: rows.slice(0, PAGE_SIZE).map(row => ({ ...item(row), commonLayoutCoverage: coverageById.get(row.id), progress: row.translationRuns[0]?.sourceHash === row.sourceHash ? {
    runStatus: row.translationRuns[0].status,
    translated: row.translationRuns[0].items.filter(i => ["COMPLETED", "COMPLETE", "SUCCEEDED", "AVAILABLE"].includes(i.status) && !i.failureCode).length,
    reviewed: row.translationRuns[0].items.filter(i => i.resultLocaleId).length,
    total: row.translationRuns[0].items.length,
  } : undefined })), page: safePage, hasNext: rows.length > PAGE_SIZE };
}

/** Stable read port for ADMIN-004/005/006/007/008; contents are read-only. */
export async function getDefinitionDetail(id: string): Promise<TemplateDetail | null> {
  requireTemplateSuperAdmin(await requirePlatformAdminRead());
  if (!/^wtdef_[a-f0-9]{64}$/.test(id)) return null;
  const row = await prisma.whatsAppTemplateDefinition.findUnique({ where: { id },
    include: { locales: { where: { languageTag: "en" }, take: 1 } } });
  if (!row) return null;
  const localeAst = row.locales[0]?.localeAst;
  // Never permit a mutable/reconstructed English definition to masquerade as source.
  const source = localeAst && typeof localeAst === "object" && !Array.isArray(localeAst) &&
    localeAst.schemaVersion === 1 && "authoring" in localeAst && "prepared" in localeAst
    ? localeAst as unknown as ImmutableAuthoringRecord : null;
  const english = source && row.locales[0]?.contentHash &&
    templateHash(source.authoring) === row.sourceHash &&
    templateHash(source.prepared) === row.locales[0].contentHash
    ? source : null;
  return { ...item(row), clonedFromDefinitionId: row.clonedFromDefinitionId,
    sourceHash: row.sourceHash, english };
}

/** Existing global pointers only; configured is not proof of current provider/locale eligibility. */
export async function getDynamicLayoutCoverage() {
  requireTemplateSuperAdmin(await requirePlatformAdminRead());
  const slots = await prisma.whatsAppConversationWrapperActiveSlot.findMany({ where: { audience: { in: ["SHARED", "AI", "HUMAN", "ROUTER"] } }, take: 4, select: { audience: true, definitionId: true } });
  const shared = slots.find(slot => slot.audience === "SHARED");
  let commonRecovery = false;
  if (shared) { try { await readSavedCommonLayout(prisma, shared.definitionId, "en"); commonRecovery = true; } catch { /* Display only verified common-mode precedence. */ } }
  return (["SHARED", "AI", "HUMAN", "ROUTER"] as const).map(audience => {
    const own = slots.find(slot => slot.audience === audience);
    return { audience, selection: audience === "ROUTER" ? (own ? "Independent router pointer configured; review publication eligibility" : "Not configured; no shop-layout fallback") : commonRecovery ? "Uses common SHARED layout for recovery; audience history retained" : own ? "Audience layout selected" : audience !== "SHARED" && shared ? "Uses shared layout" : "No layout selected" };
  });
}
