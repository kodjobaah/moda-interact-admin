"use client";

import { useTransition } from "react";
import { mutateMerchantPricingPlanAction } from "@/app/actions/merchant-pricing-plan";

export function MerchantPricingPlanDeleteButton({
  id,
  displayName,
  disabled,
}: {
  id: string;
  displayName: string;
  disabled: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    const confirmed = window.confirm(
      `Delete "${displayName}"?\n\n` +
        "This permanently deletes this pricing plan and its configuration.\n\n" +
        "This action cannot be undone.",
    );

    if (!confirmed) {
      return;
    }

    const formData = new FormData();
    formData.set("intent", "delete");
    formData.set("id", id);

    startTransition(() => {
      void mutateMerchantPricingPlanAction(formData);
    });
  }

  return (
    <button
      type="button"
      disabled={disabled || pending}
      onClick={handleDelete}
      title={
        disabled
          ? "Deactivate this paid plan before deleting it."
          : `Delete ${displayName}`
      }
      className="rounded-md border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400"
    >
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}