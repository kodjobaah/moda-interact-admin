"use server";

import {
  requirePlatformAdminRead,
  requirePlatformAdminMutation,
} from "@/lib/auth/platform-admin";
import { requireTemplateSuperAdmin } from "@/lib/admin/whatsapp-templates/authoring/service";
import { ensureDevelopmentPlatformAdmin } from "@/lib/auth/development-platform-admin";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { createLogger } from "@modainteract/moda-interact-shared/logging";
import { resolveDeploymentEnvironmentName } from "@/lib/auth/environment";
import {
  confirmScopedPublication,
  merchantScope,
  parsePublicationIntent,
  previewScopedPublication,
} from "@/lib/admin/whatsapp-templates/publishing/unified";
import { configuredSenderWaba } from "@/lib/admin/whatsapp-templates/publishing/sender";
import { languageComparison } from "@/lib/admin/whatsapp-templates/publishing/preview";
import { progressForOperation } from "@/lib/admin/whatsapp-templates/publishing/operation";
import { advancePublication } from "@/lib/admin/whatsapp-templates/publishing/assignment";
import { PublicationError } from "@/lib/admin/whatsapp-templates/publishing/validation";
import type {
  PublicationIntentRequest,
  PublicationConfirmation,
  PublicationPreview,
  PublicationProgress,
  LanguageComparison,
  PublicationIntent,
} from "@/lib/admin/whatsapp-templates/publishing/types";

type Result<T> =
  { ok: true; data: T } | { ok: false; code: string; message: string };
const logger = createLogger({
  serviceName: "moda-interact-admin",
  environment: resolveDeploymentEnvironmentName(),
});
const resultError = (
  error: unknown,
  operation: string,
  identity?: string,
): Result<never> => {
  const boundedId =
    typeof identity === "string" ? identity.slice(0, 128) : null;
  const context = {
    operation,
    ...(operation === "advance" || operation === "progress"
      ? { operationId: boundedId }
      : { definitionId: boundedId }),
  };
  if (error instanceof PublicationError) {
    logger.warn("admin.whatsapp_publication.rejected", {
      ...context,
      ...error.context,
      reasonCode: error.code,
      error,
      cause: error.cause,
    });
    return { ok: false, code: error.code, message: error.message };
  }
  logger.error("admin.whatsapp_publication.failed", { ...context, error });
  return {
    ok: false,
    code: "UNAVAILABLE",
    message:
      "Publication data is temporarily unavailable. Review again and check Admin server logs if it persists.",
  };
};

export async function eligiblePublicationShops(input: {
  search: string;
  page: number;
}): Promise<
  Result<{
    shops: Array<{ id: string; domain: string; platform: string }>;
    hasNext: boolean;
  }>
> {
  requireTemplateSuperAdmin(await requirePlatformAdminRead());
  try {
    const search =
      typeof input?.search === "string" ? input.search.trim().slice(0, 90) : "";
    const page = Number.isSafeInteger(input?.page)
      ? Math.max(1, Math.min(100, input.page))
      : 1;
    const rows = await prisma.shop.findMany({
      where: {
        status: "ACTIVE",
        OR: [
          { platform: "SHOPIFY" },
          {
            platform: "WOOCOMMERCE",
            wooCommerceInstallation: { is: { status: "ACTIVE" } },
          },
        ],
        ...(search
          ? { domain: { contains: search, mode: "insensitive" as const } }
          : {}),
      },
      orderBy: [{ domain: "asc" }, { id: "asc" }],
      select: { id: true, domain: true, platform: true },
      take: 21,
      skip: (page - 1) * 20,
    });
    return {
      ok: true,
      data: { shops: rows.slice(0, 20), hasNext: rows.length > 20 },
    };
  } catch (error) {
    return resultError(error, "eligible_shops");
  }
}
export async function previewTemplatePublication(input: {
  definitionId: string;
  scope: PublicationIntent;
  page: number;
}): Promise<Result<PublicationPreview>> {
  const principal = await requirePlatformAdminRead();
  requireTemplateSuperAdmin(principal);
  try {
    return {
      ok: true,
      data: await previewScopedPublication(prisma, principal, input),
    };
  } catch (error) {
    return resultError(error, "review", input?.definitionId);
  }
}
export async function comparePublicationLanguage(input: {
  definitionId: string;
  scope: PublicationIntent;
  shopId: string;
  languageTag: string;
}): Promise<Result<LanguageComparison>> {
  requireTemplateSuperAdmin(await requirePlatformAdminRead());
  try {
    const scope = merchantScope(parsePublicationIntent(input.scope));
    const wabaId = await configuredSenderWaba(prisma);
    return {
      ok: true,
      data: await languageComparison(
        prisma,
        input.definitionId,
        scope,
        wabaId,
        input.shopId,
        input.languageTag,
      ),
    };
  } catch (error) {
    return resultError(error, "compare_language", input?.definitionId);
  }
}
export async function confirmTemplatePublication(
  input: PublicationIntentRequest,
): Promise<Result<PublicationConfirmation>> {
  const principal = await requirePlatformAdminMutation();
  requireTemplateSuperAdmin(principal);
  try {
    const data = await confirmScopedPublication(input, {
      db: prisma,
      principal,
      ensureActor: (tx) => ensureDevelopmentPlatformAdmin(tx, principal),
    });
    revalidatePath(
      `/system-controls/whatsapp-templates/${input.definitionId}/publish`,
    );
    revalidatePath("/system-controls/whatsapp-templates");
    revalidatePath("/system-controls/whatsapp-templates/defaults");
    return { ok: true, data };
  } catch (error) {
    return resultError(error, "confirm", input?.definitionId);
  }
}
export async function advanceTemplatePublication(input: {
  operationId: string;
  retryFailed?: boolean;
}): Promise<Result<PublicationProgress>> {
  requireTemplateSuperAdmin(await requirePlatformAdminMutation());
  try {
    return {
      ok: true,
      data: await advancePublication(
        prisma,
        input.operationId,
        input.retryFailed ?? false,
      ),
    };
  } catch (error) {
    return resultError(error, "advance", input?.operationId);
  }
}
export async function readTemplatePublicationProgress(
  operationId: string,
): Promise<Result<PublicationProgress>> {
  requireTemplateSuperAdmin(await requirePlatformAdminRead());
  try {
    return { ok: true, data: await progressForOperation(prisma, operationId) };
  } catch (error) {
    return resultError(error, "progress", operationId);
  }
}
