import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const sourcePath = (relativePath) => path.join(repositoryRoot, relativePath);

function runEnvironmentCheck(nodeEnvironment, deploymentEnvironment) {
  const environmentPath = sourcePath('src/lib/auth/environment.ts');
  const script = `
    import {
      assertPlatformAdminAuthConfiguration,
      isDevelopmentAuthBypass,
    } from ${JSON.stringify(environmentPath)};
    const result = { bypass: false, configuration: 'ok' };
    try { result.bypass = isDevelopmentAuthBypass(); }
    catch (error) { result.bypassError = error.message; }
    try { assertPlatformAdminAuthConfiguration(); }
    catch (error) { result.configuration = error.message; }
    console.log(JSON.stringify(result));
  `;
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--input-type=module', '--eval', script],
    {
      env: {
        ...process.env,
        NODE_ENV: nodeEnvironment,
        DEPLOYMENT_ENVIRONMENT_NAME: deploymentEnvironment,
        AUTH_SECRET: '',
        AUTH_GOOGLE_ID: '',
        AUTH_GOOGLE_SECRET: '',
        AUTH_URL: '',
      },
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim());
}

function runIdentityCheck() {
  const policyPath = sourcePath('src/lib/auth/security-policy.ts');
  const script = `
    import {
      canBindPlatformAdmin,
      isAuthorizedPlatformAdmin,
    } from ${JSON.stringify(policyPath)};
    const record = (active, providerSubject) => ({
      active,
      provider: 'google',
      providerSubject,
    });
    console.log(JSON.stringify({
      bound: isAuthorizedPlatformAdmin(record(true, 'google-1'), 'google-1'),
      unbound: canBindPlatformAdmin(record(true, null), 'google-1'),
      unknown: isAuthorizedPlatformAdmin(null, 'google-1'),
      inactive: isAuthorizedPlatformAdmin(record(false, 'google-1'), 'google-1'),
      mismatch: isAuthorizedPlatformAdmin(record(true, 'google-1'), 'google-2'),
      revoked: isAuthorizedPlatformAdmin(record(false, 'google-1'), 'google-1'),
    }));
  `;
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--input-type=module', '--eval', script],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim());
}

function runGoogleAuthorizationCheck() {
  const policyPath = sourcePath('src/lib/auth/security-policy.ts');
  const script = `
    import { authorizeGoogleProfile } from ${JSON.stringify(policyPath)};
    const profile = { sub: 'google-1', email: 'ADMIN@EXAMPLE.COM', email_verified: true, name: 'Admin' };
    const run = async (admin, bindSubject = 'google-1') => authorizeGoogleProfile(profile, {
      findByEmail: async () => admin,
      bindSubject: async () => bindSubject === 'google-1',
      refreshLogin: async () => {},
    });
    const bound = await run({ id: '1', active: true, provider: 'google', providerSubject: 'google-1' });
    const unbound = await run({ id: '1', active: true, provider: 'google', providerSubject: null });
    const raced = await run({ id: '1', active: true, provider: 'google', providerSubject: null }, 'google-1');
    const unknown = await run(null);
    const inactive = await run({ id: '1', active: false, provider: 'google', providerSubject: 'google-1' });
    const mismatch = await run({ id: '1', active: true, provider: 'google', providerSubject: 'google-2' });
    const unverified = await authorizeGoogleProfile({ ...profile, email_verified: false }, {
      findByEmail: async () => ({ id: '1', active: true, provider: 'google', providerSubject: null }),
      bindSubject: async () => true,
      refreshLogin: async () => {},
    });
    console.log(JSON.stringify({ bound, unbound, raced, unknown, inactive, mismatch, unverified }));
  `;
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--input-type=module', '--eval', script],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim());
}

function runSubjectBindingPersistenceCheck() {
  const policyPath = sourcePath('src/lib/auth/security-policy.ts');
  const script = `
    import { bindPlatformAdminSubject } from ${JSON.stringify(policyPath)};
    const admin = { id: '1', active: true, provider: 'google', providerSubject: null };
    const binding = (count, current) => bindPlatformAdminSubject(admin, 'google-1', 'Admin', {
      bindUnboundSubject: async () => count,
      findById: async () => current,
    });
    const direct = await binding(1, null);
    const racedSame = await binding(0, { ...admin, providerSubject: 'google-1' });
    const racedDifferent = await binding(0, { ...admin, providerSubject: 'google-2' });
    const racedInactive = await binding(0, { ...admin, active: false, providerSubject: 'google-1' });
    console.log(JSON.stringify({ direct, racedSame, racedDifferent, racedInactive }));
  `;
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--input-type=module', '--eval', script],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim());
}

function runPrincipalResolutionCheck() {
  const resolverPath = sourcePath('src/lib/auth/platform-admin.ts');
  const script = `
    import { resolvePlatformAdminPrincipal } from ${JSON.stringify(resolverPath)};
    let active = true;
    const dependencies = {
      getSession: async () => ({ email: 'ADMIN@EXAMPLE.COM', providerSubject: 'google-1' }),
      findByEmail: async () => ({
        id: 'admin-1', role: 'SUPER_ADMIN', active,
        provider: 'google', providerSubject: 'google-1',
      }),
    };
    const allowed = await resolvePlatformAdminPrincipal(dependencies);
    active = false;
    const revoked = await resolvePlatformAdminPrincipal(dependencies);
    console.log(JSON.stringify({ allowed, revoked }));
  `;
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--input-type=module', '--eval', script],
    {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DEPLOYMENT_ENVIRONMENT_NAME: 'test',
        AUTH_SECRET: 'test-secret',
        AUTH_GOOGLE_ID: 'test-google-id',
        AUTH_GOOGLE_SECRET: 'test-google-secret',
        AUTH_URL: 'https://admin-test.example.com',
      },
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim());
}

function runMutationBoundaryCheck() {
  const policyPath = sourcePath('src/lib/auth/tenant-action.ts');
  const script = `
    import { runProtectedTenantAction } from ${JSON.stringify(policyPath)};
    let reads = 0;
    let mutations = 0;
    const formData = { get() { reads += 1; return 'unexpected'; } };
    try {
      await runProtectedTenantAction(formData, async () => { throw new Error('denied'); }, async () => {
        mutations += 1;
      });
    } catch (error) { console.log(JSON.stringify({ error: error.message, reads, mutations })); }
  `;
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--input-type=module', '--eval', script],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim());
}

test('environment matrix enforces the development-only bypass invariant', () => {
  assert.equal(runEnvironmentCheck('development', 'development').bypass, true);
  assert.equal(runEnvironmentCheck('test', 'development').bypass, true);

  for (const [nodeEnvironment, deploymentEnvironment] of [
    ['test', 'test'],
    ['production', 'production'],
  ]) {
    const result = runEnvironmentCheck(nodeEnvironment, deploymentEnvironment);
    assert.equal(result.bypass, false);
    assert.match(result.configuration, /missing AUTH_SECRET/);
  }

  const productionDevelopment = runEnvironmentCheck('production', 'development');
  assert.equal(productionDevelopment.bypass, false);
  assert.match(productionDevelopment.bypassError, /Refusing platform-admin/);
});

test('identity and revocation matrix enforces current PlatformAdmin state', () => {
  assert.deepEqual(runIdentityCheck(), {
    bound: true,
    unbound: true,
    unknown: false,
    inactive: false,
    mismatch: false,
    revoked: false,
  });
});

test('Google authorization executes binding, race, denial, and verification paths', () => {
  assert.deepEqual(runGoogleAuthorizationCheck(), {
    bound: true,
    unbound: true,
    raced: true,
    unknown: false,
    inactive: false,
    mismatch: false,
    unverified: false,
  });
});

test('subject binding persistence executes direct and raced outcomes', () => {
  assert.deepEqual(runSubjectBindingPersistenceCheck(), {
    direct: true,
    racedSame: true,
    racedDifferent: false,
    racedInactive: false,
  });
});

test('principal resolver rechecks the current admin record for session revocation', () => {
  const result = runPrincipalResolutionCheck();
  assert.equal(result.allowed.id, 'admin-1');
  assert.equal(result.allowed.developmentBypass, false);
  assert.equal(result.revoked, null);
});

test('direct mutation rejection runs before FormData access or mutation', () => {
  assert.deepEqual(runMutationBoundaryCheck(), {
    error: 'denied',
    reads: 0,
    mutations: 0,
  });
});

test('identity, revocation, mutation, session, and route contracts are wired', async () => {
  const authSource = await readFile(sourcePath('src/auth.ts'), 'utf8');
  const principalSource = await readFile(
    sourcePath('src/lib/auth/platform-admin.ts'),
    'utf8',
  );
  const policySource = await readFile(
    sourcePath('src/lib/auth/security-policy.ts'),
    'utf8',
  );
  const mutationSource = await readFile(
    sourcePath('src/app/actions/tenant.ts'),
    'utf8',
  );
  const dataSource = await readFile(sourcePath('src/lib/admin/data.ts'), 'utf8');
  const readme = await readFile(sourcePath('README.md'), 'utf8');

  assert.match(policySource, /profile\.email_verified !== true/);
  assert.match(policySource, /admin\.providerSubject && admin\.providerSubject !== subject/);
  assert.match(authSource, /providerSubject =\s*account\.providerAccountId/);
  assert.match(policySource, /admin\.providerSubject === providerSubject/);
  assert.match(policySource, /export async function bindPlatformAdminSubject/);
  assert.match(authSource, /bindPlatformAdminSubject\(/);
  assert.match(principalSource, /resolvePlatformAdminPrincipalCached/);
  assert.match(policySource, /admin\?\.active/);
  assert.match(mutationSource, /requirePlatformAdminMutation,/);
  assert.match(mutationSource, /runProtectedTenantAction\(/);
  assert.ok(
    mutationSource.indexOf('await requirePlatformAdminMutation();') <
      mutationSource.indexOf('formData.get('),
  );
  assert.equal((dataSource.match(/await requirePlatformAdminRead\(\);/g) ?? []).length, 5);
  assert.match(authSource, /maxAge: 8 \* 60 \* 60/);
  assert.match(authSource, /httpOnly: true/);
  assert.match(authSource, /sameSite: 'lax'/);
  assert.match(authSource, /secure: isHostedAdminEnvironment\(\)/);
  assert.match(readme, /admin\.modainteract\.com\/api\/auth\/callback\/google/);
  assert.match(readme, /test callback must use the test Admin host/);
});

test('public infrastructure routes are bounded and remain outside auth guards', async () => {
  const healthSource = await readFile(sourcePath('src/app/health/route.ts'), 'utf8');
  const readySource = await readFile(sourcePath('src/app/ready/route.ts'), 'utf8');
  const readinessSource = await readFile(sourcePath('src/lib/health/readiness.ts'), 'utf8');
  const databaseHealthSource = await readFile(
    sourcePath('src/app/api/health/database/route.ts'),
    'utf8',
  );

  assert.doesNotMatch(healthSource, /requirePlatformAdmin/);
  assert.doesNotMatch(readySource, /requirePlatformAdmin/);
  assert.doesNotMatch(databaseHealthSource, /requirePlatformAdmin/);
  assert.match(healthSource, /status: 'ok'/);
  assert.match(readinessSource, /status: 'ready'/);
  assert.match(readinessSource, /status: 'unavailable'/);
  assert.match(readinessSource, /POSTGRES_READINESS_TIMEOUT_MS/);
  assert.match(readinessSource, /DatabasePing = \(\) => Promise<unknown>/);
  assert.match(databaseHealthSource, /database: 'ok'/);
});

test('audit source contains no prohibited credential or session fields', async () => {
  const auditSource = await readFile(sourcePath('src/lib/auth/audit.ts'), 'utf8');
  assert.doesNotMatch(
    auditSource,
    /password|oauth|authorization|cookie|jwt|session|request|response|profile|secret/i,
  );
});