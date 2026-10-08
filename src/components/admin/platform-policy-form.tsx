"use client";

import type { FormEvent, ReactNode } from "react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  mutatePlatformBillingPolicyAction,
  type PlatformBillingPolicyActionResult,
} from "@/app/actions/billing-controls";
import { adminI18n } from "@/i18n";

export function PlatformPolicyForm({ children }: { children: ReactNode }) {
  const router = useRouter();
  const submittingRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] =
    useState<PlatformBillingPolicyActionResult | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;

    submittingRef.current = true;
    setPending(true);
    setResult(null);

    const form = event.currentTarget;
    try {
      const nextResult = await mutatePlatformBillingPolicyAction(
        new FormData(form),
      );
      setResult(nextResult);
      if (nextResult.ok) {
        const reason = form.elements.namedItem("reason");
        if (reason instanceof HTMLTextAreaElement) reason.value = "";
        router.refresh();
      }
    } catch {
      setResult({
        ok: false,
        message: adminI18n.t("billingControls.platformSaveUnexpectedError"),
      });
    } finally {
      submittingRef.current = false;
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset
        disabled={pending}
        className="min-w-0 space-y-4 border-0 p-0 disabled:opacity-75"
      >
        {children}
      </fieldset>

      {result ? (
        <p
          role={result.ok ? "status" : "alert"}
          className={
            result.ok
              ? "rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
              : "rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
          }
        >
          {result.ok
            ? adminI18n.t("billingControls.platformSaveSuccess")
            : result.message}
        </p>
      ) : null}

      <button
        className="rounded-md bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)] disabled:cursor-not-allowed disabled:opacity-50"
        type="submit"
        disabled={pending}
      >
        {pending
          ? adminI18n.t("billingControls.platformSavePending")
          : adminI18n.t("billingControls.savePlatform")}
      </button>
    </form>
  );
}
