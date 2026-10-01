"use server";

import { revalidatePath } from "next/cache";
import { ensureDevelopmentPlatformAdmin } from "@/lib/auth/development-platform-admin";
import { requirePlatformAdminMutation } from "@/lib/auth/platform-admin";
import {
  mutateModelAvailability,
  type ModelAvailabilityMutation,
} from "@/lib/admin/model-availability";
import {
  parseCreateShopModelAvailabilityForm,
  parseSetModelAvailabilityEnabledForm,
} from "@/lib/admin/model-availability-validation";
import { prisma } from "@/lib/prisma";

function databaseCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
}

function mutationFromForm(formData: FormData): ModelAvailabilityMutation {
  switch (formData.get("intent")) {
    case "create-shop":
      return {
        kind: "create-shop",
        input: parseCreateShopModelAvailabilityForm(formData),
      };
    case "set-enabled":
      return {
        kind: "set-enabled",
        input: parseSetModelAvailabilityEnabledForm(formData),
      };
    default:
      throw new Error("Unsupported Model Availability action.");
  }
}

export async function mutateModelAvailabilityAction(
  formData: FormData,
): Promise<void> {
  const principal = await requirePlatformAdminMutation();
  if (principal.role !== "SUPER_ADMIN") {
    throw new Error("SUPER_ADMIN access is required.");
  }
  const mutation = mutationFromForm(formData);

  try {
    await prisma.$transaction(
      async (transaction) => {
        await ensureDevelopmentPlatformAdmin(transaction, principal);
        await mutateModelAvailability(transaction, mutation, principal.id);
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    if (databaseCode(error) === "P2002") {
      throw new Error("Model Availability already exists for this Shop.");
    }
    if (databaseCode(error) === "P2034") {
      throw new Error("Model Availability changed; reload and retry.");
    }
    throw error;
  }

  revalidatePath("/commerce-models/availability");
}
