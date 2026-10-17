import { prisma } from "@/lib/prisma";
import { requirePlatformAdminMutation, requirePlatformAdminRead, type PlatformAdminPrincipal } from "@/lib/auth/platform-admin";
import { resolveDeploymentEnvironmentName } from "@/lib/auth/environment";
import { PLATFORM_POLICY_REGISTRY, publicContracts, type Registry } from "./contracts";
import { ConfigurationError } from "./errors";
import { readConfiguration, readConfigurationHistory } from "./repository";
import { mutateConfigurationWithDependencies } from "./mutate";

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
export function requireConfigurationSuperAdmin(principal: PlatformAdminPrincipal): void {
  if (principal.role !== "SUPER_ADMIN") throw new ConfigurationError("FORBIDDEN", "SUPER_ADMIN access is required.");
}
function policy(key: unknown, registry: Registry) {
  if (typeof key !== "string") throw new ConfigurationError("INVALID_INPUT", "Unsupported policy key.");
  const contract = registry.get(key);
  if (!contract || contract.kind !== "policy" || contract.requiredRole !== "SUPER_ADMIN") {
    throw new ConfigurationError("INVALID_INPUT", "Unsupported policy key.");
  }
  return contract;
}
/** Only a real persisted active SUPER_ADMIN may be recorded in the audit. */
async function authorId(principal: PlatformAdminPrincipal): Promise<string> {
  if (!principal.developmentBypass) return principal.id;
  const admin = await prisma.platformAdmin.findFirst({ where: { role: "SUPER_ADMIN", active: true }, select: { id: true } });
  if (!admin) throw new ConfigurationError("FORBIDDEN", "Provision an active SUPER_ADMIN account before editing policies.");
  return admin.id;
}

export async function configurationPageData(key: unknown, cursor?: string) {
  const principal = await requirePlatformAdminRead();
  requireConfigurationSuperAdmin(principal);
  const env = getConfigurationEnvironment();
  const selected = policy(key, PLATFORM_POLICY_REGISTRY);
  const snapshot = await readConfiguration(prisma, env, selected.key, PLATFORM_POLICY_REGISTRY);
  const history = await readConfigurationHistory(prisma, env, selected.key, cursor);
  return { contracts: publicContracts(), snapshot, history, environment: env };
}
export async function readPlatformConfiguration(key: unknown) {
  const principal = await requirePlatformAdminRead();
  requireConfigurationSuperAdmin(principal);
  const env = getConfigurationEnvironment();
  return readConfiguration(prisma, env, policy(key, PLATFORM_POLICY_REGISTRY).key, PLATFORM_POLICY_REGISTRY);
}
export async function listPlatformConfigurationAudit(key: unknown, cursor?: string) {
  const principal = await requirePlatformAdminRead();
  requireConfigurationSuperAdmin(principal);
  const env = getConfigurationEnvironment();
  return readConfigurationHistory(prisma, env, policy(key, PLATFORM_POLICY_REGISTRY).key, cursor);
}

export async function updatePlatformConfiguration(input: unknown) {
  return authorizedMutation(input, "save");
}
export async function resetPlatformConfiguration(input: unknown) {
  return authorizedMutation(input, "reset");
}
async function authorizedMutation(input: unknown, operation: "save" | "reset") {
  const principal = await requirePlatformAdminMutation();
  requireConfigurationSuperAdmin(principal);
  const environment = getConfigurationEnvironment();
  const actorId = await authorId(principal);
  return mutateConfigurationWithDependencies(input, operation, {
    principal, environment, actorId, db: prisma, registry: PLATFORM_POLICY_REGISTRY,
  });
}
