"use client";

import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import {
  createTranslationModelConfigurationAction,
  setTranslationModelConfigurationEnabledAction,
  updateTranslationModelConfigurationAction,
} from "@/app/actions/translation-configuration";
import type { TranslationModelConfigurationView } from "@/lib/admin/translation-configuration";

const fieldClass =
  "mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-200)] disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500";

function RefreshButton() {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
    >
      Refresh status
    </button>
  );
}

export function TranslationModelConfigurationForm({
  mode,
  model,
}: {
  mode: "create" | "edit";
  model?: TranslationModelConfigurationView;
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
    inFlight.current = true;
    flushSync(() => {
      setPending(true);
      setMessage(null);
    });
    try {
      const result =
        mode === "create"
          ? await createTranslationModelConfigurationAction(formData)
          : await updateTranslationModelConfigurationAction(formData);
      if (result.ok) {
        if (mode === "create") formRef.current?.reset();
        setMessage(
          mode === "create"
            ? "Translation model profile created."
            : "Translation model profile updated.",
        );
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
      className="space-y-4"
    >
      {mode === "edit" && model ? (
        <>
          <input type="hidden" name="id" value={model.id} />
          <input
            type="hidden"
            name="expectedEditVersion"
            value={model.editVersion}
          />
        </>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-gray-800">
          Display name
          <input
            className={fieldClass}
            name="displayName"
            defaultValue={model?.displayName ?? ""}
            maxLength={255}
            required
            disabled={pending || refreshRequired}
            placeholder="High quality translation"
          />
        </label>
        <label className="block text-sm font-medium text-gray-800">
          OpenAI model ID
          <input
            className={fieldClass}
            name="providerModelId"
            defaultValue={model?.providerModelId ?? ""}
            maxLength={255}
            required
            spellCheck={false}
            disabled={pending || refreshRequired}
            placeholder="gpt-4.1-mini"
          />
        </label>
      </div>
      <label className="block text-sm font-medium text-gray-800">
        Audit reason
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
          {pending
            ? mode === "create"
              ? "Creating model…"
              : "Saving model…"
            : mode === "create"
              ? "Create translation model"
              : "Save model"}
        </button>
        {refreshRequired ? <RefreshButton /> : null}
      </div>
      <p role="status" aria-live="polite" className="min-h-5 text-sm text-gray-700">
        {pending ? "Saving translation model configuration…" : message}
      </p>
    </form>
  );
}

export function TranslationModelEnabledForm({
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
    formData.set("enabled", String(!model.enabled));
    inFlight.current = true;
    flushSync(() => {
      setPending(true);
      setMessage(null);
    });
    try {
      const result = await setTranslationModelConfigurationEnabledAction(formData);
      if (result.ok) {
        formRef.current?.reset();
        setMessage(
          model.enabled
            ? "Translation model profile disabled."
            : "Translation model profile enabled.",
        );
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
      className="space-y-3 border-t border-gray-200 pt-4"
    >
      <label className="block text-sm font-medium text-gray-800">
        {model.enabled ? "Disable reason" : "Enable reason"}
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
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending
            ? model.enabled
              ? "Disabling model…"
              : "Enabling model…"
            : model.enabled
              ? "Disable model"
              : "Enable model"}
        </button>
        {refreshRequired ? <RefreshButton /> : null}
      </div>
      <p role="status" aria-live="polite" className="min-h-5 text-sm text-gray-700">
        {pending ? "Updating translation model status…" : message}
      </p>
    </form>
  );
}
