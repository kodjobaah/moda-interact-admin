"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdminMutation } from "@/lib/auth/platform-admin";
import { ensureDevelopmentPlatformAdmin } from "@/lib/auth/development-platform-admin";
import { prisma } from "@/lib/prisma";
import {
  mutateStoreCategoryCatalogue,
  type StoreCategoryMutation,
} from "@/lib/admin/store-categories";
import {
  parseCreatePromptTemplateForm,
  parseCreateStoreCategoryForm,
  parseCreateTaxonomyMappingForm,
  parseRemoveTaxonomyMappingForm,
  parseSelectDefaultTemplateForm,
  parseUpdatePromptTemplateForm,
  parseUpdateStoreCategoryForm,
  parseUpdateTaxonomyMappingForm,
} from "@/lib/admin/store-category-validation";

function databaseCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
}

function uniqueConstraintMessage(error: unknown): string {
  if (typeof error !== "object" || error === null || !("meta" in error)) {
    return "A catalogue identifier is already in use.";
  }
  const meta = error.meta;
  const target =
    typeof meta === "object" && meta !== null && "target" in meta
      ? String(meta.target)
      : "";
  if (target.includes("slug")) return "A category with this slug already exists.";
  if (target.includes("key")) return "A prompt template with this key already exists.";
  if (target.includes("shopifyTaxonomyCategoryId")) {
    return "This Shopify taxonomy category is already mapped.";
  }
  return "A catalogue identifier is already in use.";
}

function mutationFromForm(formData: FormData): StoreCategoryMutation {
  const intent = formData.get("intent");
  switch (intent) {
    case "create-category":
      return { kind: intent, input: parseCreateStoreCategoryForm(formData) };
    case "update-category":
      return { kind: intent, input: parseUpdateStoreCategoryForm(formData) };
    case "create-template":
      return { kind: intent, input: parseCreatePromptTemplateForm(formData) };
    case "update-template":
      return { kind: intent, input: parseUpdatePromptTemplateForm(formData) };
    case "select-default-template":
      return { kind: intent, input: parseSelectDefaultTemplateForm(formData) };
    case "create-taxonomy-mapping":
      return { kind: intent, input: parseCreateTaxonomyMappingForm(formData) };
    case "update-taxonomy-mapping":
      return { kind: intent, input: parseUpdateTaxonomyMappingForm(formData) };
    case "remove-taxonomy-mapping":
      return { kind: intent, input: parseRemoveTaxonomyMappingForm(formData) };
    default:
      throw new Error("Unsupported Store Categories action.");
  }
}

export async function mutateStoreCategoryCatalogueAction(
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
        await mutateStoreCategoryCatalogue(
          transaction,
          mutation,
          principal.id,
        );
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    if (databaseCode(error) === "P2002") {
      throw new Error(uniqueConstraintMessage(error));
    }
    if (databaseCode(error) === "P2034") {
      throw new Error("Catalogue changed; reload and retry.");
    }
    throw error;
  }
  revalidatePath("/system-controls/store-categories");
}