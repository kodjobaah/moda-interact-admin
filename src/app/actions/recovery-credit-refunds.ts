"use server";

import { revalidatePath } from "next/cache";
import { RecoveryCreditProviderActionKind } from "@prisma/client";
import { recordRecoveryCreditProviderEvidence } from "@/lib/admin/recovery-credit-refund-settlement";

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