import type { PlatformAdminPrincipal } from "@/lib/auth/platform-admin";
import { ConfigurationError } from "./errors";
export function requireConfigurationSuperAdmin(
  principal: Pick<PlatformAdminPrincipal, "role">,
): void {
  if (principal.role !== "SUPER_ADMIN")
    throw new ConfigurationError(
      "FORBIDDEN",
      "SUPER_ADMIN access is required.",
    );
}
