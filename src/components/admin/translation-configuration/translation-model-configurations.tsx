import type { TranslationModelConfigurationView } from "@/lib/admin/translation-configuration";
import {
  TranslationModelConfigurationForm,
  TranslationModelEnabledForm,
} from "./translation-model-configuration-form";

export function TranslationModelConfigurations({
  models,
  canMutate,
  credentialConfigured,
}: {
  models: TranslationModelConfigurationView[];
  canMutate: boolean;
  credentialConfigured: boolean;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-gray-950">
          Translation model profiles
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-gray-600">
          Define the OpenAI models that later Store Category enablement can
          choose from. Profiles are configuration only; ADMIN-001 does not run
          translations.
        </p>
      </div>

      {canMutate ? (
        credentialConfigured ? (
          <div className="mt-5 rounded-md border border-dashed border-gray-300 bg-gray-50 p-4">
            <h3 className="text-sm font-semibold text-gray-900">
              Add translation model
            </h3>
            <div className="mt-4">
              <TranslationModelConfigurationForm mode="create" />
            </div>
          </div>
        ) : (
          <p className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Configure the OpenAI provider credential before creating translation
            model profiles.
          </p>
        )
      ) : null}

      <div className="mt-6 space-y-5">
        {models.length === 0 ? (
          <p className="border-y border-gray-200 py-8 text-sm text-gray-600">
            No translation model profiles are configured for this environment.
          </p>
        ) : (
          models.map((model) => (
            <article
              key={model.id}
              className="rounded-md border border-gray-200 bg-white p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-gray-950">
                    {model.displayName}
                  </h3>
                  <p className="mt-1 font-mono text-xs text-gray-600">
                    {model.provider}/{model.providerModelId}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    model.enabled
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {model.enabled ? "Enabled" : "Disabled"}
                </span>
              </div>

              <dl className="mt-4 grid gap-3 border-y border-gray-200 py-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="font-semibold uppercase tracking-wide text-gray-500">
                    Environment
                  </dt>
                  <dd className="mt-1 text-gray-800">{model.environment}</dd>
                </div>
                <div>
                  <dt className="font-semibold uppercase tracking-wide text-gray-500">
                    Edit version
                  </dt>
                  <dd className="mt-1 text-gray-800">{model.editVersion}</dd>
                </div>
                <div>
                  <dt className="font-semibold uppercase tracking-wide text-gray-500">
                    Updated
                  </dt>
                  <dd className="mt-1 text-gray-800">{model.updatedAt}</dd>
                </div>
                <div>
                  <dt className="font-semibold uppercase tracking-wide text-gray-500">
                    Updated by
                  </dt>
                  <dd className="mt-1 break-all font-mono text-gray-800">
                    {model.updatedByAdminId}
                  </dd>
                </div>
              </dl>

              {canMutate ? (
                <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
                  <TranslationModelConfigurationForm
                    key={`edit-${model.id}-${model.editVersion}`}
                    mode="edit"
                    model={model}
                  />
                  <TranslationModelEnabledForm
                    key={`status-${model.id}-${model.editVersion}`}
                    model={model}
                  />
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>
    </section>
  );
}
