import type { TemplateDetail, TemplateListItem, ImmutableAuthoringRecord } from "./types";
import type { Prisma } from "@prisma/client";
import { requirePlatformAdminRead } from "../../../auth/platform-admin";
import { requireTemplateSuperAdmin } from "./service";
import { prisma } from "../../../prisma";
import { templateHash } from "./identifiers";

const PAGE_SIZE = 20;
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
      sourceLanguageTag: true, status: true, providerTemplateName: true, createdAt: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (safePage - 1) * PAGE_SIZE, take: PAGE_SIZE + 1,
  });
  return { items: rows.slice(0, PAGE_SIZE).map(item), page: safePage, hasNext: rows.length > PAGE_SIZE };
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
