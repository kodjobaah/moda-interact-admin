"use server";

import { createLogger } from "@modainteract/moda-interact-shared/logging";
import { requirePlatformAdminRead } from "@/lib/auth/platform-admin";
import { resolveDeploymentEnvironmentName } from "@/lib/auth/environment";
import { requireTemplateSuperAdmin } from "@/lib/admin/whatsapp-templates/authoring/super-admin";
import { PublicationError } from "@/lib/admin/whatsapp-templates/publishing/validation";
import { readRecoveryDefaults } from "@/lib/admin/whatsapp-templates/recovery-defaults/service";
import type { RecoveryDefaultOverview } from "@/lib/admin/whatsapp-templates/recovery-defaults/contracts";
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
