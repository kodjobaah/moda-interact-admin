import { prisma } from "../../../prisma";
import { requirePlatformAdminRead } from "../../../auth/platform-admin";
import { requireTemplateSuperAdmin } from "./super-admin";
import { readSavedCommonLayout } from "./common-layout-repository";
import type { CommonRecoveryLayoutReference } from "@modainteract/moda-interact-shared/commerce/presentation";

export async function listCommonLayoutChoices(): Promise<CommonRecoveryLayoutReference[]> {
  requireTemplateSuperAdmin(await requirePlatformAdminRead());
  const rows = await prisma.whatsAppTemplateDefinition.findMany({ where: { kind: "MODA_CONVERSATION_WRAPPER", audience: "SHARED", retiredAt: null, status: { in: ["SAVED", "PUBLISHED"] } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 40, select: { id: true } });
  const result: CommonRecoveryLayoutReference[] = [];
  for (const row of rows) {
    try { result.push(await readSavedCommonLayout(prisma, row.id, "en")); }
    catch { /* An incomplete/unreviewed layout is not selectable; the existing wrapper review explains why. */ }
  }
  return result;
}
