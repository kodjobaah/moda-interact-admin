"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdminMutation } from "@/lib/auth/platform-admin";
import {
  EMBEDDING_CONFIGURATION_ERRORS,
  removeEmbeddingConfiguration,
  saveEmbeddingConfiguration,
  type EmbeddingConfigurationStatus,
} from "@/lib/admin/embedding-configuration";
import { EMBEDDING_CREDENTIAL_ENCRYPTION_UNAVAILABLE } from "@/lib/admin/embedding-configuration-crypto";

type ActionResult =
  | { ok: true; status: EmbeddingConfigurationStatus }
  | { ok: false; message: string; refreshRequired: boolean };

function formText(formData: FormData, name: string): string {
  const values = formData.getAll(name);
  if (values.length !== 1 || typeof values[0] !== "string") {
    throw new Error(`${name} is invalid.`);
  }
  return values[0];
}

function optionalText(formData: FormData, name: string): string | undefined {
  const value = formText(formData, name);
  return value ? value : undefined;
}

function integerField(formData: FormData, name: string): number {
  const raw = formText(formData, name);
  if (!/^\d+$/.test(raw)) throw new Error(`${name} is invalid.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) throw new Error(`${name} is invalid.`);
  return value;
}

function optionalExpectedVersion(formData: FormData): number | undefined {
  const raw = formText(formData, "expectedEditVersion");
  if (!raw) return undefined;
  if (!/^\d+$/.test(raw)) throw new Error("expectedEditVersion is invalid.");
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("expectedEditVersion is invalid.");
  }
  return value;
}

function requiredExpectedVersion(formData: FormData): number {
  const value = optionalExpectedVersion(formData);
  if (value === undefined) throw new Error("expectedEditVersion is invalid.");
  return value;
}

function assertFields(formData: FormData, allowed: readonly string[]): void {
  const allowedFields = new Set(allowed);
  for (const key of formData.keys()) {
    if (!allowedFields.has(key)) {
      throw new Error("Embedding configuration input is invalid.");
    }
  }
}

function clientMessage(cause: unknown): {
  message: string;
  refreshRequired: boolean;
} {
  const message = cause instanceof Error ? cause.message : "";
  if (message === EMBEDDING_CONFIGURATION_ERRORS.changed) {
    return { message, refreshRequired: true };
  }
  const bounded = new Set([
    EMBEDDING_CONFIGURATION_ERRORS.alreadyConfigured,
    EMBEDDING_CONFIGURATION_ERRORS.notConfigured,
    EMBEDDING_CONFIGURATION_ERRORS.credentialRequired,
    EMBEDDING_CONFIGURATION_ERRORS.providerCredentialRequired,
    EMBEDDING_CONFIGURATION_ERRORS.superAdminRequired,
    EMBEDDING_CREDENTIAL_ENCRYPTION_UNAVAILABLE,
    "Embedding credential is invalid.",
    "purpose is invalid.",
    "embeddingProvider is invalid.",
    "embeddingModel is invalid.",
    "embeddingDimensions is invalid.",
    "embeddingIndexVersion is invalid.",
    "operationId is invalid.",
    "reason is invalid.",
    "expectedEditVersion is invalid.",
    "Embedding configuration input is invalid.",
  ]);
  return {
    message: bounded.has(message)
      ? message
      : "Embedding configuration update could not be completed.",
    refreshRequired: false,
  };
}

async function requireSuperAdmin() {
  const principal = await requirePlatformAdminMutation();
  if (principal.role !== "SUPER_ADMIN") {
    throw new Error(EMBEDDING_CONFIGURATION_ERRORS.superAdminRequired);
  }
  return principal;
}

async function finish(
  operation: () => Promise<EmbeddingConfigurationStatus>,
): Promise<ActionResult> {
  try {
    const status = await operation();
    revalidatePath("/system-controls/embeddings");
    return { ok: true, status };
  } catch (cause) {
    return { ok: false, ...clientMessage(cause) };
  }
}

export async function saveEmbeddingConfigurationAction(
  formData: FormData,
): Promise<ActionResult> {
  const principal = await requireSuperAdmin();
  return finish(async () => {
    assertFields(formData, [
      "purpose",
      "embeddingProvider",
      "embeddingModel",
      "embeddingDimensions",
      "embeddingIndexVersion",
      "secret",
      "reason",
      "operationId",
      "expectedEditVersion",
    ]);
    return saveEmbeddingConfiguration(
      {
        purpose: formText(formData, "purpose"),
        embeddingProvider: formText(formData, "embeddingProvider"),
        embeddingModel: formText(formData, "embeddingModel"),
        embeddingDimensions: integerField(formData, "embeddingDimensions"),
        embeddingIndexVersion: formText(formData, "embeddingIndexVersion"),
        secret: optionalText(formData, "secret"),
        reason: formText(formData, "reason"),
        operationId: formText(formData, "operationId"),
        expectedEditVersion: optionalExpectedVersion(formData),
      },
      principal,
    );
  });
}

export async function removeEmbeddingConfigurationAction(
  formData: FormData,
): Promise<ActionResult> {
  const principal = await requireSuperAdmin();
  return finish(async () => {
    assertFields(formData, [
      "purpose",
      "reason",
      "operationId",
      "expectedEditVersion",
      "confirmation",
    ]);
    if (formText(formData, "confirmation") !== "confirmed") {
      throw new Error("Embedding configuration input is invalid.");
    }
    return removeEmbeddingConfiguration(
      {
        purpose: formText(formData, "purpose"),
        reason: formText(formData, "reason"),
        operationId: formText(formData, "operationId"),
        expectedEditVersion: requiredExpectedVersion(formData),
      },
      principal,
    );
  });
}
