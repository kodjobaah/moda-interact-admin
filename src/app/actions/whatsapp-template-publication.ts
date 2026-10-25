"use server";

import { requirePlatformAdminRead, requirePlatformAdminMutation } from "@/lib/auth/platform-admin";
import { requireTemplateSuperAdmin } from "@/lib/admin/whatsapp-templates/authoring/service";
import { ensureDevelopmentPlatformAdmin } from "@/lib/auth/development-platform-admin";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { configuredSenderWaba } from "@/lib/admin/whatsapp-templates/publishing/sender";
import { computePreview, publicPreview, languageComparison } from "@/lib/admin/whatsapp-templates/publishing/preview";
import { confirmPublication, progressForOperation } from "@/lib/admin/whatsapp-templates/publishing/operation";
import { advancePublication } from "@/lib/admin/whatsapp-templates/publishing/assignment";
import { isValidDefinitionId, parseScope, PublicationError } from "@/lib/admin/whatsapp-templates/publishing/validation";
import type { ConfirmationRequest, PublicationPreview, PublicationProgress, LanguageComparison, PublicationScope } from "@/lib/admin/whatsapp-templates/publishing/types";

type Result<T> = { ok: true; data: T } | { ok: false; code: string; message: string };
const resultError = (error: unknown): Result<never> => error instanceof PublicationError
  ? { ok: false, code: error.code, message: error.message }
  : { ok: false, code: "UNAVAILABLE", message: "Publication data is temporarily unavailable. Retry later." };

export async function eligiblePublicationShops(input: { search: string; page: number }): Promise<Result<{
  shops: Array<{ id: string; domain: string; platform: string }>; hasNext: boolean;
}>> {
  requireTemplateSuperAdmin(await requirePlatformAdminRead());
  try {
    const search = typeof input?.search === "string" ? input.search.trim().slice(0, 90) : "";
    const page = Number.isSafeInteger(input?.page) ? Math.max(1, Math.min(100, input.page)) : 1;
    const rows = await prisma.shop.findMany({ where: {
      status: "ACTIVE", OR: [{ platform: "SHOPIFY" },
        { platform: "WOOCOMMERCE", wooCommerceInstallation: { is: { status: "ACTIVE" } } }],
      ...(search ? { domain: { contains: search, mode: "insensitive" as const } } : {}),
    }, orderBy: [{ domain: "asc" }, { id: "asc" }], select: { id: true, domain: true, platform: true },
    take: 21, skip: (page - 1) * 20,
    });
    return { ok: true, data: { shops: rows.slice(0, 20), hasNext: rows.length > 20 } };
  } catch (error) { return resultError(error); }
}
export async function previewTemplatePublication(input: { definitionId: string; scope: PublicationScope; page: number }): Promise<Result<PublicationPreview>> {
  requireTemplateSuperAdmin(await requirePlatformAdminRead());
  try {
    if (!isValidDefinitionId(input?.definitionId)) throw new PublicationError("INPUT", "Invalid definition.");
    const scope = parseScope(input.scope);
    const issuedAt = new Date().toISOString();
    const wabaId = await configuredSenderWaba(prisma);
    const state = await computePreview(prisma, input.definitionId, scope, wabaId, issuedAt, input.page);
    return { ok: true, data: publicPreview(state, input.definitionId, input.page, issuedAt) };
  } catch (error) { return resultError(error); }
}
export async function comparePublicationLanguage(input: { definitionId: string; scope: PublicationScope;
  shopId: string; languageTag: string }): Promise<Result<LanguageComparison>> {
  requireTemplateSuperAdmin(await requirePlatformAdminRead());
  try {
    const scope = parseScope(input.scope);
    const wabaId = await configuredSenderWaba(prisma);
    return { ok: true, data: await languageComparison(prisma, input.definitionId, scope, wabaId, input.shopId, input.languageTag) };
  } catch (error) { return resultError(error); }
}
export async function confirmTemplatePublication(input: ConfirmationRequest): Promise<Result<PublicationProgress>> {
  const principal = await requirePlatformAdminMutation();
  requireTemplateSuperAdmin(principal);
  try {
    const progress = await confirmPublication(input, { db: prisma, principal,
      ensureActor: (tx) => ensureDevelopmentPlatformAdmin(tx, principal) });
    revalidatePath(`/system-controls/whatsapp-templates/${input.definitionId}/publish`);
    return { ok: true, data: progress };
  } catch (error) { return resultError(error); }
}
export async function advanceTemplatePublication(input: { operationId: string; retryFailed?: boolean }): Promise<Result<PublicationProgress>> {
  requireTemplateSuperAdmin(await requirePlatformAdminMutation());
  try { return { ok: true, data: await advancePublication(prisma, input.operationId, input.retryFailed ?? false) }; }
  catch (error) { return resultError(error); }
}
export async function readTemplatePublicationProgress(operationId: string): Promise<Result<PublicationProgress>> {
  requireTemplateSuperAdmin(await requirePlatformAdminRead());
  try { return { ok: true, data: await progressForOperation(prisma, operationId) }; }
  catch (error) { return resultError(error); }
}
