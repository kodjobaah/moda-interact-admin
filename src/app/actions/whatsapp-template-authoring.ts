"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdminMutation } from "@/lib/auth/platform-admin";
import { ensureDevelopmentPlatformAdmin } from "@/lib/auth/development-platform-admin";
import { prisma } from "@/lib/prisma";
import { saveEnglishTemplate, type SaveTemplateInput } from "@/lib/admin/whatsapp-templates/authoring/service";

export type SaveTemplateResult = { ok: true; id: string } | { ok: false; message: string };

/** No client-supplied actor/role/Meta identity; service revalidates AST on every attempt. */
export async function saveWhatsAppTemplateDraft(input: SaveTemplateInput): Promise<SaveTemplateResult> {
  const principal = await requirePlatformAdminMutation();
  if (principal.role !== "SUPER_ADMIN") throw new Error("SUPER_ADMIN required for template authoring.");
  try {
    const saved = await saveEnglishTemplate(input, {
      principal, db: prisma,
      ensureActor: (tx) => ensureDevelopmentPlatformAdmin(tx, principal),
    });
    revalidatePath("/system-controls/whatsapp-templates");
    return { ok: true, id: saved.id };
  } catch (error) {
    // Source validation errors are intentionally actionable; do not expose DB/provider details.
    if (error instanceof Error && (error.message.includes(": ") ||
        /^(Invalid clone source|Clone source not found|Submission ID already used|Unexpected template request|A valid submission UUID)/.test(error.message))) {
      return { ok: false, message: error.message.slice(0, 700) };
    }
    return { ok: false, message: "Template could not be saved. Check its content and try again." };
  }
}
