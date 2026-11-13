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
      sourceLanguageTag: true, status: true, providerTemplateName: true, createdAt: true,
      translationRuns: { orderBy: [{ requestedAt: "desc" }, { id: "desc" }], take: 1, select: { status: true, items: { select: { status: true, failureCode: true, resultLocaleId: true }, take: 20 } } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (safePage - 1) * PAGE_SIZE, take: PAGE_SIZE + 1,
  });
  return { items: rows.slice(0, PAGE_SIZE).map(row => ({ ...item(row), progress: row.translationRuns[0] ? {
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
  const slots = await prisma.whatsAppConversationWrapperActiveSlot.findMany({ take: 3, select: { audience: true, definitionId: true } });
  const shared = slots.find(slot => slot.audience === "SHARED");
  return (["SHARED", "AI", "HUMAN"] as const).map(audience => {
    const own = slots.find(slot => slot.audience === audience);
    return { audience, selection: own ? "Audience layout selected" : audience !== "SHARED" && shared ? "Uses shared layout" : "No layout selected" };
  });
}
