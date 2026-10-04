import assert from "node:assert/strict";
import test from "node:test";
import {
  parseCreatePromptTemplateForm,
  parseCreateStoreCategoryForm,
  parseCreateTaxonomyMappingForm,
  parseUpdatePromptTemplateForm,
  parseUpdateStoreCategoryForm,
} from "../../src/lib/admin/store-category-validation.ts";

function form(values: Record<string, string>): FormData {
  const result = new FormData();
  for (const [name, value] of Object.entries(values)) result.set(name, value);
  return result;
}

const categoryValues = {
  slug: " home-goods ",
  displayName: " Home Goods ",
  description: " Useful items ",
  displayOrder: "12",
  enabled: "false",
  reason: " New catalogue category ",
};

test("category creation trims bounded fields and accepts the canonical slug format", () => {
  assert.deepEqual(parseCreateStoreCategoryForm(form(categoryValues)), {
    slug: "home-goods",
    displayName: "Home Goods",
    description: "Useful items",
    displayOrder: 12,
    enabled: false,
    reason: "New catalogue category",
  });
});

test("category creation rejects malformed slugs", () => {
  for (const slug of ["_home", "Home", "home_goods", "1home"]) {
    assert.throws(
      () => parseCreateStoreCategoryForm(form({ ...categoryValues, slug })),
      /slug has an invalid format/,
    );
  }
});

test("category update contract rejects slug input even for an unused category", () => {
  const values = {
    id: "category-unused",
    displayName: "Home Goods Updated",
    description: "",
    displayOrder: "13",
    enabled: "false",
    expectedEditVersion: "2",
    reason: "Metadata update",
  };
  assert.equal(parseUpdateStoreCategoryForm(form(values)).id, "category-unused");
  assert.throws(
    () => parseUpdateStoreCategoryForm(form({ ...values, slug: "new-identity" })),
    /slug is immutable after creation/,
  );
});

test("category metadata bounds and edit versions are validated", () => {
  const values = {
    id: "category-1",
    displayName: "Category",
    description: "",
    displayOrder: "1000001",
    enabled: "true",
    expectedEditVersion: "1",
    reason: "Update",
  };
  assert.throws(() => parseUpdateStoreCategoryForm(form(values)), /displayOrder/);
  assert.throws(
    () => parseUpdateStoreCategoryForm(form({ ...values, displayOrder: "0", expectedEditVersion: "0" })),
    /expectedEditVersion/,
  );
});

test("template create/update require immutable identity and nonblank bounded prompt text", () => {
  const createValues = {
    key: " home_goods_default ",
    categoryId: "category-1",
    displayName: " Default ",
    description: "",
    promptText: " Canonical instructions ",
    enabled: "true",
    reason: "Create template",
  };
  assert.equal(parseCreatePromptTemplateForm(form(createValues)).promptText, "Canonical instructions");
  assert.throws(
    () => parseCreatePromptTemplateForm(form({ ...createValues, key: "home-goods.default" })),
    /key has an invalid format/,
  );
  const updateValues = {
    id: "template-1",
    displayName: "Default",
    description: "",
    promptText: "Instructions",
    enabled: "true",
    expectedEditVersion: "3",
    reason: "Update template",
  };
  assert.equal(parseUpdatePromptTemplateForm(form(updateValues)).expectedEditVersion, 3);
  assert.throws(
    () => parseUpdatePromptTemplateForm(form({ ...updateValues, categoryId: "category-2" })),
    /key and category are immutable/,
  );
  assert.throws(
    () => parseUpdatePromptTemplateForm(form({ ...updateValues, promptText: "   " })),
    /promptText must be between 1 and 100000/,
  );
});

test("taxonomy mapping weight must be a positive bounded integer", () => {
  const values = {
    categoryId: "category-1",
    shopifyTaxonomyCategoryId: "gid://shopify/TaxonomyCategory/aa-1",
    weight: "1",
    reason: "Add mapping",
  };
  assert.equal(parseCreateTaxonomyMappingForm(form(values)).weight, 1);
  for (const weight of ["0", "-1", "1000001"]) {
    assert.throws(
      () => parseCreateTaxonomyMappingForm(form({ ...values, weight })),
      /weight/,
    );
  }
});
test("atomic category bundle validates category, required default template, mappings, and audit reason", async () => {
  const { parseCreateStoreCategoryBundleInput } = await import(
    "../../src/lib/admin/store-category-validation.ts"
  );
  const payload = {
    category: {
      slug: " fashion-apparel ",
      displayName: " Fashion & Apparel ",
      description: " Clothing and accessories ",
      displayOrder: 10,
    },
    defaultTemplate: {
      key: " fashion_apparel_default ",
      displayName: " Fashion default ",
      description: " Default fashion prompt ",
      promptText: " Help customers with fashion questions. ",
    },
    shopifyMappings: [
      {
        shopifyTaxonomyCategoryId: " gid://shopify/TaxonomyCategory/aa ",
        weight: 100,
      },
    ],
    reason: " Initial category configuration ",
  };

  assert.deepEqual(parseCreateStoreCategoryBundleInput(payload), {
    category: {
      slug: "fashion-apparel",
      displayName: "Fashion & Apparel",
      description: "Clothing and accessories",
      displayOrder: 10,
    },
    defaultTemplate: {
      key: "fashion_apparel_default",
      displayName: "Fashion default",
      description: "Default fashion prompt",
      promptText: "Help customers with fashion questions.",
    },
    shopifyMappings: [
      {
        shopifyTaxonomyCategoryId: "gid://shopify/TaxonomyCategory/aa",
        weight: 100,
      },
    ],
    reason: "Initial category configuration",
  });

  assert.throws(
    () =>
      parseCreateStoreCategoryBundleInput({
        ...payload,
        defaultTemplate: { ...payload.defaultTemplate, promptText: "   " },
      }),
    /promptText/,
  );
  assert.throws(
    () =>
      parseCreateStoreCategoryBundleInput({
        ...payload,
        shopifyMappings: [payload.shopifyMappings[0], payload.shopifyMappings[0]],
      }),
    /mapped only once/,
  );
});
