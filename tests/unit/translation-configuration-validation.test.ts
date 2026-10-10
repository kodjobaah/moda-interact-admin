import assert from "node:assert/strict";
import test from "node:test";
import {
  TRANSLATION_PROVIDER,
  validateTranslationCredentialSecret,
  validateTranslationModelAutomaticDefaultMutation,
  validateTranslationModelConfigurationMutation,
  validateTranslationModelEnabledMutation,
  validateTranslationProviderCredentialMutation,
} from "../../src/lib/admin/translation-configuration-validation.ts";

test("translation configuration fixes v1 provider to OpenAI", () => {
  assert.equal(TRANSLATION_PROVIDER, "openai");
});

test("translation credential validation preserves exact secret but rejects line breaks", () => {
  assert.equal(
    validateTranslationCredentialSecret("  exact-openai-key  "),
    "  exact-openai-key  ",
  );
  assert.throws(() => validateTranslationCredentialSecret(""), /invalid/);
  assert.throws(
    () => validateTranslationCredentialSecret("bad\ncredential"),
    /invalid/,
  );
});

test("credential mutation bounds reason and CAS version", () => {
  assert.deepEqual(
    validateTranslationProviderCredentialMutation({
      operationId: " operation-1 ",
      reason: " configure OpenAI ",
      expectedEditVersion: 2,
    }),
    {
      operationId: "operation-1",
      reason: "configure OpenAI",
      expectedEditVersion: 2,
    },
  );
  assert.throws(
    () =>
      validateTranslationProviderCredentialMutation({
        operationId: "operation-1",
        reason: "configure OpenAI",
        expectedEditVersion: 0,
      }),
    /expectedEditVersion is invalid/,
  );
});

test("translation model validation uses bounded provider model IDs", () => {
  assert.deepEqual(
    validateTranslationModelConfigurationMutation({
      displayName: " High quality ",
      providerModelId: " gpt-4.1-mini ",
      operationId: " operation-2 ",
      reason: " model setup ",
    }),
    {
      displayName: "High quality",
      providerModelId: "gpt-4.1-mini",
      operationId: "operation-2",
      reason: "model setup",
    },
  );
  assert.throws(
    () =>
      validateTranslationModelConfigurationMutation({
        displayName: "High quality",
        providerModelId: "openai/gpt-4.1",
        operationId: "operation-2",
        reason: "model setup",
      }),
    /providerModelId is invalid/,
  );
  assert.throws(
    () =>
      validateTranslationModelConfigurationMutation({
        displayName: "High quality",
        providerModelId: "gpt model",
        operationId: "operation-2",
        reason: "model setup",
      }),
    /providerModelId is invalid/,
  );
});

test("translation model status changes require a positive CAS version", () => {
  assert.deepEqual(
    validateTranslationModelEnabledMutation({
      id: " model-1 ",
      enabled: false,
      operationId: " operation-3 ",
      reason: " disable ",
      expectedEditVersion: 4,
    }),
    {
      id: "model-1",
      enabled: false,
      operationId: "operation-3",
      reason: "disable",
      expectedEditVersion: 4,
    },
  );
});

test("automatic default mutation requires an id and positive CAS version", () => {
  assert.deepEqual(
    validateTranslationModelAutomaticDefaultMutation({
      id: " model-2 ",
      operationId: " operation-4 ",
      reason: " use for automatic translations ",
      expectedEditVersion: 7,
    }),
    {
      id: "model-2",
      operationId: "operation-4",
      reason: "use for automatic translations",
      expectedEditVersion: 7,
    },
  );
  assert.throws(
    () =>
      validateTranslationModelAutomaticDefaultMutation({
        id: "model-2",
        operationId: "operation-4",
        reason: "use for automatic translations",
        expectedEditVersion: 0,
      }),
    /expectedEditVersion is invalid/,
  );
});
