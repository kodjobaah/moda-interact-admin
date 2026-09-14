"use server";

import { revalidatePath } from "next/cache";
import { RecoveryCreditProviderActionKind } from "@prisma/client";
import {
  lockRecoveryCreditRefund,
  recordRecoveryCreditProviderEvidence,
  rejectRecoveryCreditRefund,
} from "@/lib/admin/recovery-credit-refund-settlement";

export async function lockRecoveryCreditRefundAction(refundId: string, reason: string) {
  const result = await lockRecoveryCreditRefund(refundId, reason);
  revalidatePath("/billing");
  return result;
}

export async function rejectRecoveryCreditRefundAction(refundId: string, reason: string) {
  const result = await rejectRecoveryCreditRefund(refundId, reason);
  revalidatePath("/billing");
  return result;
}

export async function recordRecoveryCreditProviderEvidenceAction(input: {
  refundId: string;
  actionKind: RecoveryCreditProviderActionKind;
  providerReference: string;
  providerAmount: string;
  providerCurrency: string;
  confirmed: boolean;
}) {
  const result = await recordRecoveryCreditProviderEvidence(input);
  revalidatePath("/billing");
  return result;
}