import { createLogger } from "@modainteract/moda-interact-shared/logging";
import {
  CommerceAuditAction,
  CommerceAuditActorType,
  type CommerceEnvironment,
  type Prisma,
} from "@prisma/client";
import type { PlatformAdminPrincipal } from "@/lib/auth/platform-admin";
import { ensureDevelopmentPlatformAdmin } from "@/lib/auth/development-platform-admin";
import { resolveDeploymentEnvironmentName } from "@/lib/auth/environment";
import { loadActiveCredentialKeyring } from "./openrouter-credential-keyring.ts";
import { resolveCommerceEnvironment } from "./openrouter-credential-environment.ts";
import {
  TRANSLATION_CONFIGURATION_ERRORS,
  translationCredentialStatus,
  translationCredentialStatusSelect,
  type TranslationProviderCredentialStatus,
} from "./translation-configuration.ts";
import {
  sealTranslationProviderCredential,
  TRANSLATION_CREDENTIAL_ENCRYPTION_UNAVAILABLE,
} from "./translation-credential-crypto.ts";
import {
  TRANSLATION_PROVIDER,
  validateTranslationProviderCredentialMutation,
} from "./translation-configuration-validation.ts";

const logger = createLogger({
  serviceNamespace: "moda-interact",
  serviceName: "moda-interact-admin",
  environment: resolveDeploymentEnvironmentName(),
});

type Tx = Prisma.TransactionClient;

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

function sealCredential(input: {
  environment: CommerceEnvironment;
  secret: string;
}) {
  try {
    const active = loadActiveCredentialKeyring();
    return sealTranslationProviderCredential({
      environment: input.environment,
      provider: TRANSLATION_PROVIDER,
      secret: input.secret,
      keyring: active.keyring,
      activeKeyId: active.activeKeyId,
    });
  } catch (cause) {
    if (
      cause instanceof Error &&
      cause.message === "Translation provider credential is invalid."
    ) {
      throw cause;
    }
    throw new Error(TRANSLATION_CREDENTIAL_ENCRYPTION_UNAVAILABLE);
  }
}

async function statusInTransaction(
  transaction: Tx,
  environment: CommerceEnvironment,
): Promise<TranslationProviderCredentialStatus> {
  const row = await transaction.commerceTranslationProviderCredential.findUnique({
    where: {
      environment_provider: {
        environment,
        provider: TRANSLATION_PROVIDER,
      },
    },
    select: translationCredentialStatusSelect,
  });
  return translationCredentialStatus(environment, row);
}

export async function setTranslationProviderCredential(
  input: { operationId: unknown; reason: unknown; secret: unknown },
  principal: PlatformAdminPrincipal,
): Promise<TranslationProviderCredentialStatus> {
  requireSuperAdmin(principal);
  const validated = validateTranslationProviderCredentialMutation(input);
  if (!validated.secret) {
    throw new Error("Translation provider credential is invalid.");
  }
  const environment = resolveCommerceEnvironment() as CommerceEnvironment;
  const sealed = sealCredential({ environment, secret: validated.secret });
  const { prisma } = await import("@/lib/prisma");

  try {
    const result = await prisma.$transaction(
      async (transaction) => {
        await ensureDevelopmentPlatformAdmin(transaction, principal);
        const existing = await transaction.commerceTranslationProviderCredential.findUnique({
          where: {
            environment_provider: {
              environment,
              provider: TRANSLATION_PROVIDER,
            },
          },
          select: { id: true },
        });
        if (existing) {
          throw new Error(
            TRANSLATION_CONFIGURATION_ERRORS.credentialAlreadyConfigured,
          );
        }
        await transaction.commerceTranslationProviderCredential.create({
          data: {
            environment,
            provider: TRANSLATION_PROVIDER,
            ciphertext: Buffer.from(sealed.ciphertext),
            nonce: Buffer.from(sealed.nonce),
            authTag: Buffer.from(sealed.authTag),
            keyId: sealed.keyId,
            editVersion: 1,
            updatedByAdminId: principal.id,
          },
        });
        await transaction.commerceAuditEvent.create({
          data: {
            actorType: CommerceAuditActorType.PLATFORM_ADMIN,
            actorAdminId: principal.id,
            operationId: validated.operationId,
            action: CommerceAuditAction.SET_TRANSLATION_PROVIDER_CREDENTIAL,
            environment,
            reason: validated.reason,
            metadata: {
              provider: TRANSLATION_PROVIDER,
              editVersion: 1,
            },
          },
        });
        return statusInTransaction(transaction, environment);
      },
      { isolationLevel: "Serializable" },
    );
    logger.info("admin.translation_provider_credential.updated", {
      outcome: "set",
      environment,
      provider: TRANSLATION_PROVIDER,
      editVersion: result.editVersion,
    });
    return result;
  } catch (cause) {
    logger.error("admin.translation_provider_credential.update_failed", {
      operation: "set",
      environment,
      provider: TRANSLATION_PROVIDER,
      databaseCode: databaseCode(cause) ?? null,
    });
    if (databaseCode(cause) === "P2002") {
      throw new Error(
        TRANSLATION_CONFIGURATION_ERRORS.credentialAlreadyConfigured,
      );
    }
    if (databaseCode(cause) === "P2034") {
      throw new Error(TRANSLATION_CONFIGURATION_ERRORS.credentialChanged);
    }
    throw cause;
  }
}

export async function replaceTranslationProviderCredential(
  input: {
    operationId: unknown;
    reason: unknown;
    secret: unknown;
    expectedEditVersion: unknown;
  },
  principal: PlatformAdminPrincipal,
): Promise<TranslationProviderCredentialStatus> {
  requireSuperAdmin(principal);
  const validated = validateTranslationProviderCredentialMutation(input);
  const secret = validated.secret;
  const expectedEditVersion = validated.expectedEditVersion;
  if (!secret || expectedEditVersion === undefined) {
    throw new Error("Translation provider credential is invalid.");
  }
  const environment = resolveCommerceEnvironment() as CommerceEnvironment;
  const sealed = sealCredential({ environment, secret });
  const { prisma } = await import("@/lib/prisma");

  try {
    const result = await prisma.$transaction(
      async (transaction) => {
        await ensureDevelopmentPlatformAdmin(transaction, principal);
        const updated = await transaction.commerceTranslationProviderCredential.updateMany({
          where: {
            environment,
            provider: TRANSLATION_PROVIDER,
            editVersion: expectedEditVersion,
          },
          data: {
            ciphertext: Buffer.from(sealed.ciphertext),
            nonce: Buffer.from(sealed.nonce),
            authTag: Buffer.from(sealed.authTag),
            keyId: sealed.keyId,
            editVersion: { increment: 1 },
            updatedByAdminId: principal.id,
          },
        });
        if (updated.count !== 1) {
          const exists = await transaction.commerceTranslationProviderCredential.findUnique({
            where: {
              environment_provider: {
                environment,
                provider: TRANSLATION_PROVIDER,
              },
            },
            select: { id: true },
          });
          throw new Error(
            exists
              ? TRANSLATION_CONFIGURATION_ERRORS.credentialChanged
              : TRANSLATION_CONFIGURATION_ERRORS.credentialNotConfigured,
          );
        }
        await transaction.commerceAuditEvent.create({
          data: {
            actorType: CommerceAuditActorType.PLATFORM_ADMIN,
            actorAdminId: principal.id,
            operationId: validated.operationId,
            action: CommerceAuditAction.REPLACE_TRANSLATION_PROVIDER_CREDENTIAL,
            environment,
            reason: validated.reason,
            metadata: {
              provider: TRANSLATION_PROVIDER,
              previousEditVersion: expectedEditVersion,
              editVersion: expectedEditVersion + 1,
            },
          },
        });
        return statusInTransaction(transaction, environment);
      },
      { isolationLevel: "Serializable" },
    );
    logger.info("admin.translation_provider_credential.updated", {
      outcome: "replaced",
      environment,
      provider: TRANSLATION_PROVIDER,
      editVersion: result.editVersion,
    });
    return result;
  } catch (cause) {
    logger.error("admin.translation_provider_credential.update_failed", {
      operation: "replace",
      environment,
      provider: TRANSLATION_PROVIDER,
      databaseCode: databaseCode(cause) ?? null,
    });
    if (databaseCode(cause) === "P2034") {
      throw new Error(TRANSLATION_CONFIGURATION_ERRORS.credentialChanged);
    }
    throw cause;
  }
}

export async function removeTranslationProviderCredential(
  input: {
    operationId: unknown;
    reason: unknown;
    expectedEditVersion: unknown;
  },
  principal: PlatformAdminPrincipal,
): Promise<TranslationProviderCredentialStatus> {
  requireSuperAdmin(principal);
  const validated = validateTranslationProviderCredentialMutation(input);
  if (validated.expectedEditVersion === undefined) {
    throw new Error("expectedEditVersion is invalid.");
  }
  const environment = resolveCommerceEnvironment() as CommerceEnvironment;
  const { prisma } = await import("@/lib/prisma");

  try {
    const result = await prisma.$transaction(
      async (transaction) => {
        await ensureDevelopmentPlatformAdmin(transaction, principal);
        const existing = await transaction.commerceTranslationProviderCredential.findUnique({
          where: {
            environment_provider: {
              environment,
              provider: TRANSLATION_PROVIDER,
            },
          },
          select: translationCredentialStatusSelect,
        });
        if (!existing) {
          throw new Error(
            TRANSLATION_CONFIGURATION_ERRORS.credentialNotConfigured,
          );
        }
        if (existing.editVersion !== validated.expectedEditVersion) {
          throw new Error(TRANSLATION_CONFIGURATION_ERRORS.credentialChanged);
        }
        if (existing._count.models > 0) {
          throw new Error(TRANSLATION_CONFIGURATION_ERRORS.credentialInUse);
        }
        const deleted = await transaction.commerceTranslationProviderCredential.deleteMany({
          where: {
            environment,
            provider: TRANSLATION_PROVIDER,
            editVersion: validated.expectedEditVersion,
          },
        });
        if (deleted.count !== 1) {
          throw new Error(TRANSLATION_CONFIGURATION_ERRORS.credentialChanged);
        }
        await transaction.commerceAuditEvent.create({
          data: {
            actorType: CommerceAuditActorType.PLATFORM_ADMIN,
            actorAdminId: principal.id,
            operationId: validated.operationId,
            action: CommerceAuditAction.REMOVE_TRANSLATION_PROVIDER_CREDENTIAL,
            environment,
            reason: validated.reason,
            metadata: {
              provider: TRANSLATION_PROVIDER,
              previousEditVersion: validated.expectedEditVersion,
            },
          },
        });
        return translationCredentialStatus(environment, null);
      },
      { isolationLevel: "Serializable" },
    );
    logger.info("admin.translation_provider_credential.updated", {
      outcome: "removed",
      environment,
      provider: TRANSLATION_PROVIDER,
    });
    return result;
  } catch (cause) {
    logger.error("admin.translation_provider_credential.update_failed", {
      operation: "remove",
      environment,
      provider: TRANSLATION_PROVIDER,
      databaseCode: databaseCode(cause) ?? null,
    });
    if (databaseCode(cause) === "P2003") {
      throw new Error(TRANSLATION_CONFIGURATION_ERRORS.credentialInUse);
    }
    if (databaseCode(cause) === "P2034") {
      throw new Error(TRANSLATION_CONFIGURATION_ERRORS.credentialChanged);
    }
    throw cause;
  }
}
