"use server";

import { revalidatePath } from "next/cache";
import { ConfigurationError } from "@/lib/admin/platform-configuration/errors";
import { PlatformAdminUnauthorizedError } from "@/lib/auth/platform-admin";
import { updatePlatformConfiguration, resetPlatformConfiguration } from "@/lib/admin/platform-configuration/service";

export type ConfigurationActionResult =
  | { ok: true; version: number }
  | { ok: false; code: string; message: string; fieldErrors?: Record<string, string> };

/** One authenticated Server Action for all non-secret contracts; secret writes are not available. */
export async function mutatePlatformConfigurationAction(operation: "save" | "reset", input: unknown): Promise<ConfigurationActionResult> {
  try {
    if (operation !== "save" && operation !== "reset") return { ok: false, code: "INVALID_INPUT", message: "Unsupported action." };
    const result = operation === "save" ? await updatePlatformConfiguration(input) : await resetPlatformConfiguration(input);
    revalidatePath("/system-controls/platform-configuration");
    revalidatePath("/observability");
    return { ok: true, version: result.version };
  } catch (cause) {
    if (cause instanceof PlatformAdminUnauthorizedError) return { ok: false, code: "FORBIDDEN", message: "Platform administrator access is required." };
    if (cause instanceof ConfigurationError) {
      if (cause.code === "INVALID_INPUT" && cause.message.startsWith("{")) {
        try {
          const details = JSON.parse(cause.message) as { message?: string; fields?: Record<string, string> };
          return { ok: false, code: cause.code, message: details.message ?? "Invalid policy values.", fieldErrors: details.fields };
        } catch { /* use generic response */ }
      }
      return { ok: false, code: cause.code, message: cause.message };
    }
    return { ok: false, code: "DB_UNAVAILABLE", message: "Configuration is temporarily unavailable." };
  }
}
