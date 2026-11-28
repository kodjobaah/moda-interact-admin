"use server";
import {
  requirePlatformAdminRead,
  requirePlatformAdminMutation,
} from "@/lib/auth/platform-admin";
import { requireTemplateSuperAdmin } from "@/lib/admin/whatsapp-templates/authoring/service";
import { ensureDevelopmentPlatformAdmin } from "@/lib/auth/development-platform-admin";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { previewCommonActivation } from "@/lib/admin/whatsapp-templates/common-activation/preview";
import { activateCommonRecoveryLayout } from "@/lib/admin/whatsapp-templates/common-activation/service";
import { createLogger } from "@modainteract/moda-interact-shared/logging";
import { resolveDeploymentEnvironmentName } from "@/lib/auth/environment";
import { SavedCommonLayoutError } from "@/lib/admin/whatsapp-templates/authoring/common-layout-repository";
import { PublicationError } from "@/lib/admin/whatsapp-templates/publishing/validation";
import type {
  CommonActivationSelection,
  CommonActivationConfirmation,
} from "@/lib/admin/whatsapp-templates/common-activation/contracts";
const logger = createLogger({
  serviceName: "moda-interact-admin",
  environment: resolveDeploymentEnvironmentName(),
});
const message = (error: unknown, operation: string, definitionId: unknown) => {
  const context = {
    operation,
    commonDefinitionId:
      typeof definitionId === "string" ? definitionId.slice(0, 80) : null,
  };
  if (
    error instanceof PublicationError ||
    error instanceof SavedCommonLayoutError
  ) {
    logger.warn("admin.whatsapp_common_activation.rejected", {
      ...context,
      error,
    });
    return error.message;
  }
  logger.error("admin.whatsapp_common_activation.failed", {
    ...context,
    error,
  });
  return "The common layout could not be checked. Refresh and review the current state.";
};
export async function previewWhatsAppCommonActivation(
  selection: CommonActivationSelection,
) {
  requireTemplateSuperAdmin(await requirePlatformAdminRead());
  try {
    return {
      ok: true as const,
      preview: await previewCommonActivation(prisma, selection),
    };
  } catch (error) {
    return {
      ok: false as const,
      message: message(error, "review", selection?.commonDefinitionId),
    };
  }
}
export async function confirmWhatsAppCommonActivation(
  input: CommonActivationConfirmation,
) {
  const principal = await requirePlatformAdminMutation();
  requireTemplateSuperAdmin(principal);
  try {
    const result = await activateCommonRecoveryLayout(input, {
      db: prisma,
      principal,
      ensureActor: (tx) => ensureDevelopmentPlatformAdmin(tx, principal),
    });
    revalidatePath("/system-controls/whatsapp-templates");
    revalidatePath("/system-controls/whatsapp-templates/wrappers");
    revalidatePath("/system-controls/whatsapp-templates/defaults");
    return { ok: true as const, result };
  } catch (error) {
    return {
      ok: false as const,
      message: message(error, "confirm", input?.selection?.commonDefinitionId),
    };
  }
}
