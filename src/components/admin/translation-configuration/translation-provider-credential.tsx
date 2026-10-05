"use client";

import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import {
  removeTranslationProviderCredentialAction,
  replaceTranslationProviderCredentialAction,
  setTranslationProviderCredentialAction,
} from "@/app/actions/translation-configuration";
import type { TranslationProviderCredentialStatus } from "@/lib/admin/translation-configuration";

const fieldClass =
  "mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-200)] disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500";

function TranslationCredentialForm({
  mode,
  status,
}: {
  mode: "set" | "replace";
  status: TranslationProviderCredentialStatus;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const secretRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshRequired, setRefreshRequired] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
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
      const result =
        mode === "set"
          ? await setTranslationProviderCredentialAction(formData)
          : await replaceTranslationProviderCredentialAction(formData);
      if (secretRef.current) secretRef.current.value = "";
      setShowSecret(false);
      if (result.ok) {
        formRef.current?.reset();
        setMessage("OpenAI translation credential saved.");
        router.refresh();
      } else {
        setMessage(result.message);
        if (result.refreshRequired) setRefreshRequired(true);
      }
    } catch {
      if (secretRef.current) secretRef.current.value = "";
      setShowSecret(false);
      setMessage("Translation configuration update could not be completed.");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  const locked = refreshRequired;

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      aria-busy={pending}
      className="space-y-4"
    >
      {mode === "replace" ? (
        <input
          type="hidden"
          name="expectedEditVersion"
          value={status.editVersion ?? ""}
        />
      ) : null}
      <label className="block text-sm font-medium text-gray-800">
        OpenAI API credential
        <input
          ref={secretRef}
          className={fieldClass}
          type={showSecret ? "text" : "password"}
          name="secret"
          autoComplete="new-password"
          spellCheck={false}
          required
          maxLength={8192}
          disabled={pending || locked}
        />
      </label>
      <div className="-mt-2 flex flex-wrap items-center gap-3 text-sm">
        <button
          type="button"
          className="font-medium text-[var(--brand-700)] underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          aria-pressed={showSecret}
          onClick={() => setShowSecret((visible) => !visible)}
          disabled={pending || locked}
        >
          {showSecret ? "Hide entered credential" : "Show entered credential"}
        </button>
        <span className="text-xs text-gray-500">
          This only reveals the value typed in this browser. Saved credentials
          cannot be viewed from Admin.
        </span>
      </div>
      <label className="block text-sm font-medium text-gray-800">
        Audit reason
        <textarea
          className={fieldClass}
          name="reason"
          rows={3}
          maxLength={1000}
          required
          disabled={pending || locked}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || locked}
          aria-busy={pending}
          className="rounded-md bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending
            ? mode === "set"
              ? "Setting credential…"
              : "Replacing credential…"
            : mode === "set"
              ? "Set credential"
              : "Replace credential"}
        </button>
        {locked ? (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Refresh status
          </button>
        ) : null}
      </div>
      <p role="status" aria-live="polite" className="min-h-5 text-sm text-gray-700">
        {pending ? "Saving OpenAI translation credential…" : message}
      </p>
    </form>
  );
}

function RemoveTranslationCredentialForm({
  status,
}: {
  status: TranslationProviderCredentialStatus;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshRequired, setRefreshRequired] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || refreshRequired) return;
    const formData = new FormData(event.currentTarget);
    formData.set("operationId", crypto.randomUUID());
    formData.set("expectedEditVersion", String(status.editVersion ?? ""));
    formData.set("confirmation", "confirmed");
    inFlight.current = true;
    flushSync(() => {
      setPending(true);
      setMessage(null);
    });
    try {
      const result = await removeTranslationProviderCredentialAction(formData);
      if (result.ok) {
        formRef.current?.reset();
        setMessage("OpenAI translation credential removed.");
        router.refresh();
      } else {
        setMessage(result.message);
        if (result.refreshRequired) setRefreshRequired(true);
      }
    } catch {
      setMessage("Translation configuration update could not be completed.");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      aria-busy={pending}
      className="space-y-4 border-t border-gray-200 pt-5"
    >
      <label className="block text-sm font-medium text-gray-800">
        Removal reason
        <textarea
          className={fieldClass}
          name="reason"
          rows={3}
          maxLength={1000}
          required
          disabled={pending || refreshRequired}
        />
      </label>
      <label className="flex items-start gap-2 text-sm text-gray-700">
        <input
          className="mt-1"
          type="checkbox"
          required
          disabled={pending || refreshRequired}
        />
        <span>
          Confirm removal of the OpenAI translation credential. This is only
          available before any translation model profile references it.
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || refreshRequired}
          aria-busy={pending}
          className="rounded-md border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Removing credential…" : "Remove credential"}
        </button>
        {refreshRequired ? (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Refresh status
          </button>
        ) : null}
      </div>
      <p role="status" aria-live="polite" className="min-h-5 text-sm text-gray-700">
        {pending ? "Removing OpenAI translation credential…" : message}
      </p>
    </form>
  );
}

export function TranslationProviderCredential({
  status,
  canMutate,
}: {
  status: TranslationProviderCredentialStatus;
  canMutate: boolean;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-950">
            OpenAI provider credential
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            Used by enabled translation model profiles in this Commerce
            environment. The saved secret is encrypted and is never returned to
            the browser.
          </p>
        </div>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
          {status.configured ? "Configured" : "Not configured"}
        </span>
      </div>

      <dl className="mt-5 grid gap-4 border-y border-gray-200 py-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Environment
          </dt>
          <dd className="mt-1 font-medium text-gray-900">{status.environment}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Provider
          </dt>
          <dd className="mt-1 font-medium text-gray-900">OpenAI</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Model profiles
          </dt>
          <dd className="mt-1 font-medium text-gray-900">{status.modelCount}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Edit version
          </dt>
          <dd className="mt-1 font-medium text-gray-900">
            {status.editVersion ?? "—"}
          </dd>
        </div>
        {status.configured ? (
          <>
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Updated
              </dt>
              <dd className="mt-1 text-gray-900">{status.updatedAt}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Updated by
              </dt>
              <dd className="mt-1 break-all font-mono text-xs text-gray-900">
                {status.updatedByAdminId}
              </dd>
            </div>
          </>
        ) : null}
      </dl>

      {!canMutate ? (
        <p className="mt-5 text-sm text-gray-600">
          SUPER_ADMIN access is required to change translation credentials.
        </p>
      ) : !status.configured ? (
        <div className="mt-5 max-w-2xl">
          <TranslationCredentialForm mode="set" status={status} />
        </div>
      ) : (
        <div className="mt-5 max-w-2xl space-y-6">
          <TranslationCredentialForm
            key={`replace-${status.editVersion}`}
            mode="replace"
            status={status}
          />
          {status.modelCount === 0 ? (
            <RemoveTranslationCredentialForm status={status} />
          ) : (
            <p className="border-t border-gray-200 pt-5 text-sm text-gray-600">
              The provider credential cannot be removed while translation model
              profiles reference it. Disable model profiles when necessary and
              replace or revoke the provider credential instead.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
