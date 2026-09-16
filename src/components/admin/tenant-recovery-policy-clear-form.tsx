"use client";

import { useState } from "react";
import { clearTenantRecoveryPolicyOverrideAction } from "@/app/actions/tenant";

export function TenantRecoveryPolicyClearForm({
  shopId,
  returnTo,
}: {
  shopId: string;
  returnTo: string;
}) {
  const [reason, setReason] = useState("");
  return (
    <form
      action={clearTenantRecoveryPolicyOverrideAction}
      className="flex items-center gap-2"
      onSubmit={(event) => {
        if (!window.confirm("Clear this tenant recovery-policy override?")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="shopId" value={shopId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <input
        className="rounded-md border border-gray-300 p-2 text-xs"
        name="reason"
        minLength={1}
        maxLength={1000}
        placeholder="Clear reason"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        required
      />
      <button type="submit" className="rounded-md border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700">
        Clear override
      </button>
    </form>
  );
}