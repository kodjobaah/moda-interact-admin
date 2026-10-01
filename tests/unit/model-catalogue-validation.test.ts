import assert from "node:assert/strict";
import test from "node:test";
import {
  COMMERCE_MODEL_CONFIGURATION_SCHEMA_VERSION,
  CommerceModelConfigurationSchema,
} from "@modainteract/moda-interact-shared/commerce/model";
import { parseModelCatalogueForm } from "../../src/lib/admin/model-catalogue-validation.ts";

function form(values: Record<string, string>): FormData {
  const result = new FormData();
  for (const [name, value] of Object.entries(values)) result.set(name, value);
  return result;
}

function validForm(overrides: Record<string, string> = {}): FormData {
  return form({
    availabilityId: " availability-1 ",
    provider: " openrouter ",
    providerModelId: " model-1 ",
    displayName: " Model One ",
    description: " Example model ",
    configuration: "{}",
    ...overrides,
  });
}

test("parses canonical provider identity and derives the Shared config version", () => {
  assert.deepEqual(parseModelCatalogueForm(validForm()), {
    availabilityId: "availability-1",
    provider: "openrouter",
    providerModelId: "model-1",
    displayName: "Model One",
    description: "Example model",
    configurationSchemaVersion: COMMERCE_MODEL_CONFIGURATION_SCHEMA_VERSION,
    configuration: {},
  });
});

test("uses Shared provider and model identity validation without lowercasing", () => {
  assert.throws(
    () => parseModelCatalogueForm(validForm({ provider: "OpenRouter" })),
    /Provider is invalid/,
  );
  assert.throws(
    () => parseModelCatalogueForm(validForm({ providerModelId: "model id" })),
    /Provider model ID is invalid/,
  );
  assert.throws(
    () =>
      parseModelCatalogueForm(validForm({ providerModelId: "provider/model" })),
    /Provider model ID is invalid/,
  );
});

test("accepts direct nested OpenRouter configuration and preserves unknown options", () => {
  const configuration = {
    temperature: 0.2,
    reasoning: { effort: "high" },
    provider: { allow_fallbacks: true, sort: "latency" },
    future_openrouter_option: { enabled: true },
  };
  const parsed = parseModelCatalogueForm(
    validForm({ configuration: JSON.stringify(configuration) }),
  );
  assert.deepEqual(parsed.configuration, configuration);
  assert.equal(
    CommerceModelConfigurationSchema.safeParse(parsed.configuration).success,
    true,
  );
});

test("maps invalid JSON and Shared-invalid configuration to bounded errors", () => {
  assert.throws(
    () => parseModelCatalogueForm(validForm({ configuration: "{broken" })),
    { message: "Model configuration must be valid JSON." },
  );
  assert.throws(
    () =>
      parseModelCatalogueForm(
        validForm({ configuration: '{"model":"blocked"}' }),
      ),
    { message: "Model configuration is invalid." },
  );
});

test("rejects client-controlled schema version, identity aliases and credential fields", () => {
  for (const name of [
    "configurationSchemaVersion",
    "openRouterModelId",
    "credential",
    "apiKey",
    "headers",
    "baseUrl",
    "model",
    "messages",
    "tools",
    "tool_choice",
  ]) {
    assert.throws(
      () => parseModelCatalogueForm(validForm({ [name]: "untrusted" })),
      { message: "Model catalogue input contains unsupported fields." },
    );
  }
});

test("enforces display-name and description bounds", () => {
  for (const displayName of ["", "x".repeat(161)]) {
    assert.throws(
      () => parseModelCatalogueForm(validForm({ displayName })),
      /displayName must be between 1 and 160 characters/,
    );
  }
  assert.throws(
    () => parseModelCatalogueForm(validForm({ description: "x".repeat(2001) })),
    /description must be between 0 and 2000 characters/,
  );
  assert.equal(
    parseModelCatalogueForm(validForm({ description: "  " })).description,
    "",
  );
});

test("update parsing requires server-supplied immutable identity and rejects posted identity changes", () => {
  const update = form({
    availabilityId: "availability-2",
    displayName: "Updated",
    description: "",
    configuration: "{}",
    id: "entry-1",
    expectedEditVersion: "4",
    intent: "update",
  });
  const parsed = parseModelCatalogueForm(update, {
    mode: "update",
    identity: { provider: "openrouter", providerModelId: "model-1" },
  });
  assert.equal(parsed.provider, "openrouter");
  assert.equal(parsed.providerModelId, "model-1");

  update.set("providerModelId", "attacker-model");
  assert.throws(
    () =>
      parseModelCatalogueForm(update, {
        mode: "update",
        identity: { provider: "openrouter", providerModelId: "model-1" },
      }),
    { message: "Model catalogue input contains unsupported fields." },
  );
});
