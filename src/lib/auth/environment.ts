const DEVELOPMENT = 'development';
const TEST = 'test';
const PRODUCTION = 'production';

export function resolveDeploymentEnvironmentName(): string {
  const explicit = process.env.DEPLOYMENT_ENVIRONMENT_NAME?.trim().toLowerCase();
  if (explicit) return explicit;

  const nodeEnvironment = process.env.NODE_ENV?.trim().toLowerCase();
  if (nodeEnvironment) return nodeEnvironment;

  return 'unknown';
}

export function isDevelopmentAuthBypass(): boolean {
  const environment = resolveDeploymentEnvironmentName();

  if (environment !== DEVELOPMENT) return false;

  if (process.env.NODE_ENV === PRODUCTION) {
    throw new Error(
      'Refusing platform-admin authentication bypass: ' +
        'DEPLOYMENT_ENVIRONMENT_NAME=development is invalid when NODE_ENV=production.',
    );
  }

  // The historical development bypass stays enabled by default. Developers may
  // explicitly disable it to exercise the real Google/SUPER_ADMIN login path.
  // This flag cannot enable bypass outside development or under NODE_ENV=production.
  return process.env.ADMIN_DEVELOPMENT_AUTH_BYPASS !== 'false';
}

export function assertPlatformAdminAuthConfiguration(): void {
  if (isDevelopmentAuthBypass()) return;

  const environment = resolveDeploymentEnvironmentName();
  const required = [
    'AUTH_SECRET',
    'AUTH_GOOGLE_ID',
    'AUTH_GOOGLE_SECRET',
    'AUTH_URL',
  ] as const;

  const missing = required.filter((name) => !process.env[name]?.trim());

  if (missing.length) {
    throw new Error(
      `Platform-admin authentication is not configured for ${environment}: missing ${missing.join(', ')}.`,
    );
  }
}

export function isHostedAdminEnvironment(): boolean {
  const environment = resolveDeploymentEnvironmentName();
  return environment === TEST || environment === PRODUCTION;
}

/** Auth.js credentials are resolved lazily. Routing still requires an external URL,
 * even when all credential values are sealed in PostgreSQL. */
export function assertPlatformAdminAuthRoutingConfiguration(): void {
  if (isDevelopmentAuthBypass()) return;
  if (!process.env.AUTH_URL?.trim()) {
    throw new Error('Platform-admin authentication is not configured: missing AUTH_URL.');
  }
}
