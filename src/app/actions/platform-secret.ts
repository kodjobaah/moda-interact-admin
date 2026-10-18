"use server";
import { revalidatePath } from "next/cache";
import { ConfigurationError } from "@/lib/admin/platform-configuration/errors";
import { PlatformAdminUnauthorizedError } from "@/lib/auth/platform-admin";
import { mutatePlatformSecret, revealPlatformSecretField } from "@/lib/admin/platform-configuration/secret-service";

/** Never serialize submitted values or raw Prisma/Crypto errors. */
export async function mutatePlatformSecretAction(input: unknown): Promise<
  { ok: true; version: number } | { ok: false; code: string; message: string }
> {
  try {
    const result = await mutatePlatformSecret(input);
    revalidatePath("/system-controls/platform-configuration");
    return { ok: true, version: result.version };
  } catch (cause) {
    if (cause instanceof PlatformAdminUnauthorizedError) return { ok: false, code: "FORBIDDEN", message: "Platform administrator access is required." };
    if (cause instanceof ConfigurationError) return { ok: false, code: cause.code, message: cause.message };
    return { ok: false, code: "DB_UNAVAILABLE", message: "Secret configuration is temporarily unavailable." };
  }
}

/** Return one explicitly requested decrypted field, never a whole keyring or secret record. */
export async function revealPlatformSecretFieldAction(input: unknown): Promise<
  { ok: true; field: string; value: string | number; version: number } | { ok: false; code: string; message: string }
> {
  try {
    const result = await revealPlatformSecretField(input);
    return { ok: true, ...result };
  } catch (cause) {
    if (cause instanceof PlatformAdminUnauthorizedError) return { ok: false, code: "FORBIDDEN", message: "Administrator access is required." };
    if (cause instanceof ConfigurationError) return { ok: false, code: cause.code, message: cause.message };
    return { ok: false, code: "DB_UNAVAILABLE", message: "Saved credentials are temporarily unavailable." };
  }
}
