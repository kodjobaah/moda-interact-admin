"use server";

import { revalidatePath } from "next/cache";
import { createLogger } from "@modainteract/moda-interact-shared/logging";
import { requirePlatformAdminMutation } from "@/lib/auth/platform-admin";
import { resolveDeploymentEnvironmentName } from "@/lib/auth/environment";
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

const storeCategoryLogger = createLogger({
  serviceNamespace: "moda-interact",
  serviceName: "moda-interact-admin",
  environment: resolveDeploymentEnvironmentName(),
});

export type CreateStoreCategoryBundleActionResult =
  | { ok: true; categoryId: string }
  | { ok: false; message: string };

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

function createStoreCategoryBundleFailureMessage(error: unknown): string {
  if (databaseCode(error) === "P2002") {
    return uniqueConstraintMessage(error);
  }
  if (databaseCode(error) === "P2034") {
    return "Catalogue changed; reload and retry.";
  }

  const message = error instanceof Error ? error.message : "";
  if (
    message === "SUPER_ADMIN access is required." ||
    message === "Store Category reference taxonomy must be a top-level category." ||
    message ===
      "Reference taxonomy selection is stale; reselect the top-level category and retry."
  ) {
    return message;
  }

  return (
    "The Store Category could not be created. Check the admin server logs and retry."
  );
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
): Promise<CreateStoreCategoryBundleActionResult> {
  const startedAt = Date.now();
  let actorAdminId: string | null = null;
  let referenceTaxonomyCategoryId: string | null = null;
  let categorySlug: string | null = null;
  let mappingCount: number | null = null;

  try {
    const principal = await requirePlatformAdminMutation();
    actorAdminId = principal.id;
    if (principal.role !== "SUPER_ADMIN") {
      throw new Error("SUPER_ADMIN access is required.");
    }

    const input = parseCreateStoreCategoryBundleInput(payload);
    referenceTaxonomyCategoryId = input.category.referenceTaxonomy.categoryId;
    categorySlug = input.category.slug;
    mappingCount = input.shopifyMappings.length;

    storeCategoryLogger.info("admin.store_category.bundle_create", {
      actorAdminId,
      outcome: "started",
      referenceTaxonomyCategoryId,
      categorySlug,
      mappingCount,
    });

    await assertTopLevelStoreCategoryReference(input.category.referenceTaxonomy);

    const categoryId = await prisma.$transaction(
      async (transaction) => {
        await ensureDevelopmentPlatformAdmin(transaction, principal);
        return createStoreCategoryBundle(transaction, input, principal.id);
      },
      { isolationLevel: "Serializable" },
    );

    storeCategoryLogger.info("admin.store_category.bundle_create", {
      actorAdminId,
      outcome: "succeeded",
      categoryId,
      referenceTaxonomyCategoryId,
      categorySlug,
      mappingCount,
      durationMs: Date.now() - startedAt,
    });

    try {
      revalidatePath("/system-controls/store-categories");
    } catch (error) {
      storeCategoryLogger.info("admin.store_category.bundle_create.revalidate", {
        actorAdminId,
        outcome: "failed",
        categoryId,
        reason: error instanceof Error ? error.message : "unknown",
      });
    }

    return { ok: true, categoryId };
  } catch (error) {
    const message = createStoreCategoryBundleFailureMessage(error);
    storeCategoryLogger.info("admin.store_category.bundle_create", {
      actorAdminId,
      outcome: "failed",
      referenceTaxonomyCategoryId,
      categorySlug,
      mappingCount,
      durationMs: Date.now() - startedAt,
      reason: error instanceof Error ? error.message : "unknown",
    });
    return { ok: false, message };
  }
}

export type RequestStoreCategoryTranslationActionResult =
  | { ok: true; runId: string; itemCount: number; localeCount: number }
  | { ok: false; message: string; refreshRequired: boolean };

function translationRequestPayload(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("Translation enablement input is invalid.");
  }
  return input as Record<string, unknown>;
}

function translationRequestClientMessage(error: unknown): {
  message: string;
  refreshRequired: boolean;
} {
  const message = error instanceof Error ? error.message : "";
  const refreshRequired =
    message === "Store Category changed; refresh and try again.";
  const allowedPrefixes = [
    "SUPER_ADMIN access is required.",
    "Store Category was not found.",
    "Store Category changed; refresh and try again.",
    "Disable this Store Category before requesting translation.",
    "A translation/enablement run is already active for this Store Category.",
    "Choose a valid enabled default prompt template before translation.",
    "Configure a merchant display name and condition key for every mapping before translation.",
    "The selected translation model is unavailable or its provider credential is not configured.",
    "The translation/enablement request timed out while writing to PostgreSQL. Retry the request.",
  ];
  if (allowedPrefixes.includes(message) || message.startsWith("Unknown mapping condition")) {
    return { message, refreshRequired };
  }
  if (
    message.includes("conditional") ||
    message.includes("mapping condition") ||
    message.includes("Prompt template")
  ) {
    return { message, refreshRequired };
  }
  return {
    message: "The translation/enablement request could not be created. Check the admin server logs and retry.",
    refreshRequired,
  };
}

export async function requestStoreCategoryTranslationAction(
  payload: unknown,
): Promise<RequestStoreCategoryTranslationActionResult> {
  try {
    const principal = await requirePlatformAdminMutation();
    if (principal.role !== "SUPER_ADMIN") {
      throw new Error("SUPER_ADMIN access is required.");
    }
    const value = translationRequestPayload(payload);
    const { requestStoreCategoryTranslation } = await import(
      "@/lib/admin/store-category-translation-enablement"
    );
    const result = await requestStoreCategoryTranslation(
      {
        categoryId: value.categoryId,
        expectedCategoryEditVersion: value.expectedCategoryEditVersion,
        translationModelConfigurationId: value.translationModelConfigurationId,
        operationId: value.operationId,
        reason: value.reason,
      },
      principal,
    );
    revalidatePath("/system-controls/store-categories");
    return {
      ok: true,
      runId: result.runId,
      itemCount: result.itemCount,
      localeCount: result.localeCount,
    };
  } catch (error) {
    return { ok: false, ...translationRequestClientMessage(error) };
  }
}
