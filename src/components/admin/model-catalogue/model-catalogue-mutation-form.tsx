"use client";

import {
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";

type ModelCatalogueMutationFormProps = {
  action: (
    formData: FormData,
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
  children: ReactNode;
  submitLabel: string;
  pendingLabel?: string;
};

export function ModelCatalogueMutationForm({
  action,
  children,
  submitLabel,
  pendingLabel = "Saving…",
}: ModelCatalogueMutationFormProps) {
  const inFlight = useRef(false);
  const [pending, startTransition] = useTransition();
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    if (inFlight.current) {
      event.preventDefault();
      return;
    }
    inFlight.current = true;
    setLocked(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    event.preventDefault();
    startTransition(async () => {
      try {
        const result = await action(formData);
        if (!result.ok) setError(result.message);
      } catch {
        setError("Could not save the model catalogue entry.");
      } finally {
        inFlight.current = false;
        setLocked(false);
      }
    });
  }

  return (
    <form onSubmit={submit} aria-busy={pending || locked}>
      <fieldset disabled={pending || locked} className="min-w-0 space-y-4">
        {children}
        {error ? (
          <p role="alert" className="text-sm font-medium text-red-700">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          className="rounded-md bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)] disabled:cursor-wait disabled:opacity-60"
        >
          {pending || locked ? pendingLabel : submitLabel}
        </button>
      </fieldset>
    </form>
  );
}
