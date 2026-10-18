import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

import { assertPlatformAdminAuthRoutingConfiguration } from '@/lib/auth/environment';
import { resolveAdminAuthCredentials } from '@/lib/auth/platform-auth-credentials';
import { logAdminSecurityEvent } from '@/lib/auth/audit';
import { prisma } from '@/lib/prisma';
import {
  authorizeGoogleProfile,
  bindPlatformAdminSubject,
} from '@/lib/auth/security-policy';
import { isHostedAdminEnvironment } from '@/lib/auth/environment';

// Auth.js v5 lazy configuration: credentials are read only when an auth request,
// session check, or auth action needs them, not when the module starts.
export const { handlers, auth, signIn, signOut } = NextAuth(async () => {
  assertPlatformAdminAuthRoutingConfiguration();
  const credentials = await resolveAdminAuthCredentials();
  return {
  secret: credentials.authSecret,
  providers: [Google({ clientId: credentials.googleClientId, clientSecret: credentials.googleClientSecret })],
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60,
  },
  cookies: {
    sessionToken: {
      name: 'moda-admin.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        secure: isHostedAdminEnvironment(),
        path: '/',
      },
    },
  },
  callbacks: {
    async jwt({ token, account }) {
      if (account?.provider === 'google' && account.providerAccountId) {
        (token as typeof token & { providerSubject?: string }).providerSubject =
          account.providerAccountId;
      }
      return token;
    },
    async session({ session, token }) {
      const providerSubject = (token as typeof token & { providerSubject?: string })
        .providerSubject;
      if (providerSubject) {
        (session.user as typeof session.user & { providerSubject?: string })
          .providerSubject = providerSubject;
      }
      return session;
    },
    async signIn({ account, profile }) {
      assertPlatformAdminAuthRoutingConfiguration();

      if (account?.provider !== 'google') {
        logAdminSecurityEvent('admin.auth.login_denied', {
          outcome: 'denied',
          reasonCode: 'unsupported_provider',
        });
        return false;
      }

      const allowed = await authorizeGoogleProfile(profile, {
        findByEmail: (email) => prisma.platformAdmin.findUnique({ where: { email } }),
        bindSubject: (admin, subject, displayName) =>
          bindPlatformAdminSubject(admin, subject, displayName, {
            bindUnboundSubject: async (adminId, providerSubject, bindingDisplayName) => {
              const bound = await prisma.platformAdmin.updateMany({
                where: {
                  id: adminId,
                  active: true,
                  provider: 'google',
                  providerSubject: null,
                },
                data: {
                  providerSubject,
                  displayName: admin.displayName ?? bindingDisplayName,
                  lastLoginAt: new Date(),
                },
              });
              return bound.count;
            },
            findById: (adminId) =>
              prisma.platformAdmin.findUnique({ where: { id: adminId } }),
          }),
        refreshLogin: (admin) =>
          prisma.platformAdmin.update({
            where: { id: admin.id },
            data: { lastLoginAt: new Date() },
          }).then(() => undefined),
      });
      logAdminSecurityEvent(
        allowed ? 'admin.auth.login_allowed' : 'admin.auth.login_denied',
        {
          outcome: allowed ? 'allowed' : 'denied',
          reasonCode: allowed ? undefined : 'platform_admin_not_authorized',
        },
      );
      return allowed;
    },
  },
  };
});
