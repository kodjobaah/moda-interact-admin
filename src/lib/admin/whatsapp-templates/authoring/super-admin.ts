import type { PlatformAdminPrincipal } from "../../../auth/platform-admin";

/** Shared authoring/media SUPER_ADMIN gate without loading database code in pure readers. */
export function requireTemplateSuperAdmin(principal: Pick<PlatformAdminPrincipal, "role" | "id">): void {
  if (principal.role !== "SUPER_ADMIN" || !principal.id) throw new Error("SUPER_ADMIN required for WhatsApp template management.");
}
