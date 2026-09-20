"use client";

import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { requestTenantShopifyDiscountSyncAction } from "@/app/actions/tenant";

function SubmitButton({ retry }: { retry: boolean }) {
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
      className="rounded-md bg-[var(--brand-700)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Queueing…" : retry ? "Retry sync" : "Sync now"}
    </button>
  );
}

export function TenantDiscountCatalogueSyncForm({
  shopId,
  returnTo,
  retry,
}: {
  shopId: string;
  returnTo: string;
  retry: boolean;
}) {
  return (
    <form
      action={requestTenantShopifyDiscountSyncAction}
      onSubmitCapture={(event) => {
        const form = event.currentTarget;
        if (form.dataset.submitting === "true") {
          event.preventDefault();
          return;
        }
        form.dataset.submitting = "true";
      }}
    >
      <input type="hidden" name="shopId" value={shopId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <SubmitButton retry={retry} />
    </form>
  );
}
