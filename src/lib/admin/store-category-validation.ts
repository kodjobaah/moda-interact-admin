import { StoreCategoryPromptConditionKeySchema } from "@modainteract/moda-interact-shared/commerce";
import {
  STORE_CATEGORY_REFERENCE_TAXONOMY_SOURCE,
  type StoreCategoryTaxonomyReference,
} from "./store-category-taxonomy-reference.ts";

export const STORE_CATEGORY_SLUG_PATTERN = /^[a-z][a-z0-9-]{0,127}$/;
export const PROMPT_TEMPLATE_KEY_PATTERN = /^[a-z][a-z0-9_]{0,127}$/;


export type CreateStoreCategoryBundleInput = {
  category: {
    referenceTaxonomy: StoreCategoryTaxonomyReference;
    slug: string;
    displayName: string;
    description: string;
    displayOrder: number;
  };
  defaultTemplate: {
    key: string;
    displayName: string;
    description: string;
    promptText: string;
  };
  shopifyMappings: Array<{
    taxonomy: StoreCategoryTaxonomyReference;
    conditionKey: string;
    displayName: string;
    weight: number;
  }>;
  reason: string;
};

export type CreateStoreCategoryInput = {
  slug: string;
  displayName: string;
  description: string;
  displayOrder: number;
  enabled: boolean;
  reason: string;
};

export type UpdateStoreCategoryInput = {
  id: string;
  displayName: string;
  description: string;
  displayOrder: number;
  enabled: boolean;
  expectedEditVersion: number;
  reason: string;
};

export type CreatePromptTemplateInput = {
  key: string;
  categoryId: string;
  displayName: string;
  description: string;
  promptText: string;
  enabled: boolean;
  reason: string;
};

export type UpdatePromptTemplateInput = {
  id: string;
  displayName: string;
  description: string;
  promptText: string;
  enabled: boolean;
  expectedEditVersion: number;
  reason: string;
};

export type SelectDefaultTemplateInput = {
  categoryId: string;
  templateId: string;
  expectedCategoryEditVersion: number;
  reason: string;
};

export type CreateTaxonomyMappingInput = {
  categoryId: string;
  taxonomy: StoreCategoryTaxonomyReference;
  conditionKey: string;
  displayName: string;
  weight: number;
  reason: string;
};

export type UpdateTaxonomyMappingInput = {
  id: string;
  conditionKey: string;
  displayName: string;
  weight: number;
  expectedEditVersion: number;
  reason: string;
};

export type RemoveTaxonomyMappingInput = {
  id: string;
  expectedEditVersion: number;
  reason: string;
};

function value(formData: FormData, name: string): string | null {
  const entry = formData.get(name);
  if (entry === null) return null;
  if (typeof entry !== "string") throw new Error(`${name} is invalid.`);
  return entry;
}

function requiredText(
  formData: FormData,
  name: string,
  maximum: number,
): string {
  const result = value(formData, name)?.trim() ?? "";
  if (result.length < 1 || result.length > maximum) {
    throw new Error(`${name} must be between 1 and ${maximum} characters.`);
  }
  return result;
}

function optionalText(formData: FormData, name: string, maximum: number): string {
  const result = value(formData, name)?.trim() ?? "";
  if (result.length > maximum) {
    throw new Error(`${name} must be at most ${maximum} characters.`);
  }
  return result;
}

function integer(
  formData: FormData,
  name: string,
  minimum: number,
  maximum: number,
): number {
  const raw = requiredText(formData, name, 16);
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be an integer.`);
  const result = Number(raw);
  if (!Number.isSafeInteger(result) || result < minimum || result > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
  }
  return result;
}

function enabled(formData: FormData): boolean {
  const raw = value(formData, "enabled");
  if (raw !== "true" && raw !== "false") {
    throw new Error("enabled must be true or false.");
  }
  return raw === "true";
}


function conditionKeyValue(value: string): string {
  const parsed = StoreCategoryPromptConditionKeySchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("conditionKey has an invalid format.");
  }
  return parsed.data;
}

function reason(formData: FormData): string {
  return requiredText(formData, "reason", 1000);
}

export function parseCreateStoreCategoryForm(
  formData: FormData,
): CreateStoreCategoryInput {
  const slug = requiredText(formData, "slug", 128);
  if (!STORE_CATEGORY_SLUG_PATTERN.test(slug)) {
    throw new Error("slug has an invalid format.");
  }
  return {
    slug,
    displayName: requiredText(formData, "displayName", 255),
    description: optionalText(formData, "description", 2000),
    displayOrder: integer(formData, "displayOrder", 0, 1_000_000),
    enabled: enabled(formData),
    reason: reason(formData),
  };
}

export function parseUpdateStoreCategoryForm(
  formData: FormData,
): UpdateStoreCategoryInput {
  if (formData.has("slug")) {
    throw new Error("Category slug is immutable after creation.");
  }
  return {
    id: requiredText(formData, "id", 255),
    displayName: requiredText(formData, "displayName", 255),
    description: optionalText(formData, "description", 2000),
    displayOrder: integer(formData, "displayOrder", 0, 1_000_000),
    enabled: enabled(formData),
    expectedEditVersion: integer(
      formData,
      "expectedEditVersion",
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    reason: reason(formData),
  };
}

export function parseCreatePromptTemplateForm(
  formData: FormData,
): CreatePromptTemplateInput {
  const key = requiredText(formData, "key", 128);
  if (!PROMPT_TEMPLATE_KEY_PATTERN.test(key)) {
    throw new Error("key has an invalid format.");
  }
  const promptText = requiredText(formData, "promptText", 100_000);
  return {
    key,
    categoryId: requiredText(formData, "categoryId", 255),
    displayName: requiredText(formData, "displayName", 255),
    description: optionalText(formData, "description", 2000),
    promptText,
    enabled: enabled(formData),
    reason: reason(formData),
  };
}

export function parseUpdatePromptTemplateForm(
  formData: FormData,
): UpdatePromptTemplateInput {
  if (formData.has("key") || formData.has("categoryId")) {
    throw new Error("Template key and category are immutable after creation.");
  }
  return {
    id: requiredText(formData, "id", 255),
    displayName: requiredText(formData, "displayName", 255),
    description: optionalText(formData, "description", 2000),
    promptText: requiredText(formData, "promptText", 100_000),
    enabled: enabled(formData),
    expectedEditVersion: integer(
      formData,
      "expectedEditVersion",
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    reason: reason(formData),
  };
}

export function parseSelectDefaultTemplateForm(
  formData: FormData,
): SelectDefaultTemplateInput {
  return {
    categoryId: requiredText(formData, "categoryId", 255),
    templateId: requiredText(formData, "templateId", 255),
    expectedCategoryEditVersion: integer(
      formData,
      "expectedCategoryEditVersion",
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    reason: reason(formData),
  };
}

function taxonomyReferenceFromForm(formData: FormData): StoreCategoryTaxonomyReference {
  const source = requiredText(formData, "taxonomySource", 64);
  if (source !== STORE_CATEGORY_REFERENCE_TAXONOMY_SOURCE) {
    throw new Error("taxonomySource is invalid.");
  }
  return {
    source,
    version: requiredText(formData, "taxonomyVersion", 32),
    categoryId: requiredText(formData, "shopifyTaxonomyCategoryId", 255),
    name: requiredText(formData, "taxonomyCategoryName", 255),
    fullName: requiredText(formData, "taxonomyCategoryFullName", 2000),
  };
}

export function parseCreateTaxonomyMappingForm(
  formData: FormData,
): CreateTaxonomyMappingInput {
  return {
    categoryId: requiredText(formData, "categoryId", 255),
    taxonomy: taxonomyReferenceFromForm(formData),
    conditionKey: conditionKeyValue(requiredText(formData, "conditionKey", 128)),
    displayName: requiredText(formData, "displayName", 255),
    weight: integer(formData, "weight", 1, 1_000_000),
    reason: reason(formData),
  };
}

export function parseUpdateTaxonomyMappingForm(
  formData: FormData,
): UpdateTaxonomyMappingInput {
  return {
    id: requiredText(formData, "id", 255),
    conditionKey: conditionKeyValue(requiredText(formData, "conditionKey", 128)),
    displayName: requiredText(formData, "displayName", 255),
    weight: integer(formData, "weight", 1, 1_000_000),
    expectedEditVersion: integer(
      formData,
      "expectedEditVersion",
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    reason: reason(formData),
  };
}

export function parseRemoveTaxonomyMappingForm(
  formData: FormData,
): RemoveTaxonomyMappingInput {
  return {
    id: requiredText(formData, "id", 255),
    expectedEditVersion: integer(
      formData,
      "expectedEditVersion",
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    reason: reason(formData),
  };
}

function objectValue(input: unknown, name: string): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error(`${name} is invalid.`);
  }
  return input as Record<string, unknown>;
}

function objectText(
  input: Record<string, unknown>,
  name: string,
  maximum: number,
  required = true,
): string {
  const raw = input[name];
  if (typeof raw !== "string") throw new Error(`${name} is invalid.`);
  const result = raw.trim();
  if ((required && result.length < 1) || result.length > maximum) {
    throw new Error(
      required
        ? `${name} must be between 1 and ${maximum} characters.`
        : `${name} must be at most ${maximum} characters.`,
    );
  }
  return result;
}

function objectInteger(
  input: Record<string, unknown>,
  name: string,
  minimum: number,
  maximum: number,
): number {
  const result = input[name];
  if (
    typeof result !== "number" ||
    !Number.isSafeInteger(result) ||
    result < minimum ||
    result > maximum
  ) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
  }
  return result;
}

function objectTaxonomyReference(
  input: unknown,
  name: string,
): StoreCategoryTaxonomyReference {
  const value = objectValue(input, name);
  const source = objectText(value, "source", 64);
  if (source !== STORE_CATEGORY_REFERENCE_TAXONOMY_SOURCE) {
    throw new Error(`${name}.source is invalid.`);
  }
  return {
    source,
    version: objectText(value, "version", 32),
    categoryId: objectText(value, "categoryId", 255),
    name: objectText(value, "name", 255),
    fullName: objectText(value, "fullName", 2000),
  };
}

export function parseCreateStoreCategoryBundleInput(
  input: unknown,
): CreateStoreCategoryBundleInput {
  const root = objectValue(input, "payload");
  const category = objectValue(root.category, "category");
  const defaultTemplate = objectValue(root.defaultTemplate, "defaultTemplate");
  const slug = objectText(category, "slug", 128);
  if (!STORE_CATEGORY_SLUG_PATTERN.test(slug)) {
    throw new Error("slug has an invalid format.");
  }
  const referenceTaxonomy = objectTaxonomyReference(
    category.referenceTaxonomy,
    "category.referenceTaxonomy",
  );
  const key = objectText(defaultTemplate, "key", 128);
  if (!PROMPT_TEMPLATE_KEY_PATTERN.test(key)) {
    throw new Error("key has an invalid format.");
  }
  const mappings = root.shopifyMappings;
  if (!Array.isArray(mappings) || mappings.length > 100) {
    throw new Error("shopifyMappings must contain at most 100 mappings.");
  }
  const seen = new Set<string>();
  const seenConditionKeys = new Set<string>();
  const shopifyMappings = mappings.map((mapping, index) => {
    const value = objectValue(mapping, `shopifyMappings[${index}]`);
    const taxonomy = objectTaxonomyReference(
      value.taxonomy,
      `shopifyMappings[${index}].taxonomy`,
    );
    if (seen.has(taxonomy.categoryId)) {
      throw new Error("Each reference taxonomy category may be mapped only once.");
    }
    seen.add(taxonomy.categoryId);
    const conditionKey = conditionKeyValue(objectText(value, "conditionKey", 128));
    if (seenConditionKeys.has(conditionKey)) {
      throw new Error("Each mapping condition key may be used only once.");
    }
    seenConditionKeys.add(conditionKey);
    return {
      taxonomy,
      conditionKey,
      displayName: objectText(value, "displayName", 255),
      weight: objectInteger(value, "weight", 1, 1_000_000),
    };
  });

  return {
    category: {
      referenceTaxonomy,
      slug,
      displayName: objectText(category, "displayName", 255),
      description: objectText(category, "description", 2000, false),
      displayOrder: objectInteger(category, "displayOrder", 0, 1_000_000),
    },
    defaultTemplate: {
      key,
      displayName: objectText(defaultTemplate, "displayName", 255),
      description: objectText(defaultTemplate, "description", 2000, false),
      promptText: objectText(defaultTemplate, "promptText", 100_000),
    },
    shopifyMappings,
    reason: objectText(root, "reason", 1000),
  };
}
