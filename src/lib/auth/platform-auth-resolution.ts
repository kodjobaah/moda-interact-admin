/** Pure, injectable authentication-time resolution contract (no DB or Auth.js imports). */
export type AdminAuthCredentialBundle = Readonly<{
  authSecret: string;
  googleClientId: string;
  googleClientSecret: string;
  source: "database" | "environment";
  version: number | null;
}>;
export type StoredAuthConfiguration = { value: unknown; version: number } | null;
export type AdminAuthCredentialDependencies = {
  environment: string;
  isProductionNode: boolean;
  read: () => Promise<StoredAuthConfiguration>;
  decode: (row: Exclude<StoredAuthConfiguration, null>) => {
    authSecret: string; googleClientId: string; googleClientSecret: string;
  };
  environmentCredentials: () => {
    authSecret?: string; googleClientId?: string; googleClientSecret?: string;
  };
};

const ENVIRONMENTS = new Set(["local", "test", "development", "staging", "production"]);

/** Fallback only when DB positively confirms row absence. A failure in any
 * other state (including a disabled tombstone) is never an env fallback. */
export async function resolveAdminAuthCredentialsWithDependencies(
  dependencies: AdminAuthCredentialDependencies,
): Promise<AdminAuthCredentialBundle> {
  if (!ENVIRONMENTS.has(dependencies.environment) ||
      dependencies.isProductionNode && dependencies.environment === "development") {
    throw new Error("Invalid Admin authentication environment.");
  }
  let row: StoredAuthConfiguration;
  try { row = await dependencies.read(); }
  catch { throw new Error("Admin authentication configuration is unavailable."); }
  if (row === null) {
    const bundle = dependencies.environmentCredentials();
    if (!bundle.authSecret?.trim() || !bundle.googleClientId?.trim() || !bundle.googleClientSecret?.trim()) {
      throw new Error("Admin authentication environment credentials are incomplete.");
    }
    return { authSecret: bundle.authSecret, googleClientId: bundle.googleClientId,
      googleClientSecret: bundle.googleClientSecret, source: "environment", version: null };
  }
  if (!Number.isSafeInteger(row.version) || row.version < 1) {
    throw new Error("Invalid Admin authentication configuration.");
  }
  try {
    const bundle = dependencies.decode(row);
    if (!bundle.authSecret?.trim() || !bundle.googleClientId?.trim() || !bundle.googleClientSecret?.trim()) {
      throw new Error("Incomplete credentials.");
    }
    return { ...bundle, source: "database", version: row.version };
  } catch {
    throw new Error("Invalid Admin authentication configuration.");
  }
}
