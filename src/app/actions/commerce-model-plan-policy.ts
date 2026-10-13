"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdminMutation } from "@/lib/auth/platform-admin";
import { ensureDevelopmentPlatformAdmin } from "@/lib/auth/development-platform-admin";
import { resolveAdminCommerceEnvironment } from "@/lib/admin/commerce-environment";
import { canEditLiveCommerceBudget, CommerceBudgetValidationError, type CommerceBudgetFieldErrors } from "@/lib/admin/commerce-model-policy-fields";
import { parseLivePlanBudgetForm } from "@/lib/admin/commerce-model-plan-policy-fields";
import { mutateLivePlanPolicy } from "@/lib/admin/commerce-model-plan-policy";
import { CommerceModelPolicyConflict } from "@/lib/admin/commerce-model-platform-policy";
import { prisma } from "@/lib/prisma";

export type SaveLivePlanBudgetResult =
  | { ok: true }
  | { ok: false; message: string; fieldErrors?: CommerceBudgetFieldErrors; conflict?: boolean };

function code(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
}

export async function saveLivePlanBudgetAction(form: FormData): Promise<SaveLivePlanBudgetResult> {
  const principal = await requirePlatformAdminMutation();
  if (!canEditLiveCommerceBudget(principal.role)) {
    return { ok: false, message: "SUPER_ADMIN permission is required to change Price Plan execution policies." };
  }
  try {
    const input = parseLivePlanBudgetForm(form);
    await prisma.$transaction(async (tx) => {
      await ensureDevelopmentPlatformAdmin(tx, principal);
      await mutateLivePlanPolicy(tx, input, resolveAdminCommerceEnvironment(), principal.id);
    }, { isolationLevel: "Serializable" });
    revalidatePath("/billing");
    return { ok: true };
  } catch (error) {
    if (error instanceof CommerceBudgetValidationError) return { ok: false, message: error.message, fieldErrors: error.fieldErrors };
    if (error instanceof CommerceModelPolicyConflict || ["P2034", "P2002"].includes(String(code(error)))) {
      return { ok: false, message: "Price Plan policy changed. Reload current values before retrying.", conflict: true };
    }
    if (error instanceof Error && [
      "No CommerceAgent Price Plan settings have changed.", "Price Plan no longer exists.",
      "CommerceAgent Price Plan policy schema is unsupported.", "CommerceAgent Price Plan policy contains unsupported fields.",
      "CommerceAgent Price Plan policy contains invalid values.",
    ].includes(error.message)) return { ok: false, message: error.message };
    return { ok: false, message: "Could not save the Price Plan policy. Reload before retrying." };
  }
}
