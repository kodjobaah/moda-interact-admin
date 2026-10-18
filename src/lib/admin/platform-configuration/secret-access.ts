/**
 * Secret administration accepts the normal authenticated SUPER_ADMIN or the
 * canonical synthetic SUPER_ADMIN only while the server's development bypass
 * is actually active. The client cannot supply or select this principal.
 */
import { isDevelopmentAuthBypass } from "../../auth/environment.ts";

const ACTOR_ID = /^[a-zA-Z0-9_-]{1,191}$/;
const DEVELOPMENT_ACTOR_ID = "development-platform-admin";

export function canManagePlatformSecrets(principal: {
  id: string;
  role: string;
  developmentBypass: boolean;
}): boolean {
  if (principal.role !== "SUPER_ADMIN" || !ACTOR_ID.test(principal.id)) return false;
  if (!principal.developmentBypass) return true;
  // A claimed bypass identity must never work in a production Node process.
  if (process.env.NODE_ENV === "production") return false;
  return principal.id === DEVELOPMENT_ACTOR_ID && isDevelopmentAuthBypass();
}
