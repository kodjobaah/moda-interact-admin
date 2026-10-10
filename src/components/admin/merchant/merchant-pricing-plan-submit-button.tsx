"use client";

import { useFormStatus } from "react-dom";

type MerchantPricingPlanSubmitButtonProps = {
  disabled: boolean;
  isUpdate: boolean;
  draftMode?: boolean;
};

export function MerchantPricingPlanSubmitButton({
  disabled,
  isUpdate,
  draftMode = false,
}: MerchantPricingPlanSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending
        ? draftMode
          ? "Saving draft…"
          : isUpdate
            ? "Updating…"
            : "Creating…"
        : draftMode
          ? isUpdate
            ? "Save draft changes"
            : "Save draft"
          : isUpdate
            ? "Update plan"
            : "Create plan"}
    </button>
  );
}
