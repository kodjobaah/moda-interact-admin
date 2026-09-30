import type { CommerceAuditAction, Prisma } from "@prisma/client";
import type {
  CreatePromptTemplateInput,
  CreateStoreCategoryInput,
  CreateTaxonomyMappingInput,
  RemoveTaxonomyMappingInput,
  SelectDefaultTemplateInput,
  UpdatePromptTemplateInput,
  UpdateStoreCategoryInput,
  UpdateTaxonomyMappingInput,
} from "@/lib/admin/store-category-validation";

export type StoreCategoryMutation =
  | { kind: "create-category"; input: CreateStoreCategoryInput }
  | { kind: "update-category"; input: UpdateStoreCategoryInput }
  | { kind: "create-template"; input: CreatePromptTemplateInput }
  | { kind: "update-template"; input: UpdatePromptTemplateInput }
  | { kind: "select-default-template"; input: SelectDefaultTemplateInput }
  | { kind: "create-taxonomy-mapping"; input: CreateTaxonomyMappingInput }
  | { kind: "update-taxonomy-mapping"; input: UpdateTaxonomyMappingInput }
  | { kind: "remove-taxonomy-mapping"; input: RemoveTaxonomyMappingInput };

type StoreCategoryTransaction = Prisma.TransactionClient;

async function audit(
  transaction: StoreCategoryTransaction,
  input: {
    action: CommerceAuditAction;
    actorAdminId: string;
    reason: string;
    categoryId?: string;
    templateId?: string;
    metadata?: Prisma.InputJsonObject;
  },
): Promise<void> {
  await transaction.commerceAuditEvent.create({
    data: {
      action: input.action,
      actorAdminId: input.actorAdminId,
      reason: input.reason,
      promptTemplateCategoryId: input.categoryId,
      promptTemplateId: input.templateId,
      metadata: input.metadata ?? {},
    },
  });
}

function stale(kind: "category" | "template"): never {
  throw new Error(
    `${kind === "category" ? "Category" : "Prompt template"} changed; reload and retry.`,
  );
}

function missing(kind: "category" | "template" | "taxonomy mapping"): never {
  throw new Error(`${kind} not found.`);
}

export async function getStoreCategoryCatalogue() {
  const [{ requirePlatformAdminRead }, { prisma }] = await Promise.all([
    import("@/lib/auth/platform-admin"),
    import("@/lib/prisma"),
  ]);
  await requirePlatformAdminRead();
  const categories = await prisma.commercePromptTemplateCategory.findMany({
    orderBy: [
      { displayOrder: "asc" },
      { displayName: "asc" },
      { id: "asc" },
    ],
    include: {
      defaultTemplate: {
        select: {
          id: true,
          key: true,
          displayName: true,
          description: true,
          promptText: true,
          enabled: true,
          editVersion: true,
        },
      },
      templates: {
        orderBy: [{ displayName: "asc" }, { id: "asc" }],
        select: {
          id: true,
          key: true,
          categoryId: true,
          displayName: true,
          description: true,
          promptText: true,
          enabled: true,
          editVersion: true,
        },
      },
      taxonomyMappings: {
        orderBy: { shopifyTaxonomyCategoryId: "asc" },
        select: {
          id: true,
          categoryId: true,
          shopifyTaxonomyCategoryId: true,
          weight: true,
        },
      },
      _count: {
        select: {
          activeShopProfiles: true,
          pendingShopProfiles: true,
        },
      },
    },
  });

  return {
    categories: categories.map(({ _count, ...category }) => ({
      ...category,
      activeShopProfileCount: _count.activeShopProfiles,
      pendingShopProfileCount: _count.pendingShopProfiles,
    })),
    taxonomySuggestions: categories.flatMap((category) =>
      category.taxonomyMappings.map((mapping) => ({
        shopifyTaxonomyCategoryId: mapping.shopifyTaxonomyCategoryId,
        weight: mapping.weight,
        category: {
          displayOrder: category.displayOrder,
          id: category.id,
        },
      })),
    ),
  };
}

export type StoreCategoryCatalogue = Awaited<
  ReturnType<typeof getStoreCategoryCatalogue>
>;

export async function mutateStoreCategoryCatalogue(
  transaction: StoreCategoryTransaction,
  mutation: StoreCategoryMutation,
  actorAdminId: string,
): Promise<void> {
  if (mutation.kind === "create-category") {
    const { input } = mutation;
    if (input.enabled) {
      throw new Error(
        "Create the category disabled, select a valid default template, then enable it.",
      );
    }
    const category = await transaction.commercePromptTemplateCategory.create({
      data: {
        slug: input.slug,
        displayName: input.displayName,
        description: input.description,
        displayOrder: input.displayOrder,
        enabled: input.enabled,
        editVersion: 1,
        createdByAdminId: actorAdminId,
        updatedByAdminId: actorAdminId,
      },
      select: { id: true },
    });
    await audit(transaction, {
      action: "CREATE_PROMPT_TEMPLATE_CATEGORY",
      actorAdminId,
      reason: input.reason,
      categoryId: category.id,
    });
    return;
  }

  if (mutation.kind === "update-category") {
    const { input } = mutation;
    const existing = await transaction.commercePromptTemplateCategory.findUnique({
      where: { id: input.id },
      include: { defaultTemplate: true },
    });
    if (!existing) missing("category");
    if (existing.editVersion !== input.expectedEditVersion) stale("category");
    if (!existing.enabled && input.enabled) {
      const template = existing.defaultTemplate;
      if (!template || template.categoryId !== existing.id || !template.enabled || !template.promptText.trim()) {
        throw new Error("Choose a valid enabled default template before enabling this category.");
      }
    }
    const updated = await transaction.commercePromptTemplateCategory.updateMany({
      where: { id: input.id, editVersion: input.expectedEditVersion },
      data: {
        displayName: input.displayName,
        description: input.description,
        displayOrder: input.displayOrder,
        enabled: input.enabled,
        editVersion: { increment: 1 },
        updatedByAdminId: actorAdminId,
      },
    });
    if (updated.count !== 1) stale("category");
    const action: CommerceAuditAction =
      !existing.enabled && input.enabled
        ? "ENABLE_PROMPT_TEMPLATE_CATEGORY"
        : existing.enabled && !input.enabled
          ? "DISABLE_PROMPT_TEMPLATE_CATEGORY"
          : "UPDATE_PROMPT_TEMPLATE_CATEGORY";
    await audit(transaction, {
      action,
      actorAdminId,
      reason: input.reason,
      categoryId: existing.id,
    });
    return;
  }

  if (mutation.kind === "create-template") {
    const { input } = mutation;
    const template = await transaction.commercePromptTemplate.create({
      data: {
        key: input.key,
        categoryId: input.categoryId,
        displayName: input.displayName,
        description: input.description,
        promptText: input.promptText,
        enabled: input.enabled,
        editVersion: 1,
        createdByAdminId: actorAdminId,
        updatedByAdminId: actorAdminId,
      },
      select: { id: true },
    });
    await audit(transaction, {
      action: "CREATE_PROMPT_TEMPLATE",
      actorAdminId,
      reason: input.reason,
      categoryId: input.categoryId,
      templateId: template.id,
    });
    return;
  }

  if (mutation.kind === "update-template") {
    const { input } = mutation;
    const existing = await transaction.commercePromptTemplate.findUnique({
      where: { id: input.id },
    });
    if (!existing) missing("template");
    if (existing.editVersion !== input.expectedEditVersion) stale("template");
    if (existing.enabled && !input.enabled) {
      const enabledDefaultCategory =
        await transaction.commercePromptTemplateCategory.findFirst({
          where: { defaultTemplateId: existing.id, enabled: true },
          select: { id: true },
        });
      if (enabledDefaultCategory) {
        throw new Error(
          "Choose another enabled default template before disabling this template.",
        );
      }
    }
    const changedFields = [
      existing.displayName !== input.displayName ? "displayName" : null,
      existing.description !== input.description ? "description" : null,
      existing.promptText !== input.promptText ? "promptText" : null,
      existing.enabled !== input.enabled ? "enabled" : null,
    ].filter((field): field is string => field !== null);
    const updated = await transaction.commercePromptTemplate.updateMany({
      where: { id: input.id, editVersion: input.expectedEditVersion },
      data: {
        displayName: input.displayName,
        description: input.description,
        promptText: input.promptText,
        enabled: input.enabled,
        editVersion: { increment: 1 },
        updatedByAdminId: actorAdminId,
      },
    });
    if (updated.count !== 1) stale("template");
    const action: CommerceAuditAction =
      existing.promptText !== input.promptText
        ? "UPDATE_PROMPT_TEMPLATE_CONTENT"
        : existing.enabled !== input.enabled
          ? input.enabled
            ? "ENABLE_PROMPT_TEMPLATE"
            : "DISABLE_PROMPT_TEMPLATE"
          : "UPDATE_PROMPT_TEMPLATE";
    await audit(transaction, {
      action,
      actorAdminId,
      reason: input.reason,
      categoryId: existing.categoryId,
      templateId: existing.id,
      ...(existing.promptText !== input.promptText
        ? { metadata: { changedFields } }
        : {}),
    });
    return;
  }

  if (mutation.kind === "select-default-template") {
    const { input } = mutation;
    const locked = await transaction.$queryRaw<
      Array<{ id: string; editVersion: number }>
    >`SELECT "id", "editVersion" FROM "commerce"."CommercePromptTemplateCategory" WHERE "id" = ${input.categoryId} FOR UPDATE`;
    const lock = locked[0];
    if (!lock) missing("category");
    if (lock.editVersion !== input.expectedCategoryEditVersion) stale("category");
    const category = await transaction.commercePromptTemplateCategory.findUnique({
      where: { id: input.categoryId },
      select: { id: true, editVersion: true },
    });
    if (!category) missing("category");
    if (category.editVersion !== input.expectedCategoryEditVersion) stale("category");
    const template = await transaction.commercePromptTemplate.findUnique({
      where: { id: input.templateId },
    });
    if (!template || template.categoryId !== category.id || !template.enabled || !template.promptText.trim()) {
      throw new Error("Default template must be enabled, non-empty, and belong to this category.");
    }
    const updated = await transaction.commercePromptTemplateCategory.updateMany({
      where: { id: category.id, editVersion: input.expectedCategoryEditVersion },
      data: {
        defaultTemplateId: template.id,
        editVersion: { increment: 1 },
        updatedByAdminId: actorAdminId,
      },
    });
    if (updated.count !== 1) stale("category");
    await audit(transaction, {
      action: "UPDATE_PROMPT_TEMPLATE_CATEGORY",
      actorAdminId,
      reason: input.reason,
      categoryId: category.id,
      templateId: template.id,
      metadata: { changeKind: "DEFAULT_TEMPLATE" },
    });
    return;
  }

  if (mutation.kind === "create-taxonomy-mapping") {
    const { input } = mutation;
    await transaction.commerceStoreCategoryTaxonomyMapping.create({
      data: {
        categoryId: input.categoryId,
        shopifyTaxonomyCategoryId: input.shopifyTaxonomyCategoryId,
        weight: input.weight,
      },
    });
    await audit(transaction, {
      action: "UPDATE_PROMPT_TEMPLATE_CATEGORY",
      actorAdminId,
      reason: input.reason,
      categoryId: input.categoryId,
      metadata: { changeKind: "TAXONOMY_MAPPING" },
    });
    return;
  }

  if (mutation.kind === "update-taxonomy-mapping") {
    const { input } = mutation;
    const existing = await transaction.commerceStoreCategoryTaxonomyMapping.findUnique({
      where: { id: input.id },
    });
    if (!existing) missing("taxonomy mapping");
    const updated = await transaction.commerceStoreCategoryTaxonomyMapping.updateMany({
      where: {
        id: existing.id,
        categoryId: existing.categoryId,
        shopifyTaxonomyCategoryId: existing.shopifyTaxonomyCategoryId,
        weight: existing.weight,
      },
      data: {
        categoryId: input.categoryId,
        shopifyTaxonomyCategoryId: input.shopifyTaxonomyCategoryId,
        weight: input.weight,
      },
    });
    if (updated.count !== 1) throw new Error("Taxonomy mapping changed; reload and retry.");
    await audit(transaction, {
      action: "UPDATE_PROMPT_TEMPLATE_CATEGORY",
      actorAdminId,
      reason: input.reason,
      categoryId: input.categoryId,
      metadata: { changeKind: "TAXONOMY_MAPPING" },
    });
    return;
  }

  const { input } = mutation;
  const existing = await transaction.commerceStoreCategoryTaxonomyMapping.findUnique({
    where: { id: input.id },
  });
  if (!existing) missing("taxonomy mapping");
  const deleted = await transaction.commerceStoreCategoryTaxonomyMapping.deleteMany({
    where: {
      id: existing.id,
      categoryId: existing.categoryId,
      shopifyTaxonomyCategoryId: existing.shopifyTaxonomyCategoryId,
      weight: existing.weight,
    },
  });
  if (deleted.count !== 1) throw new Error("Taxonomy mapping changed; reload and retry.");
  await audit(transaction, {
    action: "UPDATE_PROMPT_TEMPLATE_CATEGORY",
    actorAdminId,
    reason: input.reason,
    categoryId: existing.categoryId,
    metadata: { changeKind: "TAXONOMY_MAPPING" },
  });
}