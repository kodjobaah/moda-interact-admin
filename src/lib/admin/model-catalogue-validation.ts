import {
  COMMERCE_MODEL_CONFIGURATION_SCHEMA_VERSION,
  CommerceModelConfigurationSchema,
  CommerceModelProviderSchema,
  CommerceProviderModelIdSchema,
  createOpenRouterModelId,
  type CommerceModelConfiguration,
} from "@modainteract/moda-interact-shared/commerce/model";

export type ParsedModelCatalogueInput = {
  availabilityId: string;
  provider: string;
  providerModelId: string;
  displayName: string;
  description: string;
  configurationSchemaVersion: typeof COMMERCE_MODEL_CONFIGURATION_SCHEMA_VERSION;
  configuration: CommerceModelConfiguration;
};

type ParseModelCatalogueFormOptions = {
  mode?: "create" | "update";
  identity?: { provider: string; providerModelId: string };
};

const forbiddenFields = new Set([
  "apiKey",
  "baseUrl",
  "configurationSchemaVersion",
  "credential",
  "headers",
  "messages",
  "model",
  "openRouterModelId",
  "tool_choice",
  "tools",
]);

const createFields = new Set([
  "availabilityId",
  "configuration",
  "description",
  "displayName",
  "intent",
  "provider",
  "providerModelId",
]);

const updateFields = new Set([
  "availabilityId",
  "configuration",
  "description",
  "displayName",
  "expectedEditVersion",
  "id",
  "intent",
]);

function field(formData: FormData, name: string): string {
  const values = formData.getAll(name);
  if (values.length !== 1 || typeof values[0] !== "string") {
    throw new Error(`${name} is invalid.`);
  }
  return values[0].trim();
}

function boundedText(
  formData: FormData,
  name: string,
  minimum: number,
  maximum: number,
): string {
  const value = field(formData, name);
  if (value.length < minimum || value.length > maximum) {
    throw new Error(
      `${name} must be between ${minimum} and ${maximum} characters.`,
    );
  }
  return value;
}

function sharedString<T>(
  schema: { parse: (value: unknown) => T },
  value: string,
  error: string,
): T {
  try {
    return schema.parse(value);
  } catch {
    throw new Error(error);
  }
}

export function parseModelCatalogueForm(
  formData: FormData,
  options: ParseModelCatalogueFormOptions = {},
): ParsedModelCatalogueInput {
  const mode = options.mode ?? "create";
  const allowedFields = mode === "create" ? createFields : updateFields;
  for (const name of new Set(Array.from(formData.keys()))) {
    if (forbiddenFields.has(name) || !allowedFields.has(name)) {
      throw new Error("Model catalogue input contains unsupported fields.");
    }
  }

  const availabilityId = boundedText(formData, "availabilityId", 1, 128);
  const provider = options.identity
    ? sharedString(
        CommerceModelProviderSchema,
        options.identity.provider,
        "Provider is invalid.",
      )
    : sharedString(
        CommerceModelProviderSchema,
        field(formData, "provider"),
        "Provider is invalid.",
      );
  const providerModelId = options.identity
    ? sharedString(
        CommerceProviderModelIdSchema,
        options.identity.providerModelId,
        "Provider model ID is invalid.",
      )
    : sharedString(
        CommerceProviderModelIdSchema,
        field(formData, "providerModelId"),
        "Provider model ID is invalid.",
      );
  const displayName = boundedText(formData, "displayName", 1, 160);
  const description = boundedText(formData, "description", 0, 2000);
  const configurationText = field(formData, "configuration");

  let parsedConfiguration: unknown;
  try {
    parsedConfiguration = JSON.parse(configurationText);
  } catch {
    throw new Error("Model configuration must be valid JSON.");
  }

  let configuration: CommerceModelConfiguration;
  try {
    configuration = CommerceModelConfigurationSchema.parse(parsedConfiguration);
  } catch {
    throw new Error("Model configuration is invalid.");
  }

  createOpenRouterModelId({ provider, providerModelId });

  return {
    availabilityId,
    provider,
    providerModelId,
    displayName,
    description,
    configurationSchemaVersion: COMMERCE_MODEL_CONFIGURATION_SCHEMA_VERSION,
    configuration,
  };
}
