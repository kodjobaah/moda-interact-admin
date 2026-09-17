"use client";

import { useFormStatus } from "react-dom";

type MerchantPricingPlanSubmitButtonProps = {
  disabled: boolean;
  isUpdate: boolean;
};

export function MerchantPricingPlanSubmitButton({
  disabled,
  isUpdate,
}: MerchantPricingPlanSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending
        ? isUpdate
          ? "Updating…"
          : "Creating…"
        : isUpdate
          ? "Update plan"
          : "Create plan"}
    </button>
  );
}
