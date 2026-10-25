"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ensureDevelopmentPlatformAdmin } from "@/lib/auth/development-platform-admin";
import { requirePlatformAdminMutation } from "@/lib/auth/platform-admin";
import { reviewTranslation, ReviewRequestError } from "@/lib/admin/whatsapp-templates/compilation/service";
import type { ReviewInput } from "@/lib/admin/whatsapp-templates/compilation/contracts";

export type TranslationReviewActionResult = { ok: true; replay: boolean } | { ok: false; message: string };

/** Input is an identity and a review decision, never a client-provided locale AST or actor. */
export async function decideWhatsAppTemplateTranslation(input: ReviewInput): Promise<TranslationReviewActionResult> {
  const principal = await requirePlatformAdminMutation();
  if (principal.role !== "SUPER_ADMIN") throw new Error("SUPER_ADMIN required for WhatsApp template review.");
  try {
    const result = await reviewTranslation(input, {
      principal, db: prisma, ensureActor: (tx) => ensureDevelopmentPlatformAdmin(tx, principal),
    });
    revalidatePath(`/system-controls/whatsapp-templates/${input.definitionId}/review`);
    return { ok: true, replay: result.replay };
  } catch (error) {
    if (error instanceof ReviewRequestError) return { ok: false, message: error.message };
    if (error instanceof Error && /^(Translation |Source |Invalid |Existing locale |Locale content |Unsupported |Cannot approve |English locale |Saved source |Unknown |Meta )/.test(error.message)) {
      return { ok: false, message: error.message.slice(0, 280) };
    }
    return { ok: false, message: "Review could not be saved. Refresh the definition and retry." };
  }
}
