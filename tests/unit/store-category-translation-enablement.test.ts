import assert from "node:assert/strict";
import test from "node:test";
import { validateRequestStoreCategoryTranslationInput } from "../../src/lib/admin/store-category-translation-enablement-validation.ts";

test("translation enablement request validation trims bounded identifiers and reason", () => {
  assert.deepEqual(
    validateRequestStoreCategoryTranslationInput({
      categoryId: " category-1 ",
      expectedCategoryEditVersion: 3,
      translationModelConfigurationId: " model-1 ",
      operationId: " op-1 ",
      reason: " Ready to translate ",
    }),
    {
      categoryId: "category-1",
      expectedCategoryEditVersion: 3,
      translationModelConfigurationId: "model-1",
      operationId: "op-1",
      reason: "Ready to translate",
    },
  );
});

test("translation enablement request validation rejects malformed versions and empty reasons", () => {
  const base = {
    categoryId: "category-1",
    expectedCategoryEditVersion: 1,
    translationModelConfigurationId: "model-1",
    operationId: "op-1",
    reason: "Ready",
  };
  assert.throws(
    () =>
      validateRequestStoreCategoryTranslationInput({
        ...base,
        expectedCategoryEditVersion: 0,
      }),
    /expectedCategoryEditVersion/,
  );
  assert.throws(
    () => validateRequestStoreCategoryTranslationInput({ ...base, reason: " " }),
    /reason/,
  );
});
