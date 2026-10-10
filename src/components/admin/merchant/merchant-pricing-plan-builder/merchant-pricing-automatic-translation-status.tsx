import Link from "next/link";
import type { MerchantPricingAutomaticTranslationController } from "./use-merchant-pricing-automatic-translation";

export function MerchantPricingAutomaticTranslationStatus({
  translationsRetained,
  translation,
}: {
  translationsRetained: boolean;
  translation: MerchantPricingAutomaticTranslationController;
}) {
  if (translationsRetained) {
    return (
      <section className="rounded-md border border-green-200 bg-green-50 p-4 text-sm">
        <h3 className="font-semibold text-green-900">Translations</h3>
        <p className="mt-1 font-medium text-green-800">20 / 20 languages ready</p>
        <p className="mt-1 text-green-800">
          Existing translations remain valid because the English merchant content has not changed.
        </p>
      </section>
    );
  }

  const { run, requestPending, error, configurationRequired } = translation;
  const statusLabel = run
    ? run.status === "READY_TO_APPLY"
      ? "Ready"
      : run.status === "FAILED" || run.status === "STALE"
        ? "Needs attention"
        : run.status === "APPLIED"
          ? "Applied"
          : "Translating"
    : null;

  return (
    <section className="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm">
      <h3 className="font-semibold text-gray-900">Translations</h3>
      <p className="mt-1 text-gray-600">
        Moda Interact automatically translates the English merchant content into all supported languages.
      </p>

      {run ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-md bg-white p-3 ring-1 ring-gray-200">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Model</p>
            <p className="mt-1 font-medium text-gray-900">{run.modelDisplayName}</p>
          </div>
          <div className="rounded-md bg-white p-3 ring-1 ring-gray-200">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Status</p>
            <p className="mt-1 font-medium text-gray-900">{statusLabel}</p>
          </div>
          <div className="rounded-md bg-white p-3 ring-1 ring-gray-200">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Languages</p>
            <p className="mt-1 font-medium text-gray-900">
              {run.completeLocaleCount} / {run.localeCount} ready
            </p>
          </div>
        </div>
      ) : null}

      {!run && requestPending ? (
        <p className="mt-4 rounded-md bg-blue-50 px-3 py-2 text-blue-800">
          Creating the automatic translation request…
        </p>
      ) : null}

      {run && (run.status === "PENDING" || run.status === "PROCESSING") ? (
        <p className="mt-4 rounded-md bg-blue-50 px-3 py-2 text-blue-800">
          Translation is in progress. You can leave this step and return later; the work is durable.
        </p>
      ) : null}

      {run?.status === "READY_TO_APPLY" ? (
        <p className="mt-4 rounded-md bg-green-50 px-3 py-2 font-medium text-green-800">
          {run.completeLocaleCount} / {run.localeCount} languages are ready. The translations will be applied atomically when you save the plan.
        </p>
      ) : null}

      {run?.status === "FAILED" || run?.status === "STALE" ? (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-red-800">
          <p className="font-medium">Automatic translation needs attention.</p>
          <p className="mt-1">
            {run.status === "STALE"
              ? "The durable translation request no longer matches the current translation work. Retry using the current English content."
              : `Failure code: ${run.failureCode ?? "TRANSLATION_FAILED"}`}
          </p>
          <button
            type="button"
            className="mt-3 rounded-md border border-red-300 bg-white px-3 py-2 font-semibold text-red-800 disabled:opacity-50"
            disabled={requestPending}
            onClick={translation.retry}
          >
            {requestPending ? "Retrying…" : "Retry translations"}
          </button>
        </div>
      ) : null}

      {run?.status === "APPLIED" ? (
        <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-amber-900">
          This translation run has already been applied. Reload the plan before attempting another save.
        </p>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
          <p>{error}</p>
          {configurationRequired ? (
            <p className="mt-2">
              <Link className="font-semibold underline" href="/system-controls/translations">
                Open System Controls / Translations
              </Link>
              {" "}to configure the automatic translation model.
            </p>
          ) : (
            <button
              type="button"
              className="mt-3 rounded-md border border-amber-300 bg-white px-3 py-2 font-semibold disabled:opacity-50"
              disabled={requestPending}
              onClick={translation.retry}
            >
              {requestPending ? "Retrying…" : "Retry translations"}
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}
