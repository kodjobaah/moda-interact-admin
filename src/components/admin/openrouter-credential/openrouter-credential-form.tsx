"use client";

import { useRef, useState } from "react";
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
  const formRef = useRef<HTMLFormElement>(null);
  const secretRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [conflictVersion, setConflictVersion] = useState<number | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || conflictVersion === editVersion) return;
    inFlight.current = true;
    setPending(true);
    setMessage(null);
    const formData = new FormData(event.currentTarget);
    formData.set("operationId", crypto.randomUUID());
    try {
      const result =
        mode === "set"
          ? await setOpenRouterCredentialAction(formData)
          : await replaceOpenRouterCredentialAction(formData);
      if (secretRef.current) secretRef.current.value = "";
      if (result.ok) {
        formRef.current?.reset();
        setMessage("OpenRouter credential saved.");
      } else {
        setMessage(result.message);
        if (result.refreshRequired) setConflictVersion(editVersion);
      }
    } catch {
      if (secretRef.current) secretRef.current.value = "";
      setMessage("OpenRouter credential update could not be completed.");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  const locked = conflictVersion !== null && conflictVersion === editVersion;

  return (
    <form ref={formRef} onSubmit={submit} className="max-w-2xl space-y-4">
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
          type="password"
          name="secret"
          autoComplete="new-password"
          spellCheck={false}
          disabled={pending || locked}
          required
          maxLength={8192}
        />
      </label>
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
      <p aria-live="polite" className="min-h-5 text-sm text-gray-700">
        {message}
      </p>
    </form>
  );
}
