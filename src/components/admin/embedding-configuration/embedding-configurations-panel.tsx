"use client";

import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import {
  removeEmbeddingConfigurationAction,
  saveEmbeddingConfigurationAction,
} from "@/app/actions/embedding-configuration";
import type { EmbeddingConfigurationStatus } from "@/lib/admin/embedding-configuration";

const fieldClass =
  "mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-200)] disabled:bg-gray-100";

const purposeLabels: Record<EmbeddingConfigurationStatus["purpose"], string> = {
  MERCHANT_KNOWLEDGE: "Merchant Knowledge",
  REFERENCE_TAXONOMY: "Reference Taxonomy",
};

function defaults(status: EmbeddingConfigurationStatus) {
  if (status.configured) {
    return {
      provider: status.embeddingProvider ?? "openai",
      model: status.embeddingModel ?? "text-embedding-3-small",
      dimensions: status.embeddingDimensions ?? 384,
      indexVersion: status.embeddingIndexVersion ?? "embedding-v1",
    };
  }
  if (status.purpose === "MERCHANT_KNOWLEDGE") {
    return {
      provider: "openai",
      model: "text-embedding-3-small",
      dimensions: 1536,
      indexVersion: "merchant-knowledge-v1",
    };
  }
  return {
    provider: "openai",
    model: "text-embedding-3-small",
    dimensions: 384,
    indexVersion: "reference-taxonomy-v1",
  };
}

function EmbeddingConfigurationCard({
  status,
  canMutate,
}: {
  status: EmbeddingConfigurationStatus;
  canMutate: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const secretRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const [editing, setEditing] = useState(!status.configured);
  const [pending, setPending] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshRequired, setRefreshRequired] = useState(false);
  const initial = defaults(status);

  function clearSecret() {
    if (secretRef.current) secretRef.current.value = "";
    setShowSecret(false);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || refreshRequired) return;
    const formData = new FormData(event.currentTarget);
    formData.set("operationId", crypto.randomUUID());
    inFlight.current = true;
    flushSync(() => {
      setPending(true);
      setMessage(null);
    });
    try {
      const result = await saveEmbeddingConfigurationAction(formData);
      clearSecret();
      if (result.ok) {
        setMessage("Embedding configuration saved.");
        setEditing(false);
        router.refresh();
      } else {
        setMessage(result.message);
        if (result.refreshRequired) setRefreshRequired(true);
      }
    } catch {
      clearSecret();
      setMessage("Embedding configuration update could not be completed.");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  async function remove(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || refreshRequired || !status.editVersion) return;
    const formData = new FormData(event.currentTarget);
    formData.set("operationId", crypto.randomUUID());
    formData.set("expectedEditVersion", String(status.editVersion));
    inFlight.current = true;
    flushSync(() => {
      setPending(true);
      setMessage(null);
    });
    try {
      const result = await removeEmbeddingConfigurationAction(formData);
      if (result.ok) {
        setMessage("Embedding configuration removed.");
        setEditing(true);
        router.refresh();
      } else {
        setMessage(result.message);
        if (result.refreshRequired) setRefreshRequired(true);
      }
    } catch {
      setMessage("Embedding configuration update could not be completed.");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <article className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {purposeLabels[status.purpose]}
          </h2>
          <p className="mt-1 font-mono text-xs text-gray-500">{status.purpose}</p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            status.configured
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-700"
          }`}
        >
          {status.configured ? "Configured" : "Not configured"}
        </span>
      </div>

      {status.configured ? (
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs font-semibold text-gray-500">Provider</dt>
            <dd className="mt-1 text-gray-900">{status.embeddingProvider}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-gray-500">Model</dt>
            <dd className="mt-1 break-all text-gray-900">{status.embeddingModel}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-gray-500">Dimensions</dt>
            <dd className="mt-1 text-gray-900">{status.embeddingDimensions}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-gray-500">Index version</dt>
            <dd className="mt-1 break-all text-gray-900">
              {status.embeddingIndexVersion}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-gray-500">Credential</dt>
            <dd className="mt-1 text-gray-900">Configured</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-gray-500">Edit version</dt>
            <dd className="mt-1 text-gray-900">{status.editVersion}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs font-semibold text-gray-500">Updated</dt>
            <dd className="mt-1 text-gray-900">{status.updatedAt}</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-5 text-sm text-gray-600">
          No embedding configuration is stored for this purpose in the current
          Commerce environment.
        </p>
      )}

      {canMutate ? (
        <div className="mt-5 border-t border-gray-200 pt-5">
          {status.configured && !editing ? (
            <button
              type="button"
              onClick={() => {
                setEditing(true);
                setMessage(null);
              }}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Configure
            </button>
          ) : (
            <form
              ref={formRef}
              onSubmit={save}
              aria-busy={pending}
              className="grid gap-4 lg:grid-cols-2"
            >
              <input type="hidden" name="purpose" value={status.purpose} />
              <input
                type="hidden"
                name="expectedEditVersion"
                value={status.editVersion ?? ""}
              />
              <label className="block text-sm font-medium text-gray-800">
                Provider
                <input
                  className={fieldClass}
                  name="embeddingProvider"
                  defaultValue={initial.provider}
                  maxLength={64}
                  disabled={pending || refreshRequired}
                  required
                />
              </label>
              <label className="block text-sm font-medium text-gray-800">
                Model
                <input
                  className={fieldClass}
                  name="embeddingModel"
                  defaultValue={initial.model}
                  maxLength={255}
                  disabled={pending || refreshRequired}
                  required
                />
              </label>
              <label className="block text-sm font-medium text-gray-800">
                Dimensions
                <input
                  className={fieldClass}
                  type="number"
                  name="embeddingDimensions"
                  defaultValue={initial.dimensions}
                  min={1}
                  max={65535}
                  disabled={pending || refreshRequired}
                  required
                />
              </label>
              <label className="block text-sm font-medium text-gray-800">
                Embedding index version
                <input
                  className={fieldClass}
                  name="embeddingIndexVersion"
                  defaultValue={initial.indexVersion}
                  maxLength={64}
                  disabled={pending || refreshRequired}
                  required
                />
              </label>
              <label className="block text-sm font-medium text-gray-800 lg:col-span-2">
                API credential
                <input
                  ref={secretRef}
                  className={fieldClass}
                  type={showSecret ? "text" : "password"}
                  name="secret"
                  autoComplete="new-password"
                  spellCheck={false}
                  maxLength={8192}
                  disabled={pending || refreshRequired}
                  required={!status.configured}
                  placeholder={
                    status.configured
                      ? "Leave blank to keep the current credential"
                      : undefined
                  }
                />
              </label>
              <div className="-mt-2 flex flex-wrap items-center gap-3 text-sm lg:col-span-2">
                <button
                  type="button"
                  onClick={() => setShowSecret((visible) => !visible)}
                  disabled={pending || refreshRequired}
                  aria-pressed={showSecret}
                  className="font-medium text-[var(--brand-700)] underline-offset-2 hover:underline disabled:opacity-50"
                >
                  {showSecret ? "Hide entered credential" : "Show entered credential"}
                </button>
                <span className="text-xs text-gray-500">
                  A saved credential cannot be viewed from Admin. Changing the
                  provider requires a new credential.
                </span>
              </div>
              <label className="block text-sm font-medium text-gray-800 lg:col-span-2">
                Audit reason
                <textarea
                  className={fieldClass}
                  name="reason"
                  maxLength={1000}
                  rows={3}
                  disabled={pending || refreshRequired}
                  required
                />
              </label>
              <div className="flex flex-wrap items-center gap-3 lg:col-span-2">
                <button
                  type="submit"
                  disabled={pending || refreshRequired}
                  className="rounded-md bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pending ? "Saving…" : "Save configuration"}
                </button>
                {status.configured ? (
                  <button
                    type="button"
                    onClick={() => {
                      formRef.current?.reset();
                      clearSecret();
                      setEditing(false);
                      setMessage(null);
                    }}
                    disabled={pending}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                ) : null}
                {refreshRequired ? (
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Refresh status
                  </button>
                ) : null}
              </div>
            </form>
          )}

          {status.configured && editing ? (
            <form onSubmit={remove} className="mt-6 space-y-4 border-t border-gray-200 pt-5">
              <input type="hidden" name="purpose" value={status.purpose} />
              <label className="block text-sm font-medium text-gray-800">
                Removal reason
                <textarea
                  className={fieldClass}
                  name="reason"
                  maxLength={1000}
                  rows={2}
                  disabled={pending || refreshRequired}
                  required
                />
              </label>
              <label className="flex items-start gap-2 text-sm text-gray-700">
                <input
                  className="mt-1"
                  type="checkbox"
                  name="confirmation"
                  value="confirmed"
                  disabled={pending || refreshRequired}
                  required
                />
                <span>
                  Remove this embedding configuration and its stored credential.
                </span>
              </label>
              <button
                type="submit"
                disabled={pending || refreshRequired}
                className="rounded-md border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Remove configuration
              </button>
            </form>
          ) : null}
        </div>
      ) : (
        <p className="mt-5 border-t border-gray-200 pt-4 text-sm text-gray-500">
          SUPER_ADMIN access is required to change embedding configuration.
        </p>
      )}

      <p role="status" aria-live="polite" className="mt-4 min-h-5 text-sm text-gray-700">
        {pending ? "Updating embedding configuration…" : message}
      </p>
    </article>
  );
}

export function EmbeddingConfigurationsPanel({
  statuses,
  canMutate,
}: {
  statuses: EmbeddingConfigurationStatus[];
  canMutate: boolean;
}) {
  const environment = statuses[0]?.environment ?? "UNKNOWN";
  return (
    <section className="max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--brand-900)]">Embeddings</h1>
        <p className="mt-2 max-w-3xl text-sm text-gray-600">
          Configure the provider, model, dimensions, index version and encrypted
          provider credential for each embedding purpose. Existing vectors built
          with a different configuration must be rebuilt before they are queried.
        </p>
      </div>
      <div className="mb-6 rounded-lg border border-[var(--brand-200)] bg-[var(--brand-50)] px-4 py-3 text-sm">
        <span className="font-semibold text-[var(--brand-900)]">Commerce environment:</span>{" "}
        <span className="font-mono text-[var(--brand-800)]">{environment}</span>
        <span className="ml-2 text-gray-600">
          This deployment can configure only its current environment.
        </span>
      </div>
      <div className="space-y-5">
        {statuses.map((status) => (
          <EmbeddingConfigurationCard
            key={`${status.purpose}:${status.editVersion ?? "none"}`}
            status={status}
            canMutate={canMutate}
          />
        ))}
      </div>
    </section>
  );
}
