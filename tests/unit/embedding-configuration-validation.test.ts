import assert from "node:assert/strict";
import test from "node:test";
import { CommerceEmbeddingPurpose } from "@prisma/client";
import {
  validateEmbeddingConfigurationMutation,
  validateEmbeddingConfigurationRemoval,
  validateEmbeddingCredentialSecret,
  validateEmbeddingPurpose,
} from "../../src/lib/admin/embedding-configuration-validation.ts";

test("embedding purpose accepts only the database enum values", () => {
  assert.equal(
    validateEmbeddingPurpose("MERCHANT_KNOWLEDGE"),
    CommerceEmbeddingPurpose.MERCHANT_KNOWLEDGE,
  );
  assert.equal(
    validateEmbeddingPurpose("REFERENCE_TAXONOMY"),
    CommerceEmbeddingPurpose.REFERENCE_TAXONOMY,
  );
  assert.throws(() => validateEmbeddingPurpose("OTHER"), /purpose is invalid/);
});

test("embedding configuration normalizes provider and bounds dimensions", () => {
  const parsed = validateEmbeddingConfigurationMutation({
    purpose: "REFERENCE_TAXONOMY",
    embeddingProvider: " OpenAI ",
    embeddingModel: " text-embedding-3-small ",
    embeddingDimensions: 384,
    embeddingIndexVersion: " reference-taxonomy-v1 ",
    operationId: "operation-1",
    reason: "test configuration",
  });
  assert.equal(parsed.embeddingProvider, "openai");
  assert.equal(parsed.embeddingModel, "text-embedding-3-small");
  assert.equal(parsed.embeddingDimensions, 384);
  assert.equal(parsed.embeddingIndexVersion, "reference-taxonomy-v1");
  assert.throws(
    () =>
      validateEmbeddingConfigurationMutation({
        ...parsed,
        embeddingDimensions: 0,
      }),
    /embeddingDimensions is invalid/,
  );
});

test("embedding credential validation rejects line breaks and empty input", () => {
  assert.equal(validateEmbeddingCredentialSecret("secret-value"), "secret-value");
  assert.throws(() => validateEmbeddingCredentialSecret(""), /invalid/);
  assert.throws(() => validateEmbeddingCredentialSecret("bad\nsecret"), /invalid/);
});


test("embedding removal requires a positive CAS edit version", () => {
  assert.deepEqual(
    validateEmbeddingConfigurationRemoval({
      purpose: "MERCHANT_KNOWLEDGE",
      operationId: "operation-2",
      reason: "remove test configuration",
      expectedEditVersion: 3,
    }),
    {
      purpose: CommerceEmbeddingPurpose.MERCHANT_KNOWLEDGE,
      operationId: "operation-2",
      reason: "remove test configuration",
      expectedEditVersion: 3,
    },
  );
  assert.throws(
    () =>
      validateEmbeddingConfigurationRemoval({
        purpose: "MERCHANT_KNOWLEDGE",
        operationId: "operation-2",
        reason: "remove test configuration",
        expectedEditVersion: undefined,
      }),
    /expectedEditVersion is invalid/,
  );
});
