"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import {
  retryBillingEventAction,
  type RetryBillingEventActionState,
} from "@/app/actions/billing-events";
import { adminI18n } from "@/i18n";

function actionMessage(state: Exclude<RetryBillingEventActionState, null>): string {
  const keys = {
    QUEUED: "billing.retryEventResult.QUEUED",
    ALREADY_DUE: "billing.retryEventResult.ALREADY_DUE",
    STALE: "billing.retryEventResult.STALE",
    NOT_ELIGIBLE: "billing.retryEventResult.NOT_ELIGIBLE",
    MISSING: "billing.retryEventResult.MISSING",
    ERROR: "billing.retryEventResult.ERROR",
  } as const;
  return adminI18n.t(keys[state.code]);
}

function RetrySubmitButton() {
  const { pending } = useFormStatus();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wasPendingRef = useRef(false);

  useEffect(() => {
    if (wasPendingRef.current && !pending) {
      const form = buttonRef.current?.form;
      if (form) delete form.dataset.submitting;
    }
    wasPendingRef.current = pending;
  }, [pending]);

  return (
    <button
      ref={buttonRef}
      type="submit"
      disabled={pending}
      className="rounded-md bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending
        ? adminI18n.t("billing.retryEventPending")
        : adminI18n.t("billing.retryEvent")}
    </button>
  );
}

export function BillingEventRetryControl({
  eventId,
  state,
  reportAttemptCount,
  nextReportAtIso,
}: {
  eventId: string;
  state: string;
  reportAttemptCount: number;
  nextReportAtIso: string | null;
}) {
  const router = useRouter();
  const [actionState, formAction] = useActionState<
    RetryBillingEventActionState,
    FormData
  >(retryBillingEventAction, null);

  useEffect(() => {
    if (actionState?.ok) router.refresh();
  }, [actionState, router]);

  return (
    <form
      action={formAction}
      className="mt-6 space-y-4 rounded-lg border border-amber-200 bg-amber-50 p-4"
      onSubmitCapture={(event) => {
        const form = event.currentTarget;
        if (form.dataset.submitting === "true") {
          event.preventDefault();
          return;
        }
        form.dataset.submitting = "true";
      }}
    >
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="expectedState" value={state} />
      <input
        type="hidden"
        name="expectedReportAttemptCount"
        value={String(reportAttemptCount)}
      />
      <input
        type="hidden"
        name="expectedNextReportAt"
        value={nextReportAtIso ?? ""}
      />

      <div>
        <h3 className="text-sm font-semibold text-amber-950">
          {adminI18n.t("billing.retryEventTitle")}
        </h3>
        <p className="mt-1 text-sm text-amber-900">
          {adminI18n.t("billing.retryEventHelp")}
        </p>
      </div>

      <label className="block text-sm font-medium text-amber-950">
        {adminI18n.t("billing.retryEventReason")}
        <textarea
          name="reason"
          required
          maxLength={1000}
          rows={3}
          className="mt-1 w-full rounded-md border border-amber-300 bg-white p-2 text-sm text-gray-900 outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-200)]"
        />
      </label>

      {actionState ? (
        <div
          role={actionState.ok ? "status" : "alert"}
          className={
            actionState.ok
              ? "rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800"
              : "rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          }
        >
          {actionMessage(actionState)}
        </div>
      ) : null}

      <div className="flex justify-end">
        <RetrySubmitButton />
      </div>
    </form>
  );
}
