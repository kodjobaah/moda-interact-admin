export type RequestStoreCategoryTranslationInput = {
  categoryId: string;
  expectedCategoryEditVersion: number;
  translationModelConfigurationId: string;
  operationId: string;
  reason: string;
};

function boundedText(value: unknown, name: string, maximum: number): string {
  if (typeof value !== "string") throw new Error(`${name} is invalid.`);
  const result = value.trim();
  if (!result || result.length > maximum || /\0/.test(result)) {
    throw new Error(`${name} is invalid.`);
  }
  return result;
}

function positiveInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new Error(`${name} is invalid.`);
  }
  return value as number;
}

export function validateRequestStoreCategoryTranslationInput(input: {
  categoryId: unknown;
  expectedCategoryEditVersion: unknown;
  translationModelConfigurationId: unknown;
  operationId: unknown;
  reason: unknown;
}): RequestStoreCategoryTranslationInput {
  return {
    categoryId: boundedText(input.categoryId, "categoryId", 255),
    expectedCategoryEditVersion: positiveInteger(
      input.expectedCategoryEditVersion,
      "expectedCategoryEditVersion",
    ),
    translationModelConfigurationId: boundedText(
      input.translationModelConfigurationId,
      "translationModelConfigurationId",
      255,
    ),
    operationId: boundedText(input.operationId, "operationId", 128),
    reason: boundedText(input.reason, "reason", 1000),
  };
}
