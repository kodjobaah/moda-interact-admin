"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdminMutation, requirePlatformAdminRead } from "@/lib/auth/platform-admin";
import { ensureDevelopmentPlatformAdmin } from "@/lib/auth/development-platform-admin";
import { prisma } from "@/lib/prisma";
import {
  getWhatsAppTemplateTranslationState, retryWhatsAppTemplateTranslation,
  startWhatsAppTemplateTranslation,
} from "@/lib/admin/whatsapp-templates/translations/service";
import type { TranslationWorkspaceState } from "@/lib/admin/whatsapp-templates/translations/progress";

export type TranslationActionResult = { ok: true; state: TranslationWorkspaceState; reused?: boolean; retryRequested?: number }
  | { ok: false; message: string };

/** Never accept actor/model/provider/status from client input. */
export async function generateWhatsAppTemplateTranslations(definitionId: string): Promise<TranslationActionResult> {
  const principal = await requirePlatformAdminMutation();
  if (principal.role !== "SUPER_ADMIN") throw new Error("SUPER_ADMIN required.");
  try {
    const result = await startWhatsAppTemplateTranslation(definitionId, { db: prisma, principal,
      ensureActor: (tx) => ensureDevelopmentPlatformAdmin(tx, principal) });
    revalidatePath(`/system-controls/whatsapp-templates/${definitionId}/translations`);
    return { ok: true, state: result.state, reused: result.reused };
  } catch (error) { return { ok: false, message: friendlyError(error) }; }
}

export async function retryWhatsAppTemplateTranslations(definitionId: string): Promise<TranslationActionResult> {
  const principal = await requirePlatformAdminMutation();
  if (principal.role !== "SUPER_ADMIN") throw new Error("SUPER_ADMIN required.");
  try {
    const result = await retryWhatsAppTemplateTranslation(definitionId, { db: prisma, principal,
      ensureActor: (tx) => ensureDevelopmentPlatformAdmin(tx, principal) });
    revalidatePath(`/system-controls/whatsapp-templates/${definitionId}/translations`);
    return { ok: true, state: result.state, retryRequested: result.retryRequested };
  } catch (error) { return { ok: false, message: friendlyError(error) }; }
}

export async function readWhatsAppTemplateTranslations(definitionId: string): Promise<TranslationActionResult> {
  const principal = await requirePlatformAdminRead();
  if (principal.role !== "SUPER_ADMIN") throw new Error("SUPER_ADMIN required.");
  try {
    return { ok: true, state: await getWhatsAppTemplateTranslationState(definitionId, { db: prisma, principal }) };
  } catch (error) { return { ok: false, message: friendlyError(error) }; }
}

function friendlyError(error: unknown): string {
  if (error instanceof Error && /^(A saved English template|The immutable English locale|Saved immutable English locale|Configure an enabled|This definition already|Translation snapshot exceeds|No translation run exists|This translation run can no longer|English template has no translatable|Invalid template definition ID|Saved English template is invalid)/.test(error.message)) {
    return error.message.slice(0, 400);
  }
  return "The translation operation could not be completed. Try again or contact platform support.";
}
