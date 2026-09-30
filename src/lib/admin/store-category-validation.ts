export const STORE_CATEGORY_SLUG_PATTERN = /^[a-z][a-z0-9-]{0,127}$/;
export const PROMPT_TEMPLATE_KEY_PATTERN = /^[a-z][a-z0-9_]{0,127}$/;

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
  shopifyTaxonomyCategoryId: string;
  weight: number;
  reason: string;
};

export type UpdateTaxonomyMappingInput = CreateTaxonomyMappingInput & {
  id: string;
};

export type RemoveTaxonomyMappingInput = {
  id: string;
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

export function parseCreateTaxonomyMappingForm(
  formData: FormData,
): CreateTaxonomyMappingInput {
  return {
    categoryId: requiredText(formData, "categoryId", 255),
    shopifyTaxonomyCategoryId: requiredText(
      formData,
      "shopifyTaxonomyCategoryId",
      255,
    ),
    weight: integer(formData, "weight", 1, 1_000_000),
    reason: reason(formData),
  };
}

export function parseUpdateTaxonomyMappingForm(
  formData: FormData,
): UpdateTaxonomyMappingInput {
  return {
    id: requiredText(formData, "id", 255),
    ...parseCreateTaxonomyMappingForm(formData),
  };
}

export function parseRemoveTaxonomyMappingForm(
  formData: FormData,
): RemoveTaxonomyMappingInput {
  return {
    id: requiredText(formData, "id", 255),
    reason: reason(formData),
  };
}