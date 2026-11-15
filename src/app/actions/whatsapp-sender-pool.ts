"use server";
import { revalidatePath } from "next/cache";
import { PlatformAdminUnauthorizedError } from "@/lib/auth/platform-admin";
import { ConfigurationError } from "@/lib/admin/platform-configuration/errors";
import { mutateWhatsAppSenderPool } from "@/lib/admin/platform-configuration/whatsapp-sender-pool";
import { SenderPoolError, type PoolCode, type PoolRow } from "@/lib/admin/platform-configuration/whatsapp-sender-pool-types";
export async function mutateWhatsAppSenderPoolAction(input: unknown): Promise<{ ok: true; row: PoolRow } | { ok: false; code: PoolCode }> {
  try { const row = await mutateWhatsAppSenderPool(input); revalidatePath("/system-controls/platform-configuration"); return { ok: true, row }; }
  catch (cause) {
    if (cause instanceof PlatformAdminUnauthorizedError || cause instanceof ConfigurationError && cause.code === "FORBIDDEN") return { ok: false, code: "FORBIDDEN" };
    return { ok: false, code: cause instanceof SenderPoolError ? cause.code : "DB_UNAVAILABLE" };
  }
}
