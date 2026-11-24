import { Prisma, type PrismaClient } from "@prisma/client";
import type { PlatformAdminPrincipal } from "../../../auth/platform-admin";
import { requireTemplateSuperAdmin } from "../authoring/super-admin";
import { RECOVERY_SCENARIOS } from "../authoring/scenarios";
import { REVIEW_LANGUAGES } from "../compilation/language-codes";
import { configuredSenderWaba } from "../publishing/sender";

export type ShopAssignmentRow = { shopId: string; domain: string; platform: string; shopStatus: string;
  definitionId: string | null; templateName: string; languages: number; variants: number; isDefault: boolean; defaultConfigured: boolean };

/** The current sender is resolved on the server. This is a read-only inventory,
 * not a publication eligibility check or inferred override provenance. */
export async function readShopAssignments(db: PrismaClient, principal: PlatformAdminPrincipal,
  purpose: string, search: string, page: number) {
  requireTemplateSuperAdmin(principal);
  if (!RECOVERY_SCENARIOS.some(scenario => scenario.id === purpose)) throw new Error("Invalid recovery scenario.");
  const pageSize = 20;
  const safePage = Number.isSafeInteger(page) ? Math.max(1, Math.min(1000,page)) : 1;
  const query = search.trim().slice(0,90);
  const wabaId = await configuredSenderWaba(db);
  const result = await db.$queryRaw<ShopAssignmentRow[]>(Prisma.sql`
    SELECT s.id AS "shopId", s.domain, s.platform::text AS platform, s.status::text AS "shopStatus",
      l."definitionId", v."providerTemplateName" AS "templateName",
      count(DISTINCT v."languageTag")::int AS languages, count(*)::int AS variants,
      COALESCE(l."definitionId"=p."definitionId",false) AS "isDefault", (p."definitionId" IS NOT NULL) AS "defaultConfigured"
    FROM whatsapp."WhatsAppTemplateVariant" v
    JOIN commerce."Shop" s ON s.id=v."shopId"
    LEFT JOIN whatsapp."WhatsAppTemplateMetaRegistration" r ON r.id=v."metaRegistrationId"
    LEFT JOIN whatsapp."WhatsAppTemplateLocale" l ON l.id=r."localeId"
    LEFT JOIN whatsapp."WhatsAppRecoveryTemplateDefault" p ON p."wabaId"=${wabaId} AND p.purpose=${purpose}
    WHERE v."providerAccountId"=${wabaId} AND v.purpose=${purpose} AND v.enabled AND v.status='APPROVED'
      AND v."languageTag" IN (${Prisma.join([...REVIEW_LANGUAGES])})
      AND strpos(lower(s.domain),lower(${query}))>0
    GROUP BY s.id,l."definitionId",v."providerTemplateName",p."definitionId"
    ORDER BY s.domain,s.id,v."providerTemplateName",l."definitionId" NULLS FIRST
    LIMIT ${pageSize+1} OFFSET ${(safePage-1)*pageSize}
  `);
  return { rows: result.slice(0,pageSize), hasNext: result.length>pageSize, page: safePage, wabaId };
}
