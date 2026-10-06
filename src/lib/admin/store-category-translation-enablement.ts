import { createHash } from "node:crypto";
import {
  validateStoreCategoryPromptTemplate,
} from "@modainteract/moda-interact-shared/commerce";
import {
  MODA_SUPPORTED_LANGUAGE_TAGS,
} from "@modainteract/moda-interact-shared/internationalization";
import { createLogger } from "@modainteract/moda-interact-shared/logging";
import {
  CommerceAuditAction,
  CommerceAuditActorType,
  CommerceStoreCategoryTranslationEntityKind,
  CommerceStoreCategoryTranslationField,
  CommerceStoreCategoryTranslationItemStatus,
  CommerceStoreCategoryTranslationRunStatus,
  type CommerceEnvironment,
  type Prisma,
} from "@prisma/client";
import type { PlatformAdminPrincipal } from "@/lib/auth/platform-admin";
import { ensureDevelopmentPlatformAdmin } from "@/lib/auth/development-platform-admin";
import { resolveDeploymentEnvironmentName } from "@/lib/auth/environment";
import { resolveCommerceEnvironment } from "./openrouter-credential-environment.ts";
import { TRANSLATION_PROVIDER } from "./translation-configuration-validation.ts";
import {
  validateRequestStoreCategoryTranslationInput,
  type RequestStoreCategoryTranslationInput,
} from "./store-category-translation-enablement-validation.ts";

const logger = createLogger({
  serviceNamespace: "moda-interact",
  serviceName: "moda-interact-admin",
  environment: resolveDeploymentEnvironmentName(),
});

const SOURCE_SCHEMA_VERSION = 1;
const SOURCE_LANGUAGE_TAG = "en";
const TRANSLATION_REQUEST_TRANSACTION_MAX_WAIT_MS = 10_000;
const TRANSLATION_REQUEST_TRANSACTION_TIMEOUT_MS = 20_000;

const ACTIVE_RUN_STATUSES = [
  CommerceStoreCategoryTranslationRunStatus.PENDING,
  CommerceStoreCategoryTranslationRunStatus.PROCESSING,
  CommerceStoreCategoryTranslationRunStatus.READY_TO_PUBLISH,
] as const;

type TranslationTransaction = Prisma.TransactionClient;

export type RequestStoreCategoryTranslationResult = {
  runId: string;
  itemCount: number;
  localeCount: number;
  sourceHash: string;
};

function databaseCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
}

function canonicalSnapshot(input: {
  category: {
    id: string;
    editVersion: number;
    slug: string;
    displayName: string;
    description: string;
    displayOrder: number;
    referenceTaxonomySource: string | null;
    referenceTaxonomyVersion: string | null;
    referenceTaxonomyCategoryId: string | null;
  };
  template: {
    id: string;
    editVersion: number;
    key: string;
    displayName: string;
    description: string;
    promptText: string;
  };
  mappings: Array<{
    id: string;
    editVersion: number;
    conditionKey: string;
    displayName: string;
    shopifyTaxonomyCategoryId: string;
    weight: number;
  }>;
}) {
  return {
    schemaVersion: SOURCE_SCHEMA_VERSION,
    category: input.category,
    defaultTemplate: input.template,
    mappings: [...input.mappings].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
  };
}

function sourceHash(snapshot: ReturnType<typeof canonicalSnapshot>): string {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

function createTranslationItems(input: {
  runId: string;
  category: { id: string; displayName: string; description: string };
  mappings: Array<{ id: string; displayName: string }>;
  now: Date;
}) {
  const sources = [
    {
      entityKind: CommerceStoreCategoryTranslationEntityKind.CATEGORY,
      entityId: input.category.id,
      field: CommerceStoreCategoryTranslationField.DISPLAY_NAME,
      sourceText: input.category.displayName,
    },
    {
      entityKind: CommerceStoreCategoryTranslationEntityKind.CATEGORY,
      entityId: input.category.id,
      field: CommerceStoreCategoryTranslationField.DESCRIPTION,
      sourceText: input.category.description,
    },
    ...input.mappings.map((mapping) => ({
      entityKind: CommerceStoreCategoryTranslationEntityKind.MAPPING,
      entityId: mapping.id,
      field: CommerceStoreCategoryTranslationField.DISPLAY_NAME,
      sourceText: mapping.displayName,
    })),
  ];

  return MODA_SUPPORTED_LANGUAGE_TAGS.flatMap((targetLanguageTag) =>
    sources.map((source) => {
      const immediatelyAvailable =
        targetLanguageTag === SOURCE_LANGUAGE_TAG || source.sourceText.length === 0;
      return {
        runId: input.runId,
        sourceEntityKind: source.entityKind,
        sourceEntityId: source.entityId,
        sourceField: source.field,
        sourceLanguageTag: SOURCE_LANGUAGE_TAG,
        targetLanguageTag,
        sourceText: source.sourceText,
        translatedText: immediatelyAvailable ? source.sourceText : null,
        status: immediatelyAvailable
          ? CommerceStoreCategoryTranslationItemStatus.AVAILABLE
          : CommerceStoreCategoryTranslationItemStatus.PENDING,
        completedAt: immediatelyAvailable ? input.now : null,
      };
    }),
  );
}

export async function requestStoreCategoryTranslation(
  rawInput: {
    categoryId: unknown;
    expectedCategoryEditVersion: unknown;
    translationModelConfigurationId: unknown;
    operationId: unknown;
    reason: unknown;
  },
  principal: PlatformAdminPrincipal,
): Promise<RequestStoreCategoryTranslationResult> {
  if (principal.role !== "SUPER_ADMIN") {
    throw new Error("SUPER_ADMIN access is required.");
  }
  const input = validateRequestStoreCategoryTranslationInput(rawInput);
  const environment = resolveCommerceEnvironment() as CommerceEnvironment;
  const { prisma } = await import("@/lib/prisma");
  const startedAt = Date.now();

  try {
    // The development bypass bootstrap is durable setup, not part of the
    // translation-run atomicity boundary. Keeping it outside the interactive
    // transaction removes two remote database round trips from the transaction.
    await ensureDevelopmentPlatformAdmin(prisma, principal);

    const result = await prisma.$transaction(
      async (transaction: TranslationTransaction) => {
        const category = await transaction.commercePromptTemplateCategory.findUnique({
          where: { id: input.categoryId },
          select: {
            id: true,
            slug: true,
            displayName: true,
            description: true,
            displayOrder: true,
            referenceTaxonomySource: true,
            referenceTaxonomyVersion: true,
            referenceTaxonomyCategoryId: true,
            enabled: true,
            editVersion: true,
            defaultTemplate: {
              select: {
                id: true,
                key: true,
                displayName: true,
                description: true,
                promptText: true,
                enabled: true,
                editVersion: true,
                categoryId: true,
              },
            },
            taxonomyMappings: {
              orderBy: [{ id: "asc" }],
              select: {
                id: true,
                conditionKey: true,
                displayName: true,
                shopifyTaxonomyCategoryId: true,
                weight: true,
                editVersion: true,
              },
            },
            translationRuns: {
              where: { status: { in: [...ACTIVE_RUN_STATUSES] } },
              take: 1,
              select: { id: true, status: true },
            },
          },
        });
        if (!category) throw new Error("Store Category was not found.");
        if (category.editVersion !== input.expectedCategoryEditVersion) {
          throw new Error("Store Category changed; refresh and try again.");
        }
        if (category.enabled) {
          throw new Error("Disable this Store Category before requesting translation.");
        }
        if (category.translationRuns.length > 0) {
          throw new Error("A translation/enablement run is already active for this Store Category.");
        }
        const template = category.defaultTemplate;
        if (
          !template ||
          template.categoryId !== category.id ||
          !template.enabled ||
          !template.promptText.trim()
        ) {
          throw new Error("Choose a valid enabled default prompt template before translation.");
        }

        const mappings = category.taxonomyMappings.map((mapping) => {
          if (!mapping.conditionKey || !mapping.displayName?.trim()) {
            throw new Error(
              "Configure a merchant display name and condition key for every mapping before translation.",
            );
          }
          return {
            id: mapping.id,
            editVersion: mapping.editVersion,
            conditionKey: mapping.conditionKey,
            displayName: mapping.displayName.trim(),
            shopifyTaxonomyCategoryId: mapping.shopifyTaxonomyCategoryId,
            weight: mapping.weight,
          };
        });
        const promptValidation = validateStoreCategoryPromptTemplate({
          source: template.promptText,
          availableConditionKeys: mappings.map((mapping) => mapping.conditionKey),
        });
        if (!promptValidation.valid) {
          throw new Error(
            promptValidation.issues[0]?.message ??
              "The default conditional prompt is invalid.",
          );
        }

        const model = await transaction.commerceTranslationModelConfiguration.findFirst({
          where: {
            id: input.translationModelConfigurationId,
            environment,
            provider: TRANSLATION_PROVIDER,
            enabled: true,
          },
          select: {
            id: true,
            provider: true,
            providerModelId: true,
            editVersion: true,
            credential: { select: { id: true } },
          },
        });
        if (!model || !model.credential) {
          throw new Error(
            "The selected translation model is unavailable or its provider credential is not configured.",
          );
        }

        const snapshot = canonicalSnapshot({
          category: {
            id: category.id,
            editVersion: category.editVersion,
            slug: category.slug,
            displayName: category.displayName,
            description: category.description,
            displayOrder: category.displayOrder,
            referenceTaxonomySource: category.referenceTaxonomySource,
            referenceTaxonomyVersion: category.referenceTaxonomyVersion,
            referenceTaxonomyCategoryId: category.referenceTaxonomyCategoryId,
          },
          template: {
            id: template.id,
            editVersion: template.editVersion,
            key: template.key,
            displayName: template.displayName,
            description: template.description,
            promptText: template.promptText,
          },
          mappings,
        });
        const hash = sourceHash(snapshot);
        const run = await transaction.commerceStoreCategoryTranslationRun.create({
          data: {
            categoryId: category.id,
            environment,
            translationModelConfigurationId: model.id,
            provider: model.provider,
            providerModelId: model.providerModelId,
            modelConfigurationVersion: model.editVersion,
            sourceSchemaVersion: SOURCE_SCHEMA_VERSION,
            sourceHash: hash,
            sourceSnapshot: snapshot as Prisma.InputJsonObject,
            status: CommerceStoreCategoryTranslationRunStatus.PENDING,
            requestedByAdminId: principal.id,
          },
          select: { id: true },
        });
        const now = new Date();
        const items = createTranslationItems({
          runId: run.id,
          category: {
            id: category.id,
            displayName: category.displayName,
            description: category.description,
          },
          mappings,
          now,
        });
        await transaction.commerceStoreCategoryTranslationItem.createMany({
          data: items,
        });
        await transaction.commerceAuditEvent.create({
          data: {
            actorType: CommerceAuditActorType.PLATFORM_ADMIN,
            actorAdminId: principal.id,
            operationId: input.operationId,
            action: CommerceAuditAction.REQUEST_PROMPT_TEMPLATE_CATEGORY_TRANSLATION,
            environment,
            promptTemplateCategoryId: category.id,
            promptTemplateId: template.id,
            translationModelConfigurationId: model.id,
            reason: input.reason,
            metadata: {
              translationRunId: run.id,
              sourceHash: hash,
              sourceSchemaVersion: SOURCE_SCHEMA_VERSION,
              mappingCount: mappings.length,
              localeCount: MODA_SUPPORTED_LANGUAGE_TAGS.length,
              itemCount: items.length,
              provider: model.provider,
              providerModelId: model.providerModelId,
              modelConfigurationVersion: model.editVersion,
            },
          },
        });
        return {
          runId: run.id,
          itemCount: items.length,
          localeCount: MODA_SUPPORTED_LANGUAGE_TAGS.length,
          sourceHash: hash,
        };
      },
      {
        isolationLevel: "Serializable",
        maxWait: TRANSLATION_REQUEST_TRANSACTION_MAX_WAIT_MS,
        timeout: TRANSLATION_REQUEST_TRANSACTION_TIMEOUT_MS,
      },
    );

    logger.info("admin.store_category.translation_requested", {
      categoryId: input.categoryId,
      translationRunId: result.runId,
      translationModelConfigurationId: input.translationModelConfigurationId,
      itemCount: result.itemCount,
      localeCount: result.localeCount,
      durationMs: Date.now() - startedAt,
    });
    return result;
  } catch (cause) {
    logger.error("admin.store_category.translation_request_failed", {
      categoryId: input.categoryId,
      translationModelConfigurationId: input.translationModelConfigurationId,
      databaseCode: databaseCode(cause) ?? null,
      durationMs: Date.now() - startedAt,
    });
    if (databaseCode(cause) === "P2002") {
      throw new Error(
        "A translation/enablement run is already active for this Store Category.",
      );
    }
    if (databaseCode(cause) === "P2034") {
      throw new Error("Store Category changed; refresh and try again.");
    }
    if (databaseCode(cause) === "P2028") {
      throw new Error(
        "The translation/enablement request timed out while writing to PostgreSQL. Retry the request.",
      );
    }
    throw cause;
  }
}
