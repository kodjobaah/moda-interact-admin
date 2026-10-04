"use client";

import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import {
  replaceOpenRouterCredentialAction,
  setOpenRouterCredentialAction,
} from "@/app/actions/openrouter-credential";
import { OpenRouterCredentialSubmitButton } from "./openrouter-credential-submit-button";

const fieldClass =
  "mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-200)]";

export function OpenRouterCredentialForm({
  mode,
  editVersion,
}: {
  mode: "set" | "replace";
  editVersion: number | null;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const secretRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshRequired, setRefreshRequired] = useState(false);

  function clearSecret() {
    if (secretRef.current) secretRef.current.value = "";
    setShowSecret(false);
  }

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
          ? await setOpenRouterCredentialAction(formData)
          : await replaceOpenRouterCredentialAction(formData);
      clearSecret();
      if (result.ok) {
        formRef.current?.reset();
        setMessage("OpenRouter credential saved.");
        router.refresh();
      } else {
        setMessage(result.message);
        if (result.refreshRequired) setRefreshRequired(true);
      }
    } catch {
      clearSecret();
      setMessage("OpenRouter credential update could not be completed.");
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
      className="max-w-2xl space-y-4"
    >
      {mode === "replace" ? (
        <input
          type="hidden"
          name="expectedEditVersion"
          value={editVersion ?? ""}
        />
      ) : null}
      <label className="block text-sm font-medium text-gray-800">
        Credential
        <input
          ref={secretRef}
          className={fieldClass}
          type={showSecret ? "text" : "password"}
          name="secret"
          autoComplete="new-password"
          spellCheck={false}
          disabled={pending || locked}
          required
          maxLength={8192}
        />
      </label>
      <div className="-mt-2 flex flex-wrap items-center gap-3 text-sm">
        <button
          type="button"
          onClick={() => setShowSecret((visible) => !visible)}
          disabled={pending || locked}
          aria-pressed={showSecret}
          className="font-medium text-[var(--brand-700)] underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
        >
          {showSecret ? "Hide entered credential" : "Show entered credential"}
        </button>
        <span className="text-xs text-gray-500">
          This only shows the value currently typed in this browser. A saved
          credential cannot be viewed from Admin.
        </span>
      </div>
      <label className="block text-sm font-medium text-gray-800">
        Audit reason
        <textarea
          className={fieldClass}
          name="reason"
          maxLength={1000}
          rows={3}
          disabled={pending || locked}
          required
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <OpenRouterCredentialSubmitButton
          disabled={pending || locked}
          pending={pending}
          pendingLabel={
            mode === "set" ? "Setting credential…" : "Replacing credential…"
          }
        >
          {mode === "set" ? "Set credential" : "Replace credential"}
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
        {pending ? "Saving OpenRouter credential…" : message}
      </p>
    </form>
  );
}
