import { validateStoreCategoryPromptTemplate } from "@modainteract/moda-interact-shared/commerce";
import type { CommerceAuditAction, Prisma } from "@prisma/client";
import type {
  CreatePromptTemplateInput,
  CreateStoreCategoryBundleInput,
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

function enabledCategoryImmutable(): never {
  throw new Error(
    "Disable this Store Category before changing mappings, prompt templates, or translatable category metadata.",
  );
}

function assertConditionalPrompt(
  promptText: string,
  conditionKeys: string[],
): void {
  const validation = validateStoreCategoryPromptTemplate({
    source: promptText,
    availableConditionKeys: conditionKeys,
  });
  if (!validation.valid) {
    throw new Error(
      validation.issues[0]?.message ?? "Conditional Store Category prompt is invalid.",
    );
  }
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
          taxonomySource: true,
          taxonomyVersion: true,
          taxonomyCategoryName: true,
          taxonomyCategoryFullName: true,
          conditionKey: true,
          displayName: true,
          weight: true,
          editVersion: true,
        },
      },
      translationRuns: {
        orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
        take: 1,
        select: {
          id: true,
          status: true,
          sourceHash: true,
          provider: true,
          providerModelId: true,
          requestedAt: true,
          startedAt: true,
          readyToPublishAt: true,
          completedAt: true,
          failureCode: true,
          translationModel: {
            select: { id: true, displayName: true },
          },
          items: {
            select: { targetLanguageTag: true, status: true },
          },
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
      translationRuns: category.translationRuns.map((run) => ({
        ...run,
        requestedAt: run.requestedAt.toISOString(),
        startedAt: run.startedAt?.toISOString() ?? null,
        readyToPublishAt: run.readyToPublishAt?.toISOString() ?? null,
        completedAt: run.completedAt?.toISOString() ?? null,
      })),
      activeShopProfileCount: _count.activeShopProfiles,
      pendingShopProfileCount: _count.pendingShopProfiles,
    })),
    taxonomySuggestions: categories.flatMap((category) =>
      category.taxonomyMappings.map((mapping) => ({
        shopifyTaxonomyCategoryId: mapping.shopifyTaxonomyCategoryId,
        taxonomySource: mapping.taxonomySource,
        taxonomyVersion: mapping.taxonomyVersion,
        taxonomyCategoryName: mapping.taxonomyCategoryName,
        taxonomyCategoryFullName: mapping.taxonomyCategoryFullName,
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



export async function createStoreCategoryBundle(
  transaction: StoreCategoryTransaction,
  input: CreateStoreCategoryBundleInput,
  actorAdminId: string,
): Promise<string> {
  assertConditionalPrompt(
    input.defaultTemplate.promptText,
    input.shopifyMappings.map((mapping) => mapping.conditionKey),
  );
  const category = await transaction.commercePromptTemplateCategory.create({
    data: {
      slug: input.category.slug,
      displayName: input.category.displayName,
      description: input.category.description,
      displayOrder: input.category.displayOrder,
      referenceTaxonomySource: input.category.referenceTaxonomy.source,
      referenceTaxonomyVersion: input.category.referenceTaxonomy.version,
      referenceTaxonomyCategoryId: input.category.referenceTaxonomy.categoryId,
      referenceTaxonomyCategoryName: input.category.referenceTaxonomy.name,
      referenceTaxonomyCategoryFullName: input.category.referenceTaxonomy.fullName,
      enabled: false,
      editVersion: 1,
      createdByAdminId: actorAdminId,
      updatedByAdminId: actorAdminId,
    },
    select: { id: true },
  });

  const template = await transaction.commercePromptTemplate.create({
    data: {
      key: input.defaultTemplate.key,
      categoryId: category.id,
      displayName: input.defaultTemplate.displayName,
      description: input.defaultTemplate.description,
      promptText: input.defaultTemplate.promptText,
      enabled: true,
      editVersion: 1,
      createdByAdminId: actorAdminId,
      updatedByAdminId: actorAdminId,
    },
    select: { id: true },
  });

  const categoryUpdated = await transaction.commercePromptTemplateCategory.updateMany({
    where: { id: category.id, editVersion: 1 },
    data: {
      defaultTemplateId: template.id,
      editVersion: { increment: 1 },
      updatedByAdminId: actorAdminId,
    },
  });
  if (categoryUpdated.count !== 1) stale("category");

  for (const mapping of input.shopifyMappings) {
    await transaction.commerceStoreCategoryTaxonomyMapping.create({
      data: {
        categoryId: category.id,
        shopifyTaxonomyCategoryId: mapping.taxonomy.categoryId,
        taxonomySource: mapping.taxonomy.source,
        taxonomyVersion: mapping.taxonomy.version,
        taxonomyCategoryName: mapping.taxonomy.name,
        taxonomyCategoryFullName: mapping.taxonomy.fullName,
        conditionKey: mapping.conditionKey,
        displayName: mapping.displayName,
        weight: mapping.weight,
        editVersion: 1,
      },
    });
  }

  await audit(transaction, {
    action: "CREATE_PROMPT_TEMPLATE_CATEGORY",
    actorAdminId,
    reason: input.reason,
    categoryId: category.id,
    metadata: {
      creationMode: "ATOMIC_AUTHORING",
      defaultTemplateId: template.id,
      taxonomyMappingCount: input.shopifyMappings.length,
      referenceTaxonomy: {
        source: input.category.referenceTaxonomy.source,
        version: input.category.referenceTaxonomy.version,
        categoryId: input.category.referenceTaxonomy.categoryId,
        name: input.category.referenceTaxonomy.name,
        fullName: input.category.referenceTaxonomy.fullName,
      },
    },
  });
  await audit(transaction, {
    action: "CREATE_PROMPT_TEMPLATE",
    actorAdminId,
    reason: input.reason,
    categoryId: category.id,
    templateId: template.id,
    metadata: { creationMode: "ATOMIC_AUTHORING", defaultTemplate: true },
  });
  await audit(transaction, {
    action: "UPDATE_PROMPT_TEMPLATE_CATEGORY",
    actorAdminId,
    reason: input.reason,
    categoryId: category.id,
    templateId: template.id,
    metadata: {
      changeKind: "INITIAL_CONFIGURATION",
      taxonomyMappingCount: input.shopifyMappings.length,
    },
  });

  return category.id;
}

export async function mutateStoreCategoryCatalogue(
  transaction: StoreCategoryTransaction,
  mutation: StoreCategoryMutation,
  actorAdminId: string,
): Promise<void> {
  if (mutation.kind === "create-category") {
    const { input } = mutation;
    if (input.enabled) {
      throw new Error(
        "Create the category disabled; enabling requires the translation workflow.",
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
      throw new Error(
        "Use Translate & Enable to enable a disabled Store Category.",
      );
    }
    if (existing.enabled) {
      const metadataChange =
        existing.displayName !== input.displayName ||
        existing.description !== input.description ||
        existing.displayOrder !== input.displayOrder;
      if (metadataChange) enabledCategoryImmutable();
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
      existing.enabled && !input.enabled
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
    const category = await transaction.commercePromptTemplateCategory.findUnique({
      where: { id: input.categoryId },
      select: {
        id: true,
        enabled: true,
        taxonomyMappings: { select: { conditionKey: true } },
      },
    });
    if (!category) missing("category");
    if (category.enabled) enabledCategoryImmutable();
    const conditionKeys = category.taxonomyMappings.map((mapping) => {
      if (!mapping.conditionKey) {
        throw new Error("Configure every mapping condition key before saving prompt templates.");
      }
      return mapping.conditionKey;
    });
    assertConditionalPrompt(input.promptText, conditionKeys);
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
      include: {
        category: {
          select: {
            id: true,
            enabled: true,
            taxonomyMappings: { select: { conditionKey: true } },
          },
        },
      },
    });
    if (!existing) missing("template");
    if (existing.editVersion !== input.expectedEditVersion) stale("template");
    if (existing.category.enabled) enabledCategoryImmutable();
    const conditionKeys = existing.category.taxonomyMappings.map((mapping) => {
      if (!mapping.conditionKey) {
        throw new Error("Configure every mapping condition key before saving prompt templates.");
      }
      return mapping.conditionKey;
    });
    assertConditionalPrompt(input.promptText, conditionKeys);
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
      select: { id: true, editVersion: true, enabled: true },
    });
    if (!category) missing("category");
    if (category.editVersion !== input.expectedCategoryEditVersion) stale("category");
    if (category.enabled) enabledCategoryImmutable();
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
    const category = await transaction.commercePromptTemplateCategory.findUnique({
      where: { id: input.categoryId },
      select: { id: true, enabled: true },
    });
    if (!category) missing("category");
    if (category.enabled) enabledCategoryImmutable();
    await transaction.commerceStoreCategoryTaxonomyMapping.create({
      data: {
        categoryId: input.categoryId,
        shopifyTaxonomyCategoryId: input.taxonomy.categoryId,
        taxonomySource: input.taxonomy.source,
        taxonomyVersion: input.taxonomy.version,
        taxonomyCategoryName: input.taxonomy.name,
        taxonomyCategoryFullName: input.taxonomy.fullName,
        conditionKey: input.conditionKey,
        displayName: input.displayName,
        weight: input.weight,
        editVersion: 1,
      },
    });
    await audit(transaction, {
      action: "UPDATE_PROMPT_TEMPLATE_CATEGORY",
      actorAdminId,
      reason: input.reason,
      categoryId: input.categoryId,
      metadata: {
        changeKind: "TAXONOMY_MAPPING",
        taxonomySource: input.taxonomy.source,
        taxonomyVersion: input.taxonomy.version,
        taxonomyCategoryId: input.taxonomy.categoryId,
        taxonomyCategoryName: input.taxonomy.name,
        taxonomyCategoryFullName: input.taxonomy.fullName,
      },
    });
    return;
  }

  if (mutation.kind === "update-taxonomy-mapping") {
    const { input } = mutation;
    const existing = await transaction.commerceStoreCategoryTaxonomyMapping.findUnique({
      where: { id: input.id },
      include: { category: { select: { enabled: true } } },
    });
    if (!existing) missing("taxonomy mapping");
    if (existing.category.enabled) enabledCategoryImmutable();
    if (existing.editVersion !== input.expectedEditVersion) {
      throw new Error("Taxonomy mapping changed; reload and retry.");
    }
    if (existing.conditionKey && existing.conditionKey !== input.conditionKey) {
      throw new Error("Mapping condition key is immutable after it is assigned.");
    }
    const changedFields = [
      existing.conditionKey !== input.conditionKey ? "conditionKey" : null,
      existing.displayName !== input.displayName ? "displayName" : null,
      existing.weight !== input.weight ? "weight" : null,
    ].filter((field): field is string => field !== null);
    const updated = await transaction.commerceStoreCategoryTaxonomyMapping.updateMany({
      where: { id: existing.id, editVersion: input.expectedEditVersion },
      data: {
        conditionKey: input.conditionKey,
        displayName: input.displayName,
        weight: input.weight,
        editVersion: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      throw new Error("Taxonomy mapping changed; reload and retry.");
    }
    await audit(transaction, {
      action: "UPDATE_PROMPT_TEMPLATE_CATEGORY",
      actorAdminId,
      reason: input.reason,
      categoryId: existing.categoryId,
      metadata: {
        changeKind: "TAXONOMY_MAPPING",
        taxonomyCategoryId: existing.shopifyTaxonomyCategoryId,
        changedFields,
      },
    });
    return;
  }

  const { input } = mutation;
  const existing = await transaction.commerceStoreCategoryTaxonomyMapping.findUnique({
    where: { id: input.id },
    include: { category: { select: { enabled: true } } },
  });
  if (!existing) missing("taxonomy mapping");
  if (existing.category.enabled) enabledCategoryImmutable();
  if (existing.editVersion !== input.expectedEditVersion) {
    throw new Error("Taxonomy mapping changed; reload and retry.");
  }
  const deleted = await transaction.commerceStoreCategoryTaxonomyMapping.deleteMany({
    where: {
      id: existing.id,
      categoryId: existing.categoryId,
      shopifyTaxonomyCategoryId: existing.shopifyTaxonomyCategoryId,
      editVersion: input.expectedEditVersion,
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