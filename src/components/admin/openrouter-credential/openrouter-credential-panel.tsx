"use client";

import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { removeOpenRouterCredentialAction } from "@/app/actions/openrouter-credential";
import type { OpenRouterCredentialStatus } from "@/lib/admin/openrouter-credential";
import { OpenRouterCredentialForm } from "./openrouter-credential-form";
import { OpenRouterCredentialSubmitButton } from "./openrouter-credential-submit-button";

const fieldClass =
  "mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-200)]";

export function OpenRouterCredentialPanel({
  status,
  canMutate,
}: {
  status: OpenRouterCredentialStatus;
  canMutate: boolean;
}) {
  const router = useRouter();
  const removeForm = useRef<HTMLFormElement>(null);
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [conflictVersion, setConflictVersion] = useState<number | null>(null);

  async function remove(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || conflictVersion === status.editVersion) return;
    inFlight.current = true;
    flushSync(() => {
      setPending(true);
      setMessage(null);
    });
    const formData = new FormData(event.currentTarget);
    formData.set("operationId", crypto.randomUUID());
    formData.set("expectedEditVersion", String(status.editVersion));
    formData.set("confirmation", "confirmed");
    try {
      const result = await removeOpenRouterCredentialAction(formData);
      if (result.ok) {
        removeForm.current?.reset();
        setMessage("OpenRouter credential removed.");
        router.refresh();
      } else {
        setMessage(result.message);
        if (result.refreshRequired) setConflictVersion(status.editVersion);
      }
    } catch {
      setMessage("OpenRouter credential update could not be completed.");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  const locked =
    conflictVersion !== null && conflictVersion === status.editVersion;

  return (
    <section className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--brand-900)]">
          OpenRouter credential
        </h1>
      </div>
      <dl className="grid gap-x-8 gap-y-4 border-y border-gray-200 bg-white py-5 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold text-gray-500">Environment</dt>
          <dd className="mt-1 font-medium text-gray-900">
            {status.environment}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-gray-500">Status</dt>
          <dd className="mt-1 font-medium text-gray-900">
            {status.configured ? "Configured" : "Not configured"}
          </dd>
        </div>
        {status.configured ? (
          <>
            <div>
              <dt className="text-xs font-semibold text-gray-500">
                Edit version
              </dt>
              <dd className="mt-1 text-gray-900">{status.editVersion}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-gray-500">Updated</dt>
              <dd className="mt-1 text-gray-900">{status.updatedAt}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold text-gray-500">
                Updated by
              </dt>
              <dd className="mt-1 break-all font-mono text-gray-900">
                {status.updatedByAdminId}
              </dd>
            </div>
          </>
        ) : null}
      </dl>

      {canMutate && !status.configured ? (
        <div className="mt-6">
          <OpenRouterCredentialForm mode="set" editVersion={null} />
        </div>
      ) : null}
      {canMutate && status.configured ? (
        <div className="mt-6 space-y-8">
          <OpenRouterCredentialForm
            key={`replace-${status.editVersion}`}
            mode="replace"
            editVersion={status.editVersion}
          />
          <form
            ref={removeForm}
            onSubmit={remove}
            aria-busy={pending}
            className="max-w-2xl space-y-4 border-t border-gray-200 pt-6"
          >
            <label className="block text-sm font-medium text-gray-800">
              Removal reason
              <textarea
                className={fieldClass}
                name="reason"
                maxLength={1000}
                rows={3}
                disabled={pending || locked}
                required
              />
            </label>
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input
                className="mt-1"
                type="checkbox"
                name="confirmation"
                value="confirmed"
                disabled={pending || locked}
                required
              />
              <span>
                Confirm removal of the configured OpenRouter credential.
              </span>
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <OpenRouterCredentialSubmitButton
                disabled={pending || locked}
                pending={pending}
                pendingLabel="Removing credential…"
              >
                Remove credential
              </OpenRouterCredentialSubmitButton>
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
            <p
              role="status"
              aria-live="polite"
              className="min-h-5 text-sm text-gray-700"
            >
              {pending ? "Removing OpenRouter credential…" : message}
            </p>
          </form>
        </div>
      ) : null}
    </section>
  );
}
