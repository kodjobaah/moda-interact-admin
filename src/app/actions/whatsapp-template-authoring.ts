"use server";

import { revalidatePath } from "next/cache";
import { createLogger } from "@modainteract/moda-interact-shared/logging";
import { resolveDeploymentEnvironmentName } from "@/lib/auth/environment";
import { startWhatsAppTemplateTranslation } from "@/lib/admin/whatsapp-templates/translations/service";
import { saveAndStartRecoveryWorkflow } from "@/lib/admin/whatsapp-templates/workflow/save-and-start";
import { requirePlatformAdminMutation } from "@/lib/auth/platform-admin";
import { ensureDevelopmentPlatformAdmin } from "@/lib/auth/development-platform-admin";
import { prisma } from "@/lib/prisma";
import { saveEnglishTemplate, type SaveTemplateInput } from "@/lib/admin/whatsapp-templates/authoring/service";

const logger = createLogger({ serviceName: "moda-interact-admin", environment: resolveDeploymentEnvironmentName() });

export type SaveTemplateResult = { ok: true; id: string; translationsRequested?: boolean } | { ok: false; message: string };

/** No client-supplied actor/role/Meta identity; service revalidates AST on every attempt. */
export async function saveWhatsAppTemplateDraft(input: SaveTemplateInput): Promise<SaveTemplateResult> {
  return saveDraft(input, false);
}
export async function saveWhatsAppTemplateAndStartTranslations(input: SaveTemplateInput): Promise<SaveTemplateResult> {
  return saveDraft(input, true);
}
async function saveDraft(input: SaveTemplateInput, startTranslations: boolean): Promise<SaveTemplateResult> {
  const principal = await requirePlatformAdminMutation();
  if (principal.role !== "SUPER_ADMIN") throw new Error("SUPER_ADMIN required for template authoring.");
  try {
    // Only recovery authoring uses the new automatic translation workflow.
    // The existing service still validates the entire untrusted draft.
    if (startTranslations && (!input?.draft || typeof input.draft !== "object" ||
        !("family" in input.draft) || input.draft.family !== "META_RECOVERY")) {
      return { ok: false, message: "Save and start translations is available for recovery templates." };
    }
    const services = { principal, db: prisma, ensureActor: (tx: import("@prisma/client").Prisma.TransactionClient) => ensureDevelopmentPlatformAdmin(tx, principal) };
    const save = () => saveEnglishTemplate(input, services);
    const saved = startTranslations ? await saveAndStartRecoveryWorkflow({
      save, start: id => startWhatsAppTemplateTranslation(id, services, { reuseExistingSourceRun: true }),
      onStartFailure: (definitionId, error) => logger.error("admin.whatsapp_workflow.translation_start_failed", { definitionId, error }),
    }) : await save();
    revalidatePath("/system-controls/whatsapp-templates");
    return { ok: true, id: saved.id, ...("translationsRequested" in saved ? { translationsRequested: saved.translationsRequested === true } : {}) };
  } catch (error) {
    logger.error("admin.whatsapp_template_save.failed", { error });
    // Source validation errors are intentionally actionable; do not expose DB/provider details.
    if (error instanceof Error && (error.message.includes(": ") ||
        /^(Invalid clone source|Clone source not found|Submission ID already used|Unexpected template request|A valid submission UUID)/.test(error.message))) {
      return { ok: false, message: error.message.slice(0, 700) };
    }
    return { ok: false, message: "Template could not be saved. Check its content and try again." };
  }
}
