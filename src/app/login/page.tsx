import Image from 'next/image';
import { redirect } from 'next/navigation';

import { signIn } from '@/auth';
import {
  assertPlatformAdminAuthConfiguration,
  isDevelopmentAuthBypass,
} from '@/lib/auth/environment';
import { getPlatformAdminPrincipal } from '@/lib/auth/platform-admin';
import { adminI18n } from '@/i18n';

export const dynamic = 'force-dynamic';

type LoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  if (isDevelopmentAuthBypass()) redirect('/');

  assertPlatformAdminAuthConfiguration();
  if (await getPlatformAdminPrincipal()) redirect('/');

  const error = first((await searchParams).error);

  async function signInWithGoogle() {
    'use server';
    assertPlatformAdminAuthConfiguration();
    await signIn('google', { redirectTo: '/' });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--brand-50)] px-4 py-12">
      <section className="w-full max-w-md rounded-2xl border border-[var(--brand-200)] bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <Image
            src="/moda-interact-logo.jpg"
            alt="Moda Interact"
            width={44}
            height={44}
            className="h-11 w-11 rounded-lg object-cover"
            priority
          />
          <div>
            <p className="text-sm font-medium text-[var(--brand-700)]">Moda Interact</p>
            <h1 className="text-xl font-bold text-[var(--brand-900)]">{adminI18n.t('auth.platformAdmin')}</h1>
          </div>
        </div>
        <p className="mt-6 text-sm leading-6 text-gray-600">
          {adminI18n.t('auth.loginDescription')}
        </p>
        {error ? (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {adminI18n.t('auth.unauthorized')}
          </div>
        ) : null}
        <form action={signInWithGoogle} className="mt-6">
          <button
            type="submit"
            className="flex w-full items-center justify-center rounded-lg bg-[var(--brand-900)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--brand-800)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-500)] focus:ring-offset-2"
          >
            {adminI18n.t('auth.continueGoogle')}
          </button>
        </form>
        <p className="mt-6 text-xs leading-5 text-gray-500">
          {adminI18n.t('auth.restricted')}
        </p>
      </section>
    </main>
  );
}
