"use server";

import { createLogger } from "@modainteract/moda-interact-shared/logging";
import { revalidatePath } from "next/cache";
import { requirePlatformAdminRead, requirePlatformAdminMutation } from "@/lib/auth/platform-admin";
import { ensureDevelopmentPlatformAdmin } from "@/lib/auth/development-platform-admin";
import { resolveDeploymentEnvironmentName } from "@/lib/auth/environment";
import { requireTemplateSuperAdmin } from "@/lib/admin/whatsapp-templates/authoring/super-admin";
import { PublicationError } from "@/lib/admin/whatsapp-templates/publishing/validation";
import { previewRecoveryDefault, readRecoveryDefaults, setRecoveryDefault } from "@/lib/admin/whatsapp-templates/recovery-defaults/service";
import type { RecoveryDefaultOverview, RecoveryDefaultPreview, SetRecoveryDefaultInput, SetRecoveryDefaultResult } from "@/lib/admin/whatsapp-templates/recovery-defaults/contracts";
import { prisma } from "@/lib/prisma";

const logger = createLogger({ serviceName: "moda-interact-admin", environment: resolveDeploymentEnvironmentName() });
type Result<T> = { ok: true; data: T } | { ok: false; code: string; message: string };
function failure(operation: string, error: unknown): Result<never> {
  // Keep the original error in the shared structured logger. Never send DB/secret diagnostics to the browser.
  if (error instanceof PublicationError) {
    logger.warn("admin.whatsapp_recovery_default.rejected", { operation, reasonCode: error.code, error });
    return { ok: false, code: error.code, message: error.message };
  }
  logger.error("admin.whatsapp_recovery_default.failed", { operation, error });
  if (error && typeof error === "object" && "code" in error && ["P2002", "P2034", "P2028"].includes(String(error.code))) {
    return { ok: false, code: "CONFLICT", message: "The default selection conflicted or timed out. Review current state before retrying." };
  }
  return { ok: false, code: "UNAVAILABLE", message: "Recovery defaults are temporarily unavailable. Check Admin server logs and retry." };
}

export async function loadRecoveryTemplateDefaults(): Promise<Result<RecoveryDefaultOverview>> {
  const principal = await requirePlatformAdminRead();
  requireTemplateSuperAdmin(principal);
  try { return { ok: true, data: await readRecoveryDefaults(prisma, principal) }; }
  catch (error) { return failure("read", error); }
}
export async function reviewRecoveryTemplateDefault(definitionId: string): Promise<Result<RecoveryDefaultPreview>> {
  const principal = await requirePlatformAdminRead();
  requireTemplateSuperAdmin(principal);
  try { return { ok: true, data: await previewRecoveryDefault(prisma, principal, definitionId) }; }
  catch (error) { return failure("preview", error); }
}
export async function confirmRecoveryTemplateDefault(input: SetRecoveryDefaultInput): Promise<Result<SetRecoveryDefaultResult>> {
  const principal = await requirePlatformAdminMutation();
  requireTemplateSuperAdmin(principal);
  try {
    const data = await setRecoveryDefault(input, { db: prisma, principal,
      ensureActor: tx => ensureDevelopmentPlatformAdmin(tx, principal) });
    logger.info("admin.whatsapp_recovery_default.selected", { definitionId: data.definitionId, purpose: data.purpose, unchanged: data.unchanged });
    revalidatePath("/system-controls/whatsapp-templates");
    revalidatePath("/system-controls/whatsapp-templates/defaults");
    revalidatePath(`/system-controls/whatsapp-templates/${data.definitionId}/publish`);
    return { ok: true, data };
  } catch (error) { return failure("select", error); }
}
