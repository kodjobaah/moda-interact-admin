import { createLogger } from "@modainteract/moda-interact-shared/logging";
import {
  CommerceAuditAction,
  CommerceAuditActorType,
  type CommerceEnvironment,
} from "@prisma/client";
import type { PlatformAdminPrincipal } from "@/lib/auth/platform-admin";
import { ensureDevelopmentPlatformAdmin } from "@/lib/auth/development-platform-admin";
import { resolveDeploymentEnvironmentName } from "@/lib/auth/environment";
import { resolveCommerceEnvironment } from "./openrouter-credential-environment.ts";
import {
  TRANSLATION_CONFIGURATION_ERRORS,
  translationModelSelect,
  translationModelView,
  type TranslationModelConfigurationView,
} from "./translation-configuration.ts";
import {
  TRANSLATION_PROVIDER,
  validateTranslationModelAutomaticDefaultMutation,
  validateTranslationModelConfigurationMutation,
  validateTranslationModelEnabledMutation,
} from "./translation-configuration-validation.ts";

const logger = createLogger({
  serviceNamespace: "moda-interact",
  serviceName: "moda-interact-admin",
  environment: resolveDeploymentEnvironmentName(),
});

function requireSuperAdmin(principal: PlatformAdminPrincipal): void {
  if (principal.role !== "SUPER_ADMIN") {
    throw new Error(TRANSLATION_CONFIGURATION_ERRORS.superAdminRequired);
  }
}

function databaseCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
}

export async function createTranslationModelConfiguration(
  input: {
    displayName: unknown;
    providerModelId: unknown;
    operationId: unknown;
    reason: unknown;
  },
  principal: PlatformAdminPrincipal,
): Promise<TranslationModelConfigurationView> {
  requireSuperAdmin(principal);
  const validated = validateTranslationModelConfigurationMutation(input);
  const environment = resolveCommerceEnvironment() as CommerceEnvironment;
  const { prisma } = await import("@/lib/prisma");

  try {
    const result = await prisma.$transaction(
      async (transaction) => {
        await ensureDevelopmentPlatformAdmin(transaction, principal);
        const credential = await transaction.commerceTranslationProviderCredential.findUnique({
          where: {
            environment_provider: {
              environment,
              provider: TRANSLATION_PROVIDER,
            },
          },
          select: { id: true },
        });
        if (!credential) {
          throw new Error(
            TRANSLATION_CONFIGURATION_ERRORS.credentialNotConfigured,
          );
        }
        const created = await transaction.commerceTranslationModelConfiguration.create({
          data: {
            environment,
            provider: TRANSLATION_PROVIDER,
            providerModelId: validated.providerModelId,
            displayName: validated.displayName,
            enabled: true,
            editVersion: 1,
            createdByAdminId: principal.id,
            updatedByAdminId: principal.id,
          },
          select: translationModelSelect,
        });
        await transaction.commerceAuditEvent.create({
          data: {
            actorType: CommerceAuditActorType.PLATFORM_ADMIN,
            actorAdminId: principal.id,
            operationId: validated.operationId,
            action: CommerceAuditAction.CREATE_TRANSLATION_MODEL_CONFIGURATION,
            environment,
            translationModelConfigurationId: created.id,
            reason: validated.reason,
            metadata: {
              provider: TRANSLATION_PROVIDER,
              providerModelId: created.providerModelId,
              displayName: created.displayName,
              enabled: true,
              editVersion: 1,
            },
          },
        });
        return translationModelView(created);
      },
      { isolationLevel: "Serializable" },
    );
    logger.info("admin.translation_model_configuration.created", {
      environment,
      provider: TRANSLATION_PROVIDER,
      modelConfigurationId: result.id,
      providerModelId: result.providerModelId,
    });
    return result;
  } catch (cause) {
    logger.error("admin.translation_model_configuration.create_failed", {
      environment,
      provider: TRANSLATION_PROVIDER,
      databaseCode: databaseCode(cause) ?? null,
    });
    if (databaseCode(cause) === "P2002") {
      throw new Error(TRANSLATION_CONFIGURATION_ERRORS.modelDuplicate);
    }
    if (databaseCode(cause) === "P2003") {
      throw new Error(
        TRANSLATION_CONFIGURATION_ERRORS.credentialNotConfigured,
      );
    }
    if (databaseCode(cause) === "P2034") {
      throw new Error(TRANSLATION_CONFIGURATION_ERRORS.modelChanged);
    }
    throw cause;
  }
}

export async function updateTranslationModelConfiguration(
  input: {
    id: unknown;
    displayName: unknown;
    providerModelId: unknown;
    operationId: unknown;
    reason: unknown;
    expectedEditVersion: unknown;
  },
  principal: PlatformAdminPrincipal,
): Promise<TranslationModelConfigurationView> {
  requireSuperAdmin(principal);
  const validated = validateTranslationModelConfigurationMutation(input);
  if (!validated.id || validated.expectedEditVersion === undefined) {
    throw new Error("Translation model configuration input is invalid.");
  }
  const environment = resolveCommerceEnvironment() as CommerceEnvironment;
  const { prisma } = await import("@/lib/prisma");

  try {
    const result = await prisma.$transaction(
      async (transaction) => {
        await ensureDevelopmentPlatformAdmin(transaction, principal);
        const existing = await transaction.commerceTranslationModelConfiguration.findFirst({
          where: {
            id: validated.id,
            environment,
            provider: TRANSLATION_PROVIDER,
          },
          select: { id: true, editVersion: true },
        });
        if (!existing) {
          throw new Error(TRANSLATION_CONFIGURATION_ERRORS.modelNotFound);
        }
        if (existing.editVersion !== validated.expectedEditVersion) {
          throw new Error(TRANSLATION_CONFIGURATION_ERRORS.modelChanged);
        }
        const updated = await transaction.commerceTranslationModelConfiguration.updateMany({
          where: {
            id: existing.id,
            environment,
            provider: TRANSLATION_PROVIDER,
            editVersion: validated.expectedEditVersion,
          },
          data: {
            displayName: validated.displayName,
            providerModelId: validated.providerModelId,
            updatedByAdminId: principal.id,
            editVersion: { increment: 1 },
          },
        });
        if (updated.count !== 1) {
          throw new Error(TRANSLATION_CONFIGURATION_ERRORS.modelChanged);
        }
        const row = await transaction.commerceTranslationModelConfiguration.findUniqueOrThrow({
          where: { id: existing.id },
          select: translationModelSelect,
        });
        await transaction.commerceAuditEvent.create({
          data: {
            actorType: CommerceAuditActorType.PLATFORM_ADMIN,
            actorAdminId: principal.id,
            operationId: validated.operationId,
            action: CommerceAuditAction.UPDATE_TRANSLATION_MODEL_CONFIGURATION,
            environment,
            translationModelConfigurationId: row.id,
            reason: validated.reason,
            metadata: {
              provider: TRANSLATION_PROVIDER,
              providerModelId: row.providerModelId,
              displayName: row.displayName,
              previousEditVersion: validated.expectedEditVersion,
              editVersion: row.editVersion,
            },
          },
        });
        return translationModelView(row);
      },
      { isolationLevel: "Serializable" },
    );
    logger.info("admin.translation_model_configuration.updated", {
      environment,
      provider: TRANSLATION_PROVIDER,
      modelConfigurationId: result.id,
      providerModelId: result.providerModelId,
      editVersion: result.editVersion,
    });
    return result;
  } catch (cause) {
    logger.error("admin.translation_model_configuration.update_failed", {
      environment,
      provider: TRANSLATION_PROVIDER,
      modelConfigurationId: validated.id ?? null,
      databaseCode: databaseCode(cause) ?? null,
    });
    if (databaseCode(cause) === "P2002") {
      throw new Error(TRANSLATION_CONFIGURATION_ERRORS.modelDuplicate);
    }
    if (databaseCode(cause) === "P2034") {
      throw new Error(TRANSLATION_CONFIGURATION_ERRORS.modelChanged);
    }
    throw cause;
  }
}

export async function setTranslationModelConfigurationAutomaticDefault(
  input: {
    id: unknown;
    operationId: unknown;
    reason: unknown;
    expectedEditVersion: unknown;
  },
  principal: PlatformAdminPrincipal,
): Promise<TranslationModelConfigurationView> {
  requireSuperAdmin(principal);
  const validated = validateTranslationModelAutomaticDefaultMutation(input);
  const environment = resolveCommerceEnvironment() as CommerceEnvironment;
  const { prisma } = await import("@/lib/prisma");

  try {
    const result = await prisma.$transaction(
      async (transaction) => {
        await ensureDevelopmentPlatformAdmin(transaction, principal);
        const existing = await transaction.commerceTranslationModelConfiguration.findFirst({
          where: {
            id: validated.id,
            environment,
            provider: TRANSLATION_PROVIDER,
          },
          select: {
            id: true,
            enabled: true,
            automaticDefault: true,
            editVersion: true,
          },
        });
        if (!existing) {
          throw new Error(TRANSLATION_CONFIGURATION_ERRORS.modelNotFound);
        }
        if (existing.editVersion !== validated.expectedEditVersion) {
          throw new Error(TRANSLATION_CONFIGURATION_ERRORS.modelChanged);
        }
        if (!existing.enabled) {
          throw new Error(
            TRANSLATION_CONFIGURATION_ERRORS.modelAutomaticDefaultRequiresEnabled,
          );
        }
        if (existing.automaticDefault) {
          const current = await transaction.commerceTranslationModelConfiguration.findUniqueOrThrow({
            where: { id: existing.id },
            select: translationModelSelect,
          });
          return translationModelView(current);
        }

        const previousDefault =
          await transaction.commerceTranslationModelConfiguration.findFirst({
            where: {
              environment,
              provider: TRANSLATION_PROVIDER,
              automaticDefault: true,
              id: { not: existing.id },
            },
            select: {
              id: true,
              providerModelId: true,
              editVersion: true,
            },
          });

        if (previousDefault) {
          const cleared =
            await transaction.commerceTranslationModelConfiguration.updateMany({
              where: {
                id: previousDefault.id,
                environment,
                provider: TRANSLATION_PROVIDER,
                automaticDefault: true,
                editVersion: previousDefault.editVersion,
              },
              data: {
                automaticDefault: false,
                updatedByAdminId: principal.id,
                editVersion: { increment: 1 },
              },
            });
          if (cleared.count !== 1) {
            throw new Error(TRANSLATION_CONFIGURATION_ERRORS.modelChanged);
          }
        }

        const selected =
          await transaction.commerceTranslationModelConfiguration.updateMany({
            where: {
              id: existing.id,
              environment,
              provider: TRANSLATION_PROVIDER,
              enabled: true,
              automaticDefault: false,
              editVersion: validated.expectedEditVersion,
            },
            data: {
              automaticDefault: true,
              updatedByAdminId: principal.id,
              editVersion: { increment: 1 },
            },
          });
        if (selected.count !== 1) {
          throw new Error(TRANSLATION_CONFIGURATION_ERRORS.modelChanged);
        }

        const row = await transaction.commerceTranslationModelConfiguration.findUniqueOrThrow({
          where: { id: existing.id },
          select: translationModelSelect,
        });
        await transaction.commerceAuditEvent.create({
          data: {
            actorType: CommerceAuditActorType.PLATFORM_ADMIN,
            actorAdminId: principal.id,
            operationId: validated.operationId,
            action: CommerceAuditAction.UPDATE_TRANSLATION_MODEL_CONFIGURATION,
            environment,
            translationModelConfigurationId: row.id,
            reason: validated.reason,
            metadata: {
              change: "automaticDefault",
              provider: TRANSLATION_PROVIDER,
              providerModelId: row.providerModelId,
              displayName: row.displayName,
              previousAutomaticDefaultModelConfigurationId:
                previousDefault?.id ?? null,
              previousAutomaticDefaultProviderModelId:
                previousDefault?.providerModelId ?? null,
              previousAutomaticDefaultEditVersion:
                previousDefault?.editVersion ?? null,
              previousSelectedEditVersion: validated.expectedEditVersion,
              editVersion: row.editVersion,
              automaticDefault: true,
            },
          },
        });
        return translationModelView(row);
      },
      { isolationLevel: "Serializable" },
    );
    logger.info("admin.translation_model_configuration.automatic_default_set", {
      environment,
      provider: TRANSLATION_PROVIDER,
      modelConfigurationId: result.id,
      providerModelId: result.providerModelId,
      editVersion: result.editVersion,
    });
    return result;
  } catch (cause) {
    logger.error("admin.translation_model_configuration.automatic_default_failed", {
      environment,
      provider: TRANSLATION_PROVIDER,
      modelConfigurationId: validated.id,
      databaseCode: databaseCode(cause) ?? null,
    });
    if (databaseCode(cause) === "P2002" || databaseCode(cause) === "P2034") {
      throw new Error(TRANSLATION_CONFIGURATION_ERRORS.modelChanged);
    }
    throw cause;
  }
}

export async function setTranslationModelConfigurationEnabled(
  input: {
    id: unknown;
    enabled: unknown;
    operationId: unknown;
    reason: unknown;
    expectedEditVersion: unknown;
  },
  principal: PlatformAdminPrincipal,
): Promise<TranslationModelConfigurationView> {
  requireSuperAdmin(principal);
  const validated = validateTranslationModelEnabledMutation(input);
  const environment = resolveCommerceEnvironment() as CommerceEnvironment;
  const { prisma } = await import("@/lib/prisma");

  try {
    const result = await prisma.$transaction(
      async (transaction) => {
        await ensureDevelopmentPlatformAdmin(transaction, principal);
        const existing = await transaction.commerceTranslationModelConfiguration.findFirst({
          where: {
            id: validated.id,
            environment,
            provider: TRANSLATION_PROVIDER,
          },
          select: {
            id: true,
            enabled: true,
            automaticDefault: true,
            editVersion: true,
          },
        });
        if (!existing) {
          throw new Error(TRANSLATION_CONFIGURATION_ERRORS.modelNotFound);
        }
        if (existing.editVersion !== validated.expectedEditVersion) {
          throw new Error(TRANSLATION_CONFIGURATION_ERRORS.modelChanged);
        }
        if (!validated.enabled && existing.automaticDefault) {
          throw new Error(
            TRANSLATION_CONFIGURATION_ERRORS.modelAutomaticDefaultDisableBlocked,
          );
        }
        const updated = await transaction.commerceTranslationModelConfiguration.updateMany({
          where: {
            id: existing.id,
            environment,
            provider: TRANSLATION_PROVIDER,
            editVersion: validated.expectedEditVersion,
            ...(validated.enabled ? {} : { automaticDefault: false }),
          },
          data: {
            enabled: validated.enabled,
            updatedByAdminId: principal.id,
            editVersion: { increment: 1 },
          },
        });
        if (updated.count !== 1) {
          throw new Error(TRANSLATION_CONFIGURATION_ERRORS.modelChanged);
        }
        const row = await transaction.commerceTranslationModelConfiguration.findUniqueOrThrow({
          where: { id: existing.id },
          select: translationModelSelect,
        });
        await transaction.commerceAuditEvent.create({
          data: {
            actorType: CommerceAuditActorType.PLATFORM_ADMIN,
            actorAdminId: principal.id,
            operationId: validated.operationId,
            action: validated.enabled
              ? CommerceAuditAction.ENABLE_TRANSLATION_MODEL_CONFIGURATION
              : CommerceAuditAction.DISABLE_TRANSLATION_MODEL_CONFIGURATION,
            environment,
            translationModelConfigurationId: row.id,
            reason: validated.reason,
            metadata: {
              provider: TRANSLATION_PROVIDER,
              providerModelId: row.providerModelId,
              previousEnabled: existing.enabled,
              enabled: row.enabled,
              previousEditVersion: validated.expectedEditVersion,
              editVersion: row.editVersion,
            },
          },
        });
        return translationModelView(row);
      },
      { isolationLevel: "Serializable" },
    );
    logger.info(
      validated.enabled
        ? "admin.translation_model_configuration.enabled"
        : "admin.translation_model_configuration.disabled",
      {
        environment,
        provider: TRANSLATION_PROVIDER,
        modelConfigurationId: result.id,
        providerModelId: result.providerModelId,
        editVersion: result.editVersion,
      },
    );
    return result;
  } catch (cause) {
    logger.error("admin.translation_model_configuration.status_failed", {
      environment,
      provider: TRANSLATION_PROVIDER,
      modelConfigurationId: validated.id,
      targetEnabled: validated.enabled,
      databaseCode: databaseCode(cause) ?? null,
    });
    if (databaseCode(cause) === "P2034") {
      throw new Error(TRANSLATION_CONFIGURATION_ERRORS.modelChanged);
    }
    throw cause;
  }
}
