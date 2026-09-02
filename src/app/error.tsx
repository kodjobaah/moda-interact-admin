'use client';

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-bold text-gray-900">
          The admin data could not be loaded
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Check that DATABASE_URL is configured and that the PostgreSQL database
          is reachable.
        </p>
        <button
          onClick={reset}
          className="mt-5 rounded-md bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)]"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
