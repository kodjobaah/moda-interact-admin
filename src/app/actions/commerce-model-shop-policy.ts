"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdminMutation } from "@/lib/auth/platform-admin";
import { ensureDevelopmentPlatformAdmin } from "@/lib/auth/development-platform-admin";
import { resolveAdminCommerceEnvironment } from "@/lib/admin/commerce-environment";
import { canEditLiveCommerceBudget, CommerceBudgetValidationError, type CommerceBudgetFieldErrors } from "@/lib/admin/commerce-model-policy-fields";
import { parseLiveShopBudgetForm } from "@/lib/admin/commerce-model-shop-policy-fields";
import { verifyLiveShopPolicyScope } from "@/lib/admin/commerce-model-shop-policy-scope";
import { mutateLiveShopPolicy } from "@/lib/admin/commerce-model-shop-policy";
import { CommerceModelPolicyConflict } from "@/lib/admin/commerce-model-platform-policy";
import { prisma } from "@/lib/prisma";

export type SaveLiveShopBudgetResult =
  | { ok: true }
  | { ok: false; message: string; fieldErrors?: CommerceBudgetFieldErrors; conflict?: boolean };

function prismaCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
}

export async function saveLiveShopBudgetAction(form: FormData): Promise<SaveLiveShopBudgetResult> {
  const principal = await requirePlatformAdminMutation();
  if (!canEditLiveCommerceBudget(principal.role)) {
    return { ok: false, message: "SUPER_ADMIN permission is required to change Merchant execution policies." };
  }
  try {
    const trustedShopId = verifyLiveShopPolicyScope(form.get("shopPolicyScope"), principal.id);
    const input = parseLiveShopBudgetForm(form, trustedShopId);
    await prisma.$transaction(async (tx) => {
      await ensureDevelopmentPlatformAdmin(tx, principal);
      await mutateLiveShopPolicy(tx, input, resolveAdminCommerceEnvironment(), principal.id);
    }, { isolationLevel: "Serializable" });
    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    if (error instanceof CommerceBudgetValidationError) return { ok: false, message: error.message, fieldErrors: error.fieldErrors };
    if (error instanceof CommerceModelPolicyConflict || ["P2034", "P2002"].includes(String(prismaCode(error)))) {
      return { ok: false, message: "Merchant policy changed. Reload current values before retrying.", conflict: true };
    }
    if (error instanceof Error && [
      "No CommerceAgent Merchant settings have changed.", "Merchant no longer exists.",
      "Ambiguous Merchant execution policy.", "Select an existing merchant before changing the CommerceAgent policy.",
      "Merchant scope is invalid. Reload the selected tenant.",
      "Merchant scope is invalid or expired. Reload the selected tenant.",
      "Merchant scope does not match the selected tenant. Reload before saving.",
    ].includes(error.message)) return { ok: false, message: error.message };
    return { ok: false, message: "Could not save the Merchant execution policy. Reload before retrying." };
  }
}
