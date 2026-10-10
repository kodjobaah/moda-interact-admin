"use client";

import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { setTranslationModelConfigurationAutomaticDefaultAction } from "@/app/actions/translation-configuration";
import type { TranslationModelConfigurationView } from "@/lib/admin/translation-configuration";

const fieldClass =
  "mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-200)] disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500";

export function TranslationModelAutomaticDefaultForm({
  model,
}: {
  model: TranslationModelConfigurationView;
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
    formData.set("id", model.id);
    formData.set("expectedEditVersion", String(model.editVersion));
    inFlight.current = true;
    flushSync(() => {
      setPending(true);
      setMessage(null);
    });
    try {
      const result =
        await setTranslationModelConfigurationAutomaticDefaultAction(formData);
      if (result.ok) {
        formRef.current?.reset();
        setMessage("Automatic translation default updated.");
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
      className="space-y-3"
    >
      <label className="block text-sm font-medium text-gray-800">
        Automatic default reason
        <textarea
          className={fieldClass}
          name="reason"
          rows={2}
          maxLength={1000}
          required
          disabled={pending || refreshRequired}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || refreshRequired}
          aria-busy={pending}
          className="rounded-md bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Setting automatic default…" : "Set as automatic default"}
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
        {pending ? "Updating the automatic translation default…" : message}
      </p>
    </form>
  );
}
