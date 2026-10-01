"use server";

import { revalidatePath } from "next/cache";
import { ensureDevelopmentPlatformAdmin } from "@/lib/auth/development-platform-admin";
import { requirePlatformAdminMutation } from "@/lib/auth/platform-admin";
import {
  mutateModelCatalogue,
  type ModelCatalogueMutation,
} from "@/lib/admin/model-catalogue";
import { parseModelCatalogueForm } from "@/lib/admin/model-catalogue-validation";
import { prisma } from "@/lib/prisma";

const publicMutationErrors = new Set([
  "SUPER_ADMIN access is required.",
  "Model Availability not found.",
  "Model catalogue entry not found.",
  "Model catalogue entry changed. Refresh and try again.",
  "A model with this provider and model ID already exists in the selected availability.",
  "Model catalogue entry is already enabled.",
  "Model catalogue entry is already disabled.",
  "Model configuration must be valid JSON.",
  "Model configuration is invalid.",
]);

function publicErrorMessage(cause: unknown): string | undefined {
  if (cause instanceof Error && publicMutationErrors.has(cause.message)) {
    return cause.message;
  }
  if (
    cause instanceof Error &&
    (cause.message === "Model catalogue input contains unsupported fields." ||
      cause.message === "Unsupported Model Catalogue action." ||
      cause.message === "enabled must be true or false." ||
      /^(availabilityId|provider|providerModelId|displayName|description|configuration|id|expectedEditVersion) (is invalid|must be)/.test(
        cause.message,
      ))
  ) {
    return "Model catalogue input is invalid.";
  }
  return undefined;
}

function text(formData: FormData, name: string, maximum: number): string {
  const values = formData.getAll(name);
  if (values.length !== 1 || typeof values[0] !== "string") {
    throw new Error(`${name} is invalid.`);
  }
  const value = values[0].trim();
  if (!value || value.length > maximum) {
    throw new Error(`${name} is invalid.`);
  }
  return value;
}

function positiveInteger(formData: FormData, name: string): number {
  const value = text(formData, name, 16);
  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} must be a positive integer.`);
  }
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return result;
}

function mutationFromForm(formData: FormData): ModelCatalogueMutation {
  switch (formData.get("intent")) {
    case "create":
      return {
        kind: "create",
        input: parseModelCatalogueForm(formData, { mode: "create" }),
      };
    case "update":
      return {
        kind: "update",
        formData,
        id: text(formData, "id", 128),
        expectedEditVersion: positiveInteger(formData, "expectedEditVersion"),
      };
    case "set-enabled": {
      const enabled = formData.getAll("enabled");
      if (
        enabled.length !== 1 ||
        (enabled[0] !== "true" && enabled[0] !== "false")
      ) {
        throw new Error("enabled must be true or false.");
      }
      return {
        kind: "set-enabled",
        id: text(formData, "id", 128),
        expectedEditVersion: positiveInteger(formData, "expectedEditVersion"),
        enabled: enabled[0] === "true",
      };
    }
    default:
      throw new Error("Unsupported Model Catalogue action.");
  }
}

export async function mutateModelCatalogueAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const principal = await requirePlatformAdminMutation();
  if (principal.role !== "SUPER_ADMIN") {
    throw new Error("SUPER_ADMIN access is required.");
  }

  try {
    const mutation = mutationFromForm(formData);
    await prisma.$transaction(
      async (transaction) => {
        await ensureDevelopmentPlatformAdmin(transaction, principal);
        await mutateModelCatalogue(transaction, mutation, principal.id);
      },
      { isolationLevel: "Serializable" },
    );

    revalidatePath("/commerce-models/catalogue");
    revalidatePath("/commerce-models/availability");
    return { ok: true };
  } catch (cause) {
    const message = publicErrorMessage(cause);
    if (message) return { ok: false, message };
    throw cause;
  }
}
