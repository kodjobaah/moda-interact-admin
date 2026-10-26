/**
 * Pure platform-configuration environment selection. Keep this independent of
 * the Admin authentication/service layer so non-HTTP consumers (including
 * the WhatsApp publication worker and its database tests) do not initialize
 * NextAuth simply to resolve the approved configuration environment.
 */
import { resolveDeploymentEnvironmentName } from "@/lib/auth/environment";
import { ConfigurationError } from "./errors";

const ENVIRONMENTS = new Set(["local", "test", "development", "staging", "production"]);

export function getConfigurationEnvironment(): string {
  const environment = resolveDeploymentEnvironmentName();
  if (!ENVIRONMENTS.has(environment)) throw new ConfigurationError("INVALID_INPUT", "Unknown deployment environment.");
  // NODE_ENV production always wins over any attempt to impersonate development.
  if (process.env.NODE_ENV === "production" && environment === "development") {
    throw new ConfigurationError("FORBIDDEN", "Environment identity is inconsistent.");
  }
  return environment;
}
