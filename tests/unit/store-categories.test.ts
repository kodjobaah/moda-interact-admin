import assert from "node:assert/strict";
import test from "node:test";
import { mutateStoreCategoryCatalogue } from "../../src/lib/admin/store-categories.ts";

const categoryBase = {
  id: "category-1",
  slug: "home-goods",
  displayName: "Home Goods",
  description: "",
  enabled: false,
  displayOrder: 1,
  editVersion: 4,
  defaultTemplateId: "template-1",
  defaultTemplate: {
    id: "template-1",
    categoryId: "category-1",
    enabled: true,
    promptText: "Canonical instructions",
  },
};


const topLevelTaxonomy = {
  source: "SHOPIFY_STANDARD_PRODUCT_TAXONOMY",
  version: "2026-08",
  categoryId: "gid://shopify/TaxonomyCategory/aa",
  name: "Apparel & Accessories",
  fullName: "Apparel & Accessories",
} as const;

const clothingTaxonomy = {
  source: "SHOPIFY_STANDARD_PRODUCT_TAXONOMY",
  version: "2026-08",
  categoryId: "gid://shopify/TaxonomyCategory/aa-1",
  name: "Clothing",
  fullName: "Apparel & Accessories > Clothing",
} as const;

const templateBase = {
  id: "template-1",
  key: "home_goods_default",
  categoryId: "category-1",
  displayName: "Default",
  description: "",
  promptText: "Canonical instructions",
  enabled: true,
  editVersion: 3,
};

function transactionFor(options: {
  category?: Record<string, unknown>;
  template?: Record<string, unknown>;
  categoryUpdateCount?: number;
  templateUpdateCount?: number;
  enabledDefaultCategory?: { id: string } | null;
  categoryCreateError?: Error;
  taxonomyCreateError?: Error;
  taxonomyMapping?: Record<string, unknown>;
} = {}) {
  const calls: Array<{ model: string; method: string; args?: unknown }> = [];
  const audits: Array<Record<string, unknown>> = [];
  const category = { ...categoryBase, ...options.category } as typeof categoryBase;
  const template = { ...templateBase, ...options.template } as typeof templateBase;
  const mapping = {
    id: "mapping-1",
    categoryId: "category-1",
    shopifyTaxonomyCategoryId: "gid://shopify/TaxonomyCategory/aa-1",
    weight: 2,
    ...options.taxonomyMapping,
  };
  const updates: Array<{ model: string; where: Record<string, unknown>; data: Record<string, unknown> }> = [];
  const trap = async () => {
    throw new Error("unexpected database operation");
  };
  const transaction = {
    commerceAuditEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.push({ model: "audit", method: "create", args: data });
        audits.push(data);
      },
    },
    commercePromptTemplateCategory: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.push({ model: "category", method: "create", args: data });
        if (options.categoryCreateError) throw options.categoryCreateError;
        return { id: "category-created" };
      },
      findUnique: async () => {
        calls.push({ model: "category", method: "findUnique" });
        return {
          ...category,
          defaultTemplate: category.defaultTemplate
            ? { ...category.defaultTemplate }
            : null,
        };
      },
      findFirst: async () => {
        calls.push({ model: "category", method: "findFirst" });
        return options.enabledDefaultCategory ?? null;
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        calls.push({ model: "category", method: "updateMany", args: { where, data } });
        updates.push({ model: "category", where, data });
        if (options.categoryUpdateCount === 0) return { count: 0 };
        if (where.id === "category-created" && where.editVersion === 1) return { count: 1 };
        if (where.editVersion !== category.editVersion) return { count: 0 };
        Object.assign(category, data);
        if (typeof data.editVersion === "object") category.editVersion += 1;
        return { count: 1 };
      },
    },
    commercePromptTemplate: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.push({ model: "template", method: "create", args: data });
        return { id: "template-created" };
      },
      findUnique: async () => {
        calls.push({ model: "template", method: "findUnique" });
        return { ...template };
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        calls.push({ model: "template", method: "updateMany", args: { where, data } });
        updates.push({ model: "template", where, data });
        if (options.templateUpdateCount === 0 || where.editVersion !== template.editVersion) return { count: 0 };
        Object.assign(template, data);
        if (typeof data.editVersion === "object") template.editVersion += 1;
        return { count: 1 };
      },
    },
    commerceStoreCategoryTaxonomyMapping: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.push({ model: "mapping", method: "create", args: data });
        if (options.taxonomyCreateError) throw options.taxonomyCreateError;
        return { id: "mapping-created" };
      },
      findUnique: async () => {
        calls.push({ model: "mapping", method: "findUnique" });
        return mapping;
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        calls.push({ model: "mapping", method: "updateMany", args: { where, data } });
        updates.push({ model: "mapping", where, data });
        return { count: 1 };
      },
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        calls.push({ model: "mapping", method: "deleteMany", args: where });
        return { count: 1 };
      },
    },
    $queryRaw: async () => {
      calls.push({ model: "category", method: "lock" });
      return [{ id: category.id, editVersion: category.editVersion }];
    },
    forbidden: trap,
  };
  return { transaction: transaction as never, calls, audits, updates };
}

test("category create initializes version one and records the created entity", async () => {
  const fake = transactionFor();
  await mutateStoreCategoryCatalogue(
    fake.transaction,
    {
      kind: "create-category",
      input: {
        slug: "home-goods",
        displayName: "Home Goods",
        description: "",
        displayOrder: 0,
        enabled: false,
        reason: "Create category",
      },
    },
    "admin-1",
  );
  assert.equal(fake.calls.find((call) => call.model === "category" && call.method === "create")?.args && (fake.calls.find((call) => call.model === "category" && call.method === "create")?.args as Record<string, unknown>).editVersion, 1);
  assert.deepEqual(fake.audits[0], {
    action: "CREATE_PROMPT_TEMPLATE_CATEGORY",
    actorAdminId: "admin-1",
    reason: "Create category",
    promptTemplateCategoryId: "category-created",
    promptTemplateId: undefined,
    metadata: {},
  });
});

test("category cannot be created enabled before a valid default can be selected", async () => {
  const fake = transactionFor();
  await assert.rejects(
    mutateStoreCategoryCatalogue(
      fake.transaction,
      {
        kind: "create-category",
        input: {
          slug: "home-goods",
          displayName: "Home Goods",
          description: "",
          displayOrder: 0,
          enabled: true,
          reason: "Create category",
        },
      },
      "admin-1",
    ),
    /Create the category disabled/,
  );
  assert.equal(fake.calls.length, 0);
});

test("duplicate category slug is rejected by the database unique constraint", async () => {
  const fake = transactionFor({
    categoryCreateError: Object.assign(new Error("duplicate slug"), {
      code: "P2002",
      meta: { target: ["slug"] },
    }),
  });
  await assert.rejects(
    mutateStoreCategoryCatalogue(
      fake.transaction,
      {
        kind: "create-category",
        input: {
          slug: "home-goods",
          displayName: "Home Goods",
          description: "",
          displayOrder: 0,
          enabled: false,
          reason: "Duplicate slug",
        },
      },
      "admin-1",
    ),
    (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "P2002",
  );
  assert.equal(fake.audits.length, 0);
});

test("category update uses version CAS and never writes the immutable slug", async () => {
  const fake = transactionFor();
  await mutateStoreCategoryCatalogue(
    fake.transaction,
    {
      kind: "update-category",
      input: {
        id: "category-1",
        displayName: "Home and Living",
        description: "Updated",
        displayOrder: 2,
        enabled: false,
        expectedEditVersion: 4,
        reason: "Update metadata",
      },
    },
    "admin-1",
  );
  assert.deepEqual(fake.updates[0], {
    model: "category",
    where: { id: "category-1", editVersion: 4 },
    data: {
      displayName: "Home and Living",
      description: "Updated",
      displayOrder: 2,
      enabled: false,
      editVersion: { increment: 1 },
      updatedByAdminId: "admin-1",
    },
  });
  assert.equal("slug" in fake.updates[0]!.data, false);
  assert.equal(fake.audits[0]?.action, "UPDATE_PROMPT_TEMPLATE_CATEGORY");
});

test("stale category CAS writes no audit event", async () => {
  const fake = transactionFor({ categoryUpdateCount: 0 });
  await assert.rejects(
    mutateStoreCategoryCatalogue(
      fake.transaction,
      {
        kind: "update-category",
        input: {
          id: "category-1",
          displayName: "Changed",
          description: "",
          displayOrder: 0,
          enabled: false,
          expectedEditVersion: 4,
          reason: "Stale update",
        },
      },
      "admin-1",
    ),
    /Category changed; reload and retry/,
  );
  assert.equal(fake.audits.length, 0);
});

test("category enable requires an enabled non-empty default in the same category", async () => {
  const fake = transactionFor({
    category: { defaultTemplate: { ...templateBase, enabled: false } },
  });
  await assert.rejects(
    mutateStoreCategoryCatalogue(
      fake.transaction,
      {
        kind: "update-category",
        input: {
          id: "category-1",
          displayName: "Home Goods",
          description: "",
          displayOrder: 1,
          enabled: true,
          expectedEditVersion: 4,
          reason: "Enable category",
        },
      },
      "admin-1",
    ),
    /valid enabled default template/,
  );
  assert.equal(fake.updates.length, 0);

  const valid = transactionFor();
  await mutateStoreCategoryCatalogue(
    valid.transaction,
    {
      kind: "update-category",
      input: {
        id: "category-1",
        displayName: "Home Goods",
        description: "",
        displayOrder: 1,
        enabled: true,
        expectedEditVersion: 4,
        reason: "Enable category",
      },
    },
    "admin-1",
  );
  assert.equal(valid.audits[0]?.action, "ENABLE_PROMPT_TEMPLATE_CATEGORY");
});

test("disabling a category audits the change without touching shop profiles", async () => {
  const fake = transactionFor({ category: { enabled: true } });
  await mutateStoreCategoryCatalogue(
    fake.transaction,
    {
      kind: "update-category",
      input: {
        id: "category-1",
        displayName: "Home Goods",
        description: "",
        displayOrder: 1,
        enabled: false,
        expectedEditVersion: 4,
        reason: "Disable category",
      },
    },
    "admin-1",
  );
  assert.equal(fake.audits[0]?.action, "DISABLE_PROMPT_TEMPLATE_CATEGORY");
  assert.equal(fake.calls.some((call) => call.model.includes("ShopProfile")), false);
});

test("default selection locks category, validates template ownership, and records exact audit metadata", async () => {
  const fake = transactionFor();
  await mutateStoreCategoryCatalogue(
    fake.transaction,
    {
      kind: "select-default-template",
      input: {
        categoryId: "category-1",
        templateId: "template-1",
        expectedCategoryEditVersion: 4,
        reason: "Set default",
      },
    },
    "admin-1",
  );
  assert.equal(fake.calls[0]?.method, "lock");
  assert.deepEqual(fake.updates[0]?.data, {
    defaultTemplateId: "template-1",
    editVersion: { increment: 1 },
    updatedByAdminId: "admin-1",
  });
  assert.deepEqual(fake.audits[0], {
    action: "UPDATE_PROMPT_TEMPLATE_CATEGORY",
    actorAdminId: "admin-1",
    reason: "Set default",
    promptTemplateCategoryId: "category-1",
    promptTemplateId: "template-1",
    metadata: { changeKind: "DEFAULT_TEMPLATE" },
  });
});

test("default selection rejects a template from another category", async () => {
  const fake = transactionFor({ template: { categoryId: "category-2" } });
  await assert.rejects(
    mutateStoreCategoryCatalogue(
      fake.transaction,
      {
        kind: "select-default-template",
        input: {
          categoryId: "category-1",
          templateId: "template-1",
          expectedCategoryEditVersion: 4,
          reason: "Invalid default",
        },
      },
      "admin-1",
    ),
    /belong to this category/,
  );
  assert.equal(fake.updates.length, 0);
  assert.equal(fake.audits.length, 0);
});

test("template update uses CAS and one content audit with changed-field names", async () => {
  const fake = transactionFor();
  await mutateStoreCategoryCatalogue(
    fake.transaction,
    {
      kind: "update-template",
      input: {
        id: "template-1",
        displayName: "Default Updated",
        description: "New description",
        promptText: "New canonical instructions",
        enabled: true,
        expectedEditVersion: 3,
        reason: "Update prompt content",
      },
    },
    "admin-1",
  );
  assert.deepEqual(fake.updates[0]?.where, { id: "template-1", editVersion: 3 });
  assert.deepEqual(fake.audits[0], {
    action: "UPDATE_PROMPT_TEMPLATE_CONTENT",
    actorAdminId: "admin-1",
    reason: "Update prompt content",
    promptTemplateCategoryId: "category-1",
    promptTemplateId: "template-1",
    metadata: { changedFields: ["displayName", "description", "promptText"] },
  });
  assert.equal(fake.audits.length, 1);
});

test("enabled default template cannot be disabled", async () => {
  const fake = transactionFor({ enabledDefaultCategory: { id: "category-1" } });
  await assert.rejects(
    mutateStoreCategoryCatalogue(
      fake.transaction,
      {
        kind: "update-template",
        input: {
          id: "template-1",
          displayName: "Default",
          description: "",
          promptText: "Canonical instructions",
          enabled: false,
          expectedEditVersion: 3,
          reason: "Disable template",
        },
      },
      "admin-1",
    ),
    /Choose another enabled default template before disabling this template/,
  );
  assert.equal(fake.updates.length, 0);
  assert.equal(fake.audits.length, 0);
});

test("stale template CAS writes no audit event", async () => {
  const fake = transactionFor({ templateUpdateCount: 0 });
  await assert.rejects(
    mutateStoreCategoryCatalogue(
      fake.transaction,
      {
        kind: "update-template",
        input: {
          id: "template-1",
          displayName: "Default",
          description: "",
          promptText: "Changed instructions",
          enabled: true,
          expectedEditVersion: 3,
          reason: "Stale template update",
        },
      },
      "admin-1",
    ),
    /Prompt template changed; reload and retry/,
  );
  assert.equal(fake.audits.length, 0);
});

test("duplicate taxonomy IDs remain rejected by the database unique constraint", async () => {
  const fake = transactionFor({
    taxonomyCreateError: Object.assign(new Error("duplicate"), { code: "P2002" }),
  });
  await assert.rejects(
    mutateStoreCategoryCatalogue(
      fake.transaction,
      {
        kind: "create-taxonomy-mapping",
        input: {
          categoryId: "category-1",
          taxonomy: clothingTaxonomy,
          weight: 1,
          reason: "Duplicate mapping",
        },
      },
      "admin-1",
    ),
    (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "P2002",
  );
  assert.equal(fake.audits.length, 0);
});

test("taxonomy mapping create, weight update, and remove use category audit metadata", async () => {
  const create = transactionFor();
  await mutateStoreCategoryCatalogue(
    create.transaction,
    {
      kind: "create-taxonomy-mapping",
      input: {
        categoryId: "category-1",
        taxonomy: clothingTaxonomy,
        weight: 4,
        reason: "Add mapping",
      },
    },
    "admin-1",
  );
  assert.deepEqual(create.audits[0], {
    action: "UPDATE_PROMPT_TEMPLATE_CATEGORY",
    actorAdminId: "admin-1",
    reason: "Add mapping",
    promptTemplateCategoryId: "category-1",
    promptTemplateId: undefined,
    metadata: {
      changeKind: "TAXONOMY_MAPPING",
      taxonomySource: clothingTaxonomy.source,
      taxonomyVersion: clothingTaxonomy.version,
      taxonomyCategoryId: clothingTaxonomy.categoryId,
      taxonomyCategoryName: clothingTaxonomy.name,
      taxonomyCategoryFullName: clothingTaxonomy.fullName,
    },
  });

  const update = transactionFor();
  await mutateStoreCategoryCatalogue(
    update.transaction,
    {
      kind: "update-taxonomy-mapping",
      input: {
        id: "mapping-1",
        weight: 9,
        reason: "Increase weighting",
      },
    },
    "admin-1",
  );
  assert.deepEqual(update.updates[0]?.data, { weight: 9 });
  assert.equal(update.audits[0]?.promptTemplateCategoryId, "category-1");
  assert.deepEqual(update.audits[0]?.metadata, {
    changeKind: "TAXONOMY_MAPPING",
    taxonomyCategoryId: "gid://shopify/TaxonomyCategory/aa-1",
    changedFields: ["weight"],
  });

  const remove = transactionFor();
  await mutateStoreCategoryCatalogue(
    remove.transaction,
    {
      kind: "remove-taxonomy-mapping",
      input: { id: "mapping-1", reason: "Remove mapping" },
    },
    "admin-1",
  );
  assert.equal(remove.calls.some((call) => call.method === "deleteMany"), true);
  assert.equal(remove.audits[0]?.promptTemplateCategoryId, "category-1");
  assert.deepEqual(remove.audits[0]?.metadata, { changeKind: "TAXONOMY_MAPPING" });
});
test("atomic category bundle creates disabled category, enabled default template, mappings, and audit evidence", async () => {
  const { createStoreCategoryBundle } = await import(
    "../../src/lib/admin/store-categories.ts"
  );
  const fake = transactionFor();
  const categoryId = await createStoreCategoryBundle(
    fake.transaction,
    {
      category: {
        slug: "fashion-apparel",
        displayName: "Fashion & Apparel",
        description: "Clothing and accessories",
        displayOrder: 10,
        referenceTaxonomy: topLevelTaxonomy,
      },
      defaultTemplate: {
        key: "fashion_apparel_default",
        displayName: "Fashion default",
        description: "Default prompt",
        promptText: "Help customers with fashion questions.",
      },
      shopifyMappings: [
        {
          taxonomy: clothingTaxonomy,
          weight: 100,
        },
      ],
      reason: "Initial category configuration",
    },
    "admin-1",
  );

  assert.equal(categoryId, "category-created");
  const categoryCreate = fake.calls.find(
    (call) => call.model === "category" && call.method === "create",
  );
  assert.equal((categoryCreate?.args as Record<string, unknown>).enabled, false);
  const templateCreate = fake.calls.find(
    (call) => call.model === "template" && call.method === "create",
  );
  assert.equal((templateCreate?.args as Record<string, unknown>).enabled, true);
  assert.equal(
    (templateCreate?.args as Record<string, unknown>).categoryId,
    "category-created",
  );
  assert.equal(fake.updates[0]?.data.defaultTemplateId, "template-created");
  const mappingCreate = fake.calls.find(
    (call) => call.model === "mapping" && call.method === "create",
  );
  assert.equal(
    (mappingCreate?.args as Record<string, unknown>).categoryId,
    "category-created",
  );
  assert.deepEqual(
    fake.audits.map((entry) => entry.action),
    [
      "CREATE_PROMPT_TEMPLATE_CATEGORY",
      "CREATE_PROMPT_TEMPLATE",
      "UPDATE_PROMPT_TEMPLATE_CATEGORY",
    ],
  );
});
