export type PlatformAdminAuthorizationRecord = {
  id: string;
  active: boolean;
  provider: string;
  providerSubject: string | null;
  displayName?: string | null;
};

export type PlatformAdminPersistence = {
  findByEmail(email: string): Promise<PlatformAdminAuthorizationRecord | null>;
  bindSubject(
    admin: PlatformAdminAuthorizationRecord,
    providerSubject: string,
    displayName: string | null,
  ): Promise<boolean>;
  refreshLogin(admin: PlatformAdminAuthorizationRecord): Promise<void>;
};

export type PlatformAdminSubjectBindingPersistence = {
  bindUnboundSubject(
    adminId: string,
    providerSubject: string,
    displayName: string | null,
  ): Promise<number>;
  findById(adminId: string): Promise<PlatformAdminAuthorizationRecord | null>;
};

type GoogleProfile = {
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
};

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normaliseEmail(value: unknown): string | null {
  const email = stringValue(value)?.toLowerCase();
  return email?.includes('@') ? email : null;
}

export function isAuthorizedPlatformAdmin(
  admin: PlatformAdminAuthorizationRecord | null,
  providerSubject: string | null | undefined,
): boolean {
  return Boolean(
    admin?.active &&
      admin.provider === 'google' &&
      providerSubject &&
      admin.providerSubject === providerSubject,
  );
}

export function canBindPlatformAdmin(
  admin: PlatformAdminAuthorizationRecord | null,
  providerSubject: string | null | undefined,
): boolean {
  return Boolean(
    admin?.active &&
      admin.provider === 'google' &&
      !admin.providerSubject &&
      providerSubject,
  );
}

export async function bindPlatformAdminSubject(
  admin: PlatformAdminAuthorizationRecord,
  providerSubject: string,
  displayName: string | null,
  persistence: PlatformAdminSubjectBindingPersistence,
): Promise<boolean> {
  const boundCount = await persistence.bindUnboundSubject(
    admin.id,
    providerSubject,
    displayName,
  );
  if (boundCount === 1) return true;

  const current = await persistence.findById(admin.id);
  return Boolean(
    current?.active &&
      current.provider === 'google' &&
      current.providerSubject === providerSubject,
  );
}

export async function authorizeGoogleProfile(
  rawProfile: unknown,
  persistence: PlatformAdminPersistence,
): Promise<boolean> {
  const profile = (rawProfile ?? {}) as GoogleProfile;
  const email = normaliseEmail(profile.email);
  const subject = stringValue(profile.sub);
  const displayName = stringValue(profile.name);

  if (!email || !subject || profile.email_verified !== true) return false;

  const admin = await persistence.findByEmail(email);
  if (!admin || !admin.active || admin.provider !== 'google') return false;
  if (admin.providerSubject && admin.providerSubject !== subject) return false;

  if (!admin.providerSubject) {
    return persistence.bindSubject(admin, subject, displayName);
  }

  await persistence.refreshLogin(admin);
  return true;
}