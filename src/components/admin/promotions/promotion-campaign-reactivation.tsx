"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import {
  reactivatePromotionCampaignAction,
  type PromotionCampaignReactivationActionState,
} from "@/app/actions/promotions";
import type { PromotionCampaignRow } from "@/lib/admin/promotions/campaigns";

const inputClass =
  "w-full rounded-md border border-gray-300 bg-white p-2 text-sm outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-200)]";

function toLocalDateTimeInput(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function ReactivationSubmitButton({
  requiresNewExpiry,
}: {
  requiresNewExpiry: boolean;
}) {
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
        ? "Reactivating…"
        : requiresNewExpiry
          ? "Save and reactivate"
          : "Reactivate"}
    </button>
  );
}

export function PromotionCampaignReactivationForm({
  campaign,
  returnTo,
  requiresNewExpiry,
}: {
  campaign: PromotionCampaignRow;
  returnTo: string;
  requiresNewExpiry: boolean;
}) {
  const router = useRouter();
  const [minimumExpiry, setMinimumExpiry] = useState("");
  const [actionState, formAction] = useActionState<
    PromotionCampaignReactivationActionState,
    FormData
  >(reactivatePromotionCampaignAction, null);
  const target =
    campaign.scope === "GLOBAL"
      ? "All eligible merchants"
      : (campaign.targetPlanName ?? campaign.targetShopDomain ?? "Unavailable");

  useEffect(() => {
    setMinimumExpiry(toLocalDateTimeInput(new Date(Date.now() + 60_000)));
  }, []);

  useEffect(() => {
    if (actionState?.ok) {
      router.replace(returnTo);
      router.refresh();
    }
  }, [actionState, returnTo, router]);

  return (
    <form
      action={formAction}
      className="space-y-5"
      onSubmitCapture={(event) => {
        const form = event.currentTarget;
        if (form.dataset.submitting === "true") {
          event.preventDefault();
          return;
        }
        form.dataset.submitting = "true";
      }}
    >
      <input type="hidden" name="intent" value="reopen" />
      <input type="hidden" name="id" value={campaign.id} />

      <section className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h3 className="font-semibold text-gray-950">{campaign.name}</h3>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-gray-500">Lifecycle</dt>
            <dd className="font-medium text-gray-800">
              {campaign.state} · {campaign.status}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Recovery credits</dt>
            <dd className="font-medium text-gray-800">{campaign.quantity}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Scope</dt>
            <dd className="font-medium text-gray-800">{campaign.scope}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Target</dt>
            <dd className="font-medium text-gray-800">{target}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Starts</dt>
            <dd className="font-medium text-gray-800">
              {campaign.startsAt.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Current expiry</dt>
            <dd className="font-medium text-gray-800">
              {campaign.expiresAt.toLocaleString()}
            </dd>
          </div>
        </dl>
      </section>

      <div className="rounded-md border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
        {requiresNewExpiry
          ? "This campaign has already expired. Choose a new future expiry before reactivating it. Commercial terms and translations remain unchanged."
          : "This campaign was deactivated before its expiry. Reactivating it will keep the current expiry unless you optionally choose a different future expiry below. Commercial terms and translations remain unchanged."}
      </div>

      <label className="block text-sm font-medium text-gray-700">
        {requiresNewExpiry ? "New expiry" : "New expiry (optional)"}
        <input
          className={`${inputClass} mt-1`}
          name="expiresAt"
          type="datetime-local"
          min={minimumExpiry || undefined}
          required={requiresNewExpiry}
        />
        <span className="mt-1 block text-xs font-normal text-gray-500">
          {requiresNewExpiry
            ? "Choose a future expiry after the campaign start."
            : "Leave this blank to keep the current expiry."}
        </span>
      </label>

      {actionState && !actionState.ok ? (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {actionState.message}
        </div>
      ) : null}

      <div className="flex justify-end border-t border-gray-100 pt-4">
        <ReactivationSubmitButton requiresNewExpiry={requiresNewExpiry} />
      </div>
    </form>
  );
}
