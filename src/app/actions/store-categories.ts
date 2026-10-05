"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdminMutation } from "@/lib/auth/platform-admin";
import { ensureDevelopmentPlatformAdmin } from "@/lib/auth/development-platform-admin";
import { prisma } from "@/lib/prisma";
import { resolveShopifyTaxonomyCategory } from "@/lib/admin/shopify-taxonomy";
import type { StoreCategoryTaxonomyReference } from "@/lib/admin/store-category-taxonomy-reference";
import {
  createStoreCategoryBundle,
  mutateStoreCategoryCatalogue,
  type StoreCategoryMutation,
} from "@/lib/admin/store-categories";
import {
  parseCreatePromptTemplateForm,
  parseCreateStoreCategoryBundleInput,
  parseCreateStoreCategoryForm,
  parseCreateTaxonomyMappingForm,
  parseRemoveTaxonomyMappingForm,
  parseSelectDefaultTemplateForm,
  parseUpdatePromptTemplateForm,
  parseUpdateStoreCategoryForm,
  parseUpdateTaxonomyMappingForm,
} from "@/lib/admin/store-category-validation";

async function assertTopLevelStoreCategoryReference(
  reference: StoreCategoryTaxonomyReference,
): Promise<void> {
  const resolved = await resolveShopifyTaxonomyCategory(
    reference.categoryId,
    "top-level",
  );
  const category = resolved.category;

  if (
    !category ||
    category.level !== 0 ||
    category.parentId !== null ||
    category.ancestors.length !== 0
  ) {
    throw new Error(
      "Store Category reference taxonomy must be a top-level category.",
    );
  }

  if (
    resolved.version !== reference.version ||
    category.id !== reference.categoryId ||
    category.name !== reference.name ||
    category.fullName !== reference.fullName
  ) {
    throw new Error(
      "Reference taxonomy selection is stale; reselect the top-level category and retry.",
    );
  }
}

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
  if (target.includes("referenceTaxonomyCategoryId")) {
    return "This reference taxonomy category is already used by another Store Category.";
  }
  if (target.includes("shopifyTaxonomyCategoryId")) {
    return "This reference taxonomy category is already mapped.";
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

export async function createStoreCategoryBundleAction(
  payload: unknown,
): Promise<{ categoryId: string }> {
  const principal = await requirePlatformAdminMutation();
  if (principal.role !== "SUPER_ADMIN") {
    throw new Error("SUPER_ADMIN access is required.");
  }
  const input = parseCreateStoreCategoryBundleInput(payload);
  await assertTopLevelStoreCategoryReference(input.category.referenceTaxonomy);
  try {
    const categoryId = await prisma.$transaction(
      async (transaction) => {
        await ensureDevelopmentPlatformAdmin(transaction, principal);
        return createStoreCategoryBundle(transaction, input, principal.id);
      },
      { isolationLevel: "Serializable" },
    );
    revalidatePath("/system-controls/store-categories");
    return { categoryId };
  } catch (error) {
    if (databaseCode(error) === "P2002") {
      throw new Error(uniqueConstraintMessage(error));
    }
    if (databaseCode(error) === "P2034") {
      throw new Error("Catalogue changed; reload and retry.");
    }
    throw error;
  }
}
