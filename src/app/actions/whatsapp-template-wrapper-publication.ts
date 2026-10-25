"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdminMutation } from "@/lib/auth/platform-admin";
import { ensureDevelopmentPlatformAdmin } from "@/lib/auth/development-platform-admin";
import { prisma } from "@/lib/prisma";
import { activateConversationWrapper, WrapperRequestError } from "@/lib/admin/whatsapp-templates/wrappers/service";
import { WrapperConflictError } from "@/lib/admin/whatsapp-templates/wrappers/repository";
import type { ActivateWrapperInput } from "@/lib/admin/whatsapp-templates/wrappers/contracts";

export type WrapperActivationActionResult =
  | { ok: true; replay: boolean; editVersion: number }
  | { ok: false; conflict: boolean; message: string };

/** Never trust a client-supplied identity or publish without the server-side role check. */
export async function publishWhatsAppConversationWrapper(input: ActivateWrapperInput): Promise<WrapperActivationActionResult> {
  const principal = await requirePlatformAdminMutation();
  if (principal.role !== "SUPER_ADMIN") throw new Error("SUPER_ADMIN required for wrapper publication.");
  try {
    const result = await activateConversationWrapper(input, { principal, db: prisma,
      ensureActor: (tx) => ensureDevelopmentPlatformAdmin(tx, principal) });
    revalidatePath("/system-controls/whatsapp-templates/wrappers");
    return { ok: true, ...result };
  } catch (error) {
    if (error instanceof WrapperConflictError) return { ok: false, conflict: true, message: error.message };
    if (error instanceof WrapperRequestError) return { ok: false, conflict: false, message: error.message.slice(0, 300) };
    return { ok: false, conflict: false, message: "Wrapper publication failed. Refresh and contact platform support if it persists." };
  }
}
