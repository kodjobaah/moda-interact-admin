import { createHash } from "node:crypto";
import {
  COMMERCE_MODEL_CONFIGURATION_SCHEMA_VERSION,
  CommerceModelConfigurationSchema,
  createOpenRouterModelId,
} from "@modainteract/moda-interact-shared/commerce/model";
import type { Prisma } from "@prisma/client";
import { isRoutingPromptRevision } from "./routing-prompt-purpose";
import { ConfigurationError } from "./errors";
import {
  ROUTING_AGENT_KEY,
  validateRoutingAgentPolicy,
  type RoutingAgentPolicy,
} from "./routing-agent-contract";

type ReferenceDatabase = Pick<
  Prisma.TransactionClient,
  | "commerceModelCatalogueEntry"
  | "commerceAgentPromptRevision"
  | "commerceAgentConfiguration"
>;

/** Run inside the policy CAS transaction. References are rechecked by the worker at use. */
export async function validateRoutingAgentReferences(
  db: ReferenceDatabase,
  key: string,
  values: Record<string, unknown>,
) {
  if (key !== ROUTING_AGENT_KEY) return;
  const parsed = validateRoutingAgentPolicy(values);
  if (!parsed.ok)
    throw new ConfigurationError(
      "INVALID_INPUT",
      "Routing settings are incomplete.",
    );
  const policy = parsed.values as unknown as RoutingAgentPolicy;
  const invalid = (message: string): never => {
    throw new ConfigurationError("INVALID_INPUT", message);
  };
  const prompt = await db.commerceAgentPromptRevision.findUnique({
    where: { id: policy.promptRevisionId },
    select: {
      id: true,
      status: true,
      promptText: true,
      contentHash: true,
      publishedAt: true,
      sourceContext: true,
      prompt: { select: { scope: true, shopId: true } },
    },
  });
  if (
    !prompt ||
    !isRoutingPromptRevision(prompt) ||
    (prompt.sourceContext as Record<string, unknown>)?.schemaVersion !== 1 ||
    prompt.status !== "PUBLISHED" ||
    !prompt.publishedAt ||
    prompt.prompt.scope !== "PLATFORM" ||
    prompt.prompt.shopId !== null ||
    !prompt.promptText.trim() ||
    prompt.contentHash !==
      createHash("sha256").update(prompt.promptText).digest("hex")
  )
    invalid("Select a valid published platform routing prompt revision.");
  const normalAgent = await db.commerceAgentConfiguration.findFirst({
    where: { activePromptRevisionId: policy.promptRevisionId },
    select: { id: true },
  });
  if (normalAgent)
    invalid(
      "The routing prompt must be separate from the normal commerce agent's active prompt.",
    );
  if (policy.modelBinding.kind === "FIXED_CATALOGUE") {
    const model = await db.commerceModelCatalogueEntry.findUnique({
      where: { id: policy.modelBinding.modelCatalogueEntryId },
      select: {
        id: true,
        enabled: true,
        provider: true,
        providerModelId: true,
        configurationSchemaVersion: true,
        configuration: true,
        availability: { select: { scope: true, shopId: true, enabled: true } },
      },
    });
    if (!model)
      throw new ConfigurationError(
        "INVALID_INPUT",
        "Select an enabled model from enabled platform availability.",
      );
    if (
      !model.enabled ||
      !model.availability.enabled ||
      model.availability.scope !== "PLATFORM" ||
      model.availability.shopId !== null
    )
      invalid("Select an enabled model from enabled platform availability.");
    try {
      if (
        model.configurationSchemaVersion !==
        COMMERCE_MODEL_CONFIGURATION_SCHEMA_VERSION
      )
        invalid("Model configuration version is unsupported.");
      CommerceModelConfigurationSchema.parse(model.configuration);
      createOpenRouterModelId({
        provider: model.provider,
        providerModelId: model.providerModelId,
      });
    } catch {
      invalid(
        "The selected model has invalid provider parameters; repair it in the model catalogue.",
      );
    }
  }
  // No credentials are loaded or returned to the client. VERIFIED_SHOP_INHERIT
  // has no fake shop fallback: the worker may resolve it only after ownership proof.
}
