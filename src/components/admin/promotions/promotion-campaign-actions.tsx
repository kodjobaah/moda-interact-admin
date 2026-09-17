"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { mutatePromotionCampaignAction } from "@/app/actions/promotions";
import type { PromotionCampaignSummary } from "@/lib/admin/promotions/campaigns";
import { withParamUpdates } from "@/lib/admin/query";

type Tone = "neutral" | "positive" | "danger";

function LifecycleSubmitButton({
  label,
  pendingLabel,
  tone = "neutral",
}: {
  label: string;
  pendingLabel: string;
  tone?: Tone;
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

  const toneClass =
    tone === "positive"
      ? "border-green-700 text-green-800 hover:bg-green-50"
      : tone === "danger"
        ? "border-red-300 text-red-800 hover:bg-red-50"
        : "border-gray-300 text-gray-700 hover:bg-gray-50";

  return (
    <button
      ref={buttonRef}
      type="submit"
      disabled={pending}
      className={`rounded-md border px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${toneClass}`}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

function LifecycleMutationForm({
  campaignId,
  intent,
  label,
  pendingLabel,
  tone,
}: {
  campaignId: string;
  intent: "activate" | "close";
  label: string;
  pendingLabel: string;
  tone?: Tone;
}) {
  return (
    <form
      action={mutatePromotionCampaignAction}
      onSubmitCapture={(event) => {
        const form = event.currentTarget;
        if (form.dataset.submitting === "true") {
          event.preventDefault();
          return;
        }
        form.dataset.submitting = "true";
      }}
    >
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="id" value={campaignId} />
      <LifecycleSubmitButton
        label={label}
        pendingLabel={pendingLabel}
        tone={tone}
      />
    </form>
  );
}

export function PromotionCampaignActions({
  campaign,
  params,
}: {
  campaign: PromotionCampaignSummary;
  params: Record<string, string>;
}) {
  const editHref = withParamUpdates("/promotions", params, {
    drawer: "edit",
    campaignId: campaign.id,
  });
  const reactivateHref = withParamUpdates("/promotions", params, {
    drawer: "reactivate",
    campaignId: campaign.id,
  });

  const canActivate =
    campaign.status === "DRAFT" && campaign.translationCount === 20;
  const canEdit = campaign.status === "DRAFT";
  const canReactivate =
    campaign.status === "CLOSED" || campaign.state === "EXPIRED";
  const canDeactivate =
    campaign.status === "ACTIVE" && campaign.state !== "EXPIRED";
  const canCloseDraft = campaign.status === "DRAFT";

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <Link
        href={`/promotions/${encodeURIComponent(campaign.id)}`}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
      >
        View usage
      </Link>

      {canEdit ? (
        <Link
          href={editHref}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
        >
          Edit campaign
        </Link>
      ) : null}

      {canActivate ? (
        <LifecycleMutationForm
          campaignId={campaign.id}
          intent="activate"
          label="Activate"
          pendingLabel="Activating…"
          tone="positive"
        />
      ) : null}

      {canDeactivate ? (
        <LifecycleMutationForm
          campaignId={campaign.id}
          intent="close"
          label="Deactivate"
          pendingLabel="Deactivating…"
        />
      ) : null}

      {canCloseDraft ? (
        <LifecycleMutationForm
          campaignId={campaign.id}
          intent="close"
          label="Close draft"
          pendingLabel="Closing…"
          tone="danger"
        />
      ) : null}

      {canReactivate ? (
        <Link
          href={reactivateHref}
          className="rounded-md border border-blue-300 px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-50"
        >
          Reactivate
        </Link>
      ) : null}
    </div>
  );
}
