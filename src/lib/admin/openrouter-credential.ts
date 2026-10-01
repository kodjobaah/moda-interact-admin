import {
  CommerceAuditAction,
  CommerceAuditActorType,
  type CommerceEnvironment,
  type Prisma,
} from "@prisma/client";
import type { PlatformAdminPrincipal } from "@/lib/auth/platform-admin";
import {
  CREDENTIAL_ENCRYPTION_UNAVAILABLE,
  loadActiveCredentialKeyring,
} from "./openrouter-credential-keyring.ts";
import { sealOpenRouterCredential } from "./openrouter-credential-crypto.ts";
import { resolveCommerceEnvironment } from "./openrouter-credential-environment.ts";
import { validateOpenRouterCredentialMutation } from "./openrouter-credential-validation.ts";

export type OpenRouterCredentialStatus = {
  environment: CommerceEnvironment;
  configured: boolean;
  editVersion: number | null;
  updatedAt: string | null;
  updatedByAdminId: string | null;
};

export type OpenRouterCredentialMutation =
  | {
      kind: "set";
      operationId: string;
      reason: string;
      sealed: ReturnType<typeof sealOpenRouterCredential>;
    }
  | {
      kind: "replace";
      operationId: string;
      reason: string;
      expectedEditVersion: number;
      sealed: ReturnType<typeof sealOpenRouterCredential>;
    }
  | {
      kind: "remove";
      operationId: string;
      reason: string;
      expectedEditVersion: number;
    };

type CredentialTransaction = Prisma.TransactionClient;
type CredentialStatusRecord = {
  editVersion: number;
  updatedAt: Date;
  updatedByAdminId: string;
};

export const OPENROUTER_CREDENTIAL_ERRORS = {
  alreadyConfigured:
    "OpenRouter credential is already configured. Use Replace.",
  notConfiguredForReplace: "OpenRouter credential is not configured. Use Set.",
  notConfigured: "OpenRouter credential is not configured.",
  changed: "OpenRouter credential changed. Refresh and try again.",
  superAdminRequired: "SUPER_ADMIN access is required.",
} as const;

function requireSuperAdmin(principal: PlatformAdminPrincipal): void {
  if (principal.role !== "SUPER_ADMIN") {
    throw new Error(OPENROUTER_CREDENTIAL_ERRORS.superAdminRequired);
  }
}

function statusFromRecord(
  environment: CommerceEnvironment,
  row: CredentialStatusRecord | null,
): OpenRouterCredentialStatus {
  return {
    environment,
    configured: row !== null,
    editVersion: row?.editVersion ?? null,
    updatedAt: row?.updatedAt.toISOString() ?? null,
    updatedByAdminId: row?.updatedByAdminId ?? null,
  };
}

async function findStatusRecord(
  transaction: Pick<CredentialTransaction, "commerceOpenRouterCredential">,
  environment: CommerceEnvironment,
): Promise<CredentialStatusRecord | null> {
  return transaction.commerceOpenRouterCredential.findUnique({
    where: { environment },
    select: {
      editVersion: true,
      updatedAt: true,
      updatedByAdminId: true,
    },
  });
}

export async function getOpenRouterCredentialStatus(): Promise<OpenRouterCredentialStatus> {
  const [{ requirePlatformAdminRead }, { prisma }] = await Promise.all([
    import("@/lib/auth/platform-admin"),
    import("@/lib/prisma"),
  ]);
  await requirePlatformAdminRead();
  const environment = resolveCommerceEnvironment();
  const row = await prisma.commerceOpenRouterCredential.findUnique({
    where: { environment },
    select: {
      editVersion: true,
      updatedAt: true,
      updatedByAdminId: true,
    },
  });
  return statusFromRecord(environment, row);
}

export async function mutateOpenRouterCredentialInTransaction(
  transaction: CredentialTransaction,
  mutation: OpenRouterCredentialMutation,
  environment: CommerceEnvironment,
  principal: PlatformAdminPrincipal,
): Promise<OpenRouterCredentialStatus> {
  requireSuperAdmin(principal);

  if (mutation.kind === "set") {
    const existing = await transaction.commerceOpenRouterCredential.findUnique({
      where: { environment },
      select: { editVersion: true },
    });
    if (existing)
      throw new Error(OPENROUTER_CREDENTIAL_ERRORS.alreadyConfigured);
    await transaction.commerceOpenRouterCredential.create({
      data: {
        environment,
        ciphertext: Buffer.from(mutation.sealed.ciphertext),
        nonce: Buffer.from(mutation.sealed.nonce),
        authTag: Buffer.from(mutation.sealed.authTag),
        keyId: mutation.sealed.keyId,
        editVersion: 1,
        updatedByAdminId: principal.id,
      },
    });
    await transaction.commerceAuditEvent.create({
      data: {
        actorType: CommerceAuditActorType.PLATFORM_ADMIN,
        actorAdminId: principal.id,
        operationId: mutation.operationId,
        action: CommerceAuditAction.SET_OPENROUTER_CREDENTIAL,
        environment,
        reason: mutation.reason,
        metadata: { editVersion: 1 },
      },
    });
    return statusFromRecord(
      environment,
      await findStatusRecord(transaction, environment),
    );
  }

  const existing = await transaction.commerceOpenRouterCredential.findUnique({
    where: { environment },
    select: { editVersion: true },
  });
  if (!existing) {
    throw new Error(
      mutation.kind === "replace"
        ? OPENROUTER_CREDENTIAL_ERRORS.notConfiguredForReplace
        : OPENROUTER_CREDENTIAL_ERRORS.notConfigured,
    );
  }
  if (existing.editVersion !== mutation.expectedEditVersion) {
    throw new Error(OPENROUTER_CREDENTIAL_ERRORS.changed);
  }

  if (mutation.kind === "replace") {
    const updated = await transaction.commerceOpenRouterCredential.updateMany({
      where: { environment, editVersion: mutation.expectedEditVersion },
      data: {
        ciphertext: Buffer.from(mutation.sealed.ciphertext),
        nonce: Buffer.from(mutation.sealed.nonce),
        authTag: Buffer.from(mutation.sealed.authTag),
        keyId: mutation.sealed.keyId,
        updatedByAdminId: principal.id,
        editVersion: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      throw new Error(OPENROUTER_CREDENTIAL_ERRORS.changed);
    }
    await transaction.commerceAuditEvent.create({
      data: {
        actorType: CommerceAuditActorType.PLATFORM_ADMIN,
        actorAdminId: principal.id,
        operationId: mutation.operationId,
        action: CommerceAuditAction.REPLACE_OPENROUTER_CREDENTIAL,
        environment,
        reason: mutation.reason,
        metadata: {
          previousEditVersion: mutation.expectedEditVersion,
          editVersion: mutation.expectedEditVersion + 1,
        },
      },
    });
    return statusFromRecord(
      environment,
      await findStatusRecord(transaction, environment),
    );
  }

  const deleted = await transaction.commerceOpenRouterCredential.deleteMany({
    where: { environment, editVersion: mutation.expectedEditVersion },
  });
  if (deleted.count !== 1) {
    throw new Error(OPENROUTER_CREDENTIAL_ERRORS.changed);
  }
  await transaction.commerceAuditEvent.create({
    data: {
      actorType: CommerceAuditActorType.PLATFORM_ADMIN,
      actorAdminId: principal.id,
      operationId: mutation.operationId,
      action: CommerceAuditAction.REMOVE_OPENROUTER_CREDENTIAL,
      environment,
      reason: mutation.reason,
      metadata: { previousEditVersion: mutation.expectedEditVersion },
    },
  });
  return statusFromRecord(environment, null);
}

async function executeMutation(
  kind: OpenRouterCredentialMutation["kind"],
  input: {
    operationId: unknown;
    reason: unknown;
    expectedEditVersion?: unknown;
    secret?: unknown;
  },
  principal: PlatformAdminPrincipal,
): Promise<OpenRouterCredentialStatus> {
  requireSuperAdmin(principal);
  const environment = resolveCommerceEnvironment();
  const validated = validateOpenRouterCredentialMutation(input);
  let mutation: OpenRouterCredentialMutation;

  if (kind === "remove") {
    mutation = {
      kind,
      operationId: validated.operationId,
      reason: validated.reason,
      expectedEditVersion: validated.expectedEditVersion!,
    };
  } else {
    let active: ReturnType<typeof loadActiveCredentialKeyring>;
    try {
      active = loadActiveCredentialKeyring();
    } catch {
      throw new Error(CREDENTIAL_ENCRYPTION_UNAVAILABLE);
    }
    const sealed = sealOpenRouterCredential({
      environment,
      secret: validated.secret!,
      keyring: active.keyring,
      activeKeyId: active.activeKeyId,
    });
    mutation =
      kind === "set"
        ? {
            kind,
            operationId: validated.operationId,
            reason: validated.reason,
            sealed,
          }
        : {
            kind,
            operationId: validated.operationId,
            reason: validated.reason,
            expectedEditVersion: validated.expectedEditVersion!,
            sealed,
          };
  }

  const { prisma } = await import("@/lib/prisma");
  try {
    return await prisma.$transaction(
      (transaction) =>
        mutateOpenRouterCredentialInTransaction(
          transaction,
          mutation,
          environment,
          principal,
        ),
      { isolationLevel: "Serializable" },
    );
  } catch (cause) {
    if (kind === "set" && databaseCode(cause) === "P2002") {
      throw new Error(OPENROUTER_CREDENTIAL_ERRORS.alreadyConfigured);
    }
    if (databaseCode(cause) === "P2034") {
      throw new Error(OPENROUTER_CREDENTIAL_ERRORS.changed);
    }
    throw cause;
  }
}

function databaseCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
}

export function setOpenRouterCredential(
  input: { operationId: string; reason: string; secret: string },
  principal: PlatformAdminPrincipal,
): Promise<OpenRouterCredentialStatus> {
  return executeMutation("set", input, principal);
}

export function replaceOpenRouterCredential(
  input: {
    operationId: string;
    reason: string;
    expectedEditVersion: number;
    secret: string;
  },
  principal: PlatformAdminPrincipal,
): Promise<OpenRouterCredentialStatus> {
  return executeMutation("replace", input, principal);
}

export function removeOpenRouterCredential(
  input: {
    operationId: string;
    reason: string;
    expectedEditVersion: number;
  },
  principal: PlatformAdminPrincipal,
): Promise<OpenRouterCredentialStatus> {
  return executeMutation("remove", input, principal);
}
