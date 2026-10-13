"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdminMutation } from "@/lib/auth/platform-admin";
import { ensureDevelopmentPlatformAdmin } from "@/lib/auth/development-platform-admin";
import { resolveAdminCommerceEnvironment } from "@/lib/admin/commerce-environment";
import {
  CommerceBudgetValidationError,
  parseLivePlatformBudgetForm,
  canEditLiveCommerceBudget,
  type CommerceBudgetFieldErrors,
} from "@/lib/admin/commerce-model-policy-fields";
import { CommerceModelPolicyConflict, updateLivePlatformPolicy } from "@/lib/admin/commerce-model-platform-policy";
import { prisma } from "@/lib/prisma";

export type SaveLivePlatformBudgetResult =
  | { ok: true }
  | { ok: false; message: string; fieldErrors?: CommerceBudgetFieldErrors; conflict?: boolean };

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code : undefined;
}

export async function saveLivePlatformBudgetAction(form: FormData): Promise<SaveLivePlatformBudgetResult> {
  const principal = await requirePlatformAdminMutation();
  if (!canEditLiveCommerceBudget(principal.role)) {
    return { ok: false, message: "SUPER_ADMIN permission is required to change execution policies." };
  }
  try {
    const input = parseLivePlatformBudgetForm(form);
    const environment = resolveAdminCommerceEnvironment();
    await prisma.$transaction(async (transaction) => {
      await ensureDevelopmentPlatformAdmin(transaction, principal);
      await updateLivePlatformPolicy(transaction, input, environment, principal.id);
    }, { isolationLevel: "Serializable" });
    revalidatePath("/system-controls/platform-policy");
    return { ok: true };
  } catch (error) {
    if (error instanceof CommerceBudgetValidationError) {
      return { ok: false, message: error.message, fieldErrors: error.fieldErrors };
    }
    if (error instanceof CommerceModelPolicyConflict || errorCode(error) === "P2034") {
      return { ok: false, message: "CommerceAgent policy changed. Reload to review current values before saving.", conflict: true };
    }
    if (error instanceof Error && [
      "No CommerceAgent policy values have changed.",
      "Required LIVE Platform policy is unavailable. Verify the ARCH-038 migration.",
      "CommerceAgent policy contains unsupported budget fields.",
      "CommerceAgent policy contains invalid budget values.",
      "CommerceAgent policy schema is unsupported. Contact a platform administrator.",
    ].includes(error.message)) {
      return { ok: false, message: error.message };
    }
    return { ok: false, message: "Could not save the CommerceAgent policy. Reload before retrying." };
  }
}
