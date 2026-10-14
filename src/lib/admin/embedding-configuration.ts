import {
  CommerceAuditAction,
  CommerceAuditActorType,
  CommerceEmbeddingPurpose,
  type CommerceEnvironment,
  type Prisma,
} from "@prisma/client";
import type { PlatformAdminPrincipal } from "@/lib/auth/platform-admin";
import { ensureDevelopmentPlatformAdmin } from "@/lib/auth/development-platform-admin";
import {
  createCommerceEmbeddingCredentialAad,
  decryptCredential,
  encryptCredential,
  parseCredentialKeyring,
} from "@modainteract/moda-interact-shared/security/credentials/node";
import {
  EMBEDDING_CREDENTIAL_ENCRYPTION_UNAVAILABLE,
  validateEmbeddingConfigurationMutation,
  validateEmbeddingConfigurationRemoval,
  validateEmbeddingCredentialSecret,
} from "./embedding-configuration-validation.ts";
import { loadActiveSharedCredentialKeyring } from "./shared-credential-keyring.ts";
import { resolveCommerceEnvironment } from "./openrouter-credential-environment.ts";

export const EMBEDDING_PURPOSES = [
  CommerceEmbeddingPurpose.MERCHANT_KNOWLEDGE,
  CommerceEmbeddingPurpose.REFERENCE_TAXONOMY,
] as const;

export type EmbeddingConfigurationStatus = {
  environment: CommerceEnvironment;
  purpose: CommerceEmbeddingPurpose;
  configured: boolean;
  embeddingProvider: string | null;
  embeddingModel: string | null;
  embeddingDimensions: number | null;
  embeddingIndexVersion: string | null;
  editVersion: number | null;
  updatedAt: string | null;
  updatedByAdminId: string | null;
};


export type EmbeddingRuntimeConfiguration = {
  environment: CommerceEnvironment;
  purpose: CommerceEmbeddingPurpose;
  embeddingProvider: string;
  embeddingModel: string;
  embeddingDimensions: number;
  embeddingIndexVersion: string;
  apiKey: string;
  editVersion: number;
};

export const EMBEDDING_CONFIGURATION_ERRORS = {
  changed: "Embedding configuration changed. Refresh and try again.",
  alreadyConfigured: "Embedding configuration is already configured.",
  notConfigured: "Embedding configuration is not configured.",
  credentialRequired: "An embedding credential is required for a new configuration.",
  providerCredentialRequired:
    "A new embedding credential is required when the provider changes.",
  superAdminRequired: "SUPER_ADMIN access is required.",
} as const;

type ConfigurationTransaction = Prisma.TransactionClient;

type ConfigurationRecord = {
  purpose: CommerceEmbeddingPurpose;
  embeddingProvider: string;
  embeddingModel: string;
  embeddingDimensions: number;
  embeddingIndexVersion: string;
  editVersion: number;
  updatedAt: Date;
  updatedByAdminId: string;
};

function requireSuperAdmin(principal: PlatformAdminPrincipal): void {
  if (principal.role !== "SUPER_ADMIN") {
    throw new Error(EMBEDDING_CONFIGURATION_ERRORS.superAdminRequired);
  }
}

function statusFromRecord(
  environment: CommerceEnvironment,
  purpose: CommerceEmbeddingPurpose,
  row: ConfigurationRecord | null,
): EmbeddingConfigurationStatus {
  return {
    environment,
    purpose,
    configured: row !== null,
    embeddingProvider: row?.embeddingProvider ?? null,
    embeddingModel: row?.embeddingModel ?? null,
    embeddingDimensions: row?.embeddingDimensions ?? null,
    embeddingIndexVersion: row?.embeddingIndexVersion ?? null,
    editVersion: row?.editVersion ?? null,
    updatedAt: row?.updatedAt.toISOString() ?? null,
    updatedByAdminId: row?.updatedByAdminId ?? null,
  };
}

const statusSelect = {
  purpose: true,
  embeddingProvider: true,
  embeddingModel: true,
  embeddingDimensions: true,
  embeddingIndexVersion: true,
  editVersion: true,
  updatedAt: true,
  updatedByAdminId: true,
} satisfies Prisma.CommerceEmbeddingConfigurationSelect;

export async function getEmbeddingConfigurationStatuses(): Promise<
  EmbeddingConfigurationStatus[]
> {
  const [{ requirePlatformAdminRead }, { prisma }] = await Promise.all([
    import("@/lib/auth/platform-admin"),
    import("@/lib/prisma"),
  ]);
  await requirePlatformAdminRead();
  const environment = resolveCommerceEnvironment();
  const rows = await prisma.commerceEmbeddingConfiguration.findMany({
    where: { environment },
    select: statusSelect,
  });
  const byPurpose = new Map(rows.map((row) => [row.purpose, row]));
  return EMBEDDING_PURPOSES.map((purpose) =>
    statusFromRecord(environment, purpose, byPurpose.get(purpose) ?? null),
  );
}

export async function getEmbeddingRuntimeConfiguration(
  purpose: CommerceEmbeddingPurpose,
): Promise<EmbeddingRuntimeConfiguration> {
  const environment = resolveCommerceEnvironment();
  const { prisma } = await import("@/lib/prisma");
  const row = await prisma.commerceEmbeddingConfiguration.findUnique({
    where: { environment_purpose: { environment, purpose } },
    select: {
      embeddingProvider: true,
      embeddingModel: true,
      embeddingDimensions: true,
      embeddingIndexVersion: true,
      ciphertext: true,
      nonce: true,
      authTag: true,
      keyId: true,
      editVersion: true,
    },
  });
  if (!row) {
    throw new Error(EMBEDDING_CONFIGURATION_ERRORS.notConfigured);
  }

  // Readers require only the canonical keyring; the stored envelope selects the key.
  // Do not require an active writer key when recovering an existing credential.
  let apiKey: string;
  try {
    const keyring = parseCredentialKeyring(process.env.COMMERCE_CONNECTION_KEYS_JSON);
    const aad = createCommerceEmbeddingCredentialAad({
      environment,
      purpose,
      provider: row.embeddingProvider,
      keyId: row.keyId,
    });
    apiKey = validateEmbeddingCredentialSecret(decryptCredential({
      keyring,
      envelope: {
        ciphertext: new Uint8Array(row.ciphertext),
        nonce: new Uint8Array(row.nonce),
        authTag: new Uint8Array(row.authTag),
        keyId: row.keyId,
      },
      aad,
    }));
  } catch {
    throw new Error(EMBEDDING_CREDENTIAL_ENCRYPTION_UNAVAILABLE);
  }

  return {
    environment,
    purpose,
    embeddingProvider: row.embeddingProvider,
    embeddingModel: row.embeddingModel,
    embeddingDimensions: row.embeddingDimensions,
    embeddingIndexVersion: row.embeddingIndexVersion,
    apiKey,
    editVersion: row.editVersion,
  };
}

function databaseCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
}

function encryptValidatedEmbeddingSecret(input: {
  environment: CommerceEnvironment;
  purpose: CommerceEmbeddingPurpose;
  provider: string;
  secret: string;
}) {
  // Keep domain plaintext validation distinct from shared cryptographic validation.
  const secret = validateEmbeddingCredentialSecret(input.secret);
  try {
    const { keyring, activeKeyId } = loadActiveSharedCredentialKeyring();
    const aad = createCommerceEmbeddingCredentialAad({
      environment: input.environment,
      purpose: input.purpose,
      provider: input.provider,
      keyId: activeKeyId,
    });
    return encryptCredential({ keyring, activeKeyId, plaintext: secret, aad });
  } catch {
    throw new Error(EMBEDDING_CREDENTIAL_ENCRYPTION_UNAVAILABLE);
  }
}

export async function saveEmbeddingConfiguration(
  input: {
    purpose: unknown;
    embeddingProvider: unknown;
    embeddingModel: unknown;
    embeddingDimensions: unknown;
    embeddingIndexVersion: unknown;
    operationId: unknown;
    reason: unknown;
    expectedEditVersion?: unknown;
    secret?: unknown;
  },
  principal: PlatformAdminPrincipal,
): Promise<EmbeddingConfigurationStatus> {
  requireSuperAdmin(principal);
  const validated = validateEmbeddingConfigurationMutation(input);
  const environment = resolveCommerceEnvironment();
  const { prisma } = await import("@/lib/prisma");

  try {
    return await prisma.$transaction(
      async (transaction) => {
        await ensureDevelopmentPlatformAdmin(transaction, principal);
        const existing = await transaction.commerceEmbeddingConfiguration.findUnique({
          where: {
            environment_purpose: {
              environment,
              purpose: validated.purpose,
            },
          },
          select: {
            ...statusSelect,
            ciphertext: true,
            nonce: true,
            authTag: true,
            keyId: true,
          },
        });

        if (!existing) {
          if (validated.expectedEditVersion !== undefined) {
            throw new Error(EMBEDDING_CONFIGURATION_ERRORS.changed);
          }
          if (!validated.secret) {
            throw new Error(EMBEDDING_CONFIGURATION_ERRORS.credentialRequired);
          }
          const sealed = encryptValidatedEmbeddingSecret({
            environment,
            purpose: validated.purpose,
            provider: validated.embeddingProvider,
            secret: validated.secret,
          });
          await transaction.commerceEmbeddingConfiguration.create({
            data: {
              environment,
              purpose: validated.purpose,
              embeddingProvider: validated.embeddingProvider,
              embeddingModel: validated.embeddingModel,
              embeddingDimensions: validated.embeddingDimensions,
              embeddingIndexVersion: validated.embeddingIndexVersion,
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
              action: CommerceAuditAction.SET_EMBEDDING_CONFIGURATION,
              environment,
              reason: validated.reason,
              metadata: {
                purpose: validated.purpose,
                embeddingProvider: validated.embeddingProvider,
                embeddingModel: validated.embeddingModel,
                embeddingDimensions: validated.embeddingDimensions,
                embeddingIndexVersion: validated.embeddingIndexVersion,
                editVersion: 1,
              },
            },
          });
        } else {
          if (
            validated.expectedEditVersion === undefined ||
            existing.editVersion !== validated.expectedEditVersion
          ) {
            throw new Error(EMBEDDING_CONFIGURATION_ERRORS.changed);
          }
          if (
            existing.embeddingProvider !== validated.embeddingProvider &&
            !validated.secret
          ) {
            throw new Error(
              EMBEDDING_CONFIGURATION_ERRORS.providerCredentialRequired,
            );
          }
          const sealed = validated.secret
            ? encryptValidatedEmbeddingSecret({
                environment,
                purpose: validated.purpose,
                provider: validated.embeddingProvider,
                secret: validated.secret,
              })
            : null;
          const updated = await transaction.commerceEmbeddingConfiguration.updateMany({
            where: {
              environment,
              purpose: validated.purpose,
              editVersion: validated.expectedEditVersion,
            },
            data: {
              embeddingProvider: validated.embeddingProvider,
              embeddingModel: validated.embeddingModel,
              embeddingDimensions: validated.embeddingDimensions,
              embeddingIndexVersion: validated.embeddingIndexVersion,
              ...(sealed
                ? {
                    ciphertext: Buffer.from(sealed.ciphertext),
                    nonce: Buffer.from(sealed.nonce),
                    authTag: Buffer.from(sealed.authTag),
                    keyId: sealed.keyId,
                  }
                : {}),
              updatedByAdminId: principal.id,
              editVersion: { increment: 1 },
            },
          });
          if (updated.count !== 1) {
            throw new Error(EMBEDDING_CONFIGURATION_ERRORS.changed);
          }
          await transaction.commerceAuditEvent.create({
            data: {
              actorType: CommerceAuditActorType.PLATFORM_ADMIN,
              actorAdminId: principal.id,
              operationId: validated.operationId,
              action: CommerceAuditAction.REPLACE_EMBEDDING_CONFIGURATION,
              environment,
              reason: validated.reason,
              metadata: {
                purpose: validated.purpose,
                embeddingProvider: validated.embeddingProvider,
                embeddingModel: validated.embeddingModel,
                embeddingDimensions: validated.embeddingDimensions,
                embeddingIndexVersion: validated.embeddingIndexVersion,
                credentialReplaced: Boolean(validated.secret),
                previousEditVersion: validated.expectedEditVersion,
                editVersion: validated.expectedEditVersion + 1,
              },
            },
          });
        }

        const row = await transaction.commerceEmbeddingConfiguration.findUnique({
          where: {
            environment_purpose: {
              environment,
              purpose: validated.purpose,
            },
          },
          select: statusSelect,
        });
        return statusFromRecord(environment, validated.purpose, row);
      },
      { isolationLevel: "Serializable" },
    );
  } catch (cause) {
    if (databaseCode(cause) === "P2002") {
      throw new Error(EMBEDDING_CONFIGURATION_ERRORS.alreadyConfigured);
    }
    if (databaseCode(cause) === "P2034") {
      throw new Error(EMBEDDING_CONFIGURATION_ERRORS.changed);
    }
    throw cause;
  }
}

export async function removeEmbeddingConfiguration(
  input: {
    purpose: unknown;
    operationId: unknown;
    reason: unknown;
    expectedEditVersion: unknown;
  },
  principal: PlatformAdminPrincipal,
): Promise<EmbeddingConfigurationStatus> {
  requireSuperAdmin(principal);
  const validated = validateEmbeddingConfigurationRemoval(input);
  const purpose = validated.purpose;
  const environment = resolveCommerceEnvironment();
  const { prisma } = await import("@/lib/prisma");

  try {
    return await prisma.$transaction(
      async (transaction: ConfigurationTransaction) => {
        await ensureDevelopmentPlatformAdmin(transaction, principal);
        const deleted = await transaction.commerceEmbeddingConfiguration.deleteMany({
          where: {
            environment,
            purpose,
            editVersion: validated.expectedEditVersion!,
          },
        });
        if (deleted.count !== 1) {
          const exists = await transaction.commerceEmbeddingConfiguration.findUnique({
            where: { environment_purpose: { environment, purpose } },
            select: { editVersion: true },
          });
          throw new Error(
            exists
              ? EMBEDDING_CONFIGURATION_ERRORS.changed
              : EMBEDDING_CONFIGURATION_ERRORS.notConfigured,
          );
        }
        await transaction.commerceAuditEvent.create({
          data: {
            actorType: CommerceAuditActorType.PLATFORM_ADMIN,
            actorAdminId: principal.id,
            operationId: validated.operationId,
            action: CommerceAuditAction.REMOVE_EMBEDDING_CONFIGURATION,
            environment,
            reason: validated.reason,
            metadata: {
              purpose,
              previousEditVersion: validated.expectedEditVersion,
            },
          },
        });
        return statusFromRecord(environment, purpose, null);
      },
      { isolationLevel: "Serializable" },
    );
  } catch (cause) {
    if (databaseCode(cause) === "P2034") {
      throw new Error(EMBEDDING_CONFIGURATION_ERRORS.changed);
    }
    throw cause;
  }
}
