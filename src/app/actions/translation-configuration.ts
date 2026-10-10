"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdminMutation } from "@/lib/auth/platform-admin";
import {
  TRANSLATION_CONFIGURATION_ERRORS,
} from "@/lib/admin/translation-configuration";
import {
  removeTranslationProviderCredential,
  replaceTranslationProviderCredential,
  setTranslationProviderCredential,
} from "@/lib/admin/translation-provider-credential-service";
import {
  createTranslationModelConfiguration,
  setTranslationModelConfigurationAutomaticDefault,
  setTranslationModelConfigurationEnabled,
  updateTranslationModelConfiguration,
} from "@/lib/admin/translation-model-configuration-service";
import { TRANSLATION_CREDENTIAL_ENCRYPTION_UNAVAILABLE } from "@/lib/admin/translation-credential-crypto";

type ActionResult =
  | { ok: true }
  | { ok: false; message: string; refreshRequired: boolean };

function formText(formData: FormData, name: string): string {
  const values = formData.getAll(name);
  if (values.length !== 1 || typeof values[0] !== "string") {
    throw new Error(`${name} is invalid.`);
  }
  return values[0];
}

function positiveInteger(formData: FormData, name: string): number {
  const raw = formText(formData, name);
  if (!/^\d+$/.test(raw)) throw new Error(`${name} is invalid.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} is invalid.`);
  }
  return value;
}

function booleanField(formData: FormData, name: string): boolean {
  const value = formText(formData, name);
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} is invalid.`);
}

function assertFields(formData: FormData, allowed: readonly string[]): void {
  const allowedFields = new Set(allowed);
  for (const key of formData.keys()) {
    if (!allowedFields.has(key)) {
      throw new Error("Translation configuration input is invalid.");
    }
  }
}

function clientMessage(cause: unknown): {
  message: string;
  refreshRequired: boolean;
} {
  const message = cause instanceof Error ? cause.message : "";
  if (
    message === TRANSLATION_CONFIGURATION_ERRORS.credentialChanged ||
    message === TRANSLATION_CONFIGURATION_ERRORS.modelChanged
  ) {
    return { message, refreshRequired: true };
  }
  const bounded = new Set([
    ...Object.values(TRANSLATION_CONFIGURATION_ERRORS),
    TRANSLATION_CREDENTIAL_ENCRYPTION_UNAVAILABLE,
    "Translation provider credential is invalid.",
    "Translation model configuration input is invalid.",
    "operationId is invalid.",
    "reason is invalid.",
    "expectedEditVersion is invalid.",
    "displayName is invalid.",
    "providerModelId is invalid.",
    "id is invalid.",
    "enabled is invalid.",
    "Translation configuration input is invalid.",
  ]);
  return {
    message: bounded.has(message)
      ? message
      : "Translation configuration update could not be completed.",
    refreshRequired: false,
  };
}

async function requireSuperAdmin() {
  const principal = await requirePlatformAdminMutation();
  if (principal.role !== "SUPER_ADMIN") {
    throw new Error(TRANSLATION_CONFIGURATION_ERRORS.superAdminRequired);
  }
  return principal;
}

async function finish(operation: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await operation();
    revalidatePath("/system-controls/translations");
    return { ok: true };
  } catch (cause) {
    return { ok: false, ...clientMessage(cause) };
  }
}

export async function setTranslationProviderCredentialAction(
  formData: FormData,
): Promise<ActionResult> {
  const principal = await requireSuperAdmin();
  return finish(async () => {
    assertFields(formData, ["secret", "reason", "operationId"]);
    await setTranslationProviderCredential(
      {
        secret: formText(formData, "secret"),
        reason: formText(formData, "reason"),
        operationId: formText(formData, "operationId"),
      },
      principal,
    );
  });
}

export async function replaceTranslationProviderCredentialAction(
  formData: FormData,
): Promise<ActionResult> {
  const principal = await requireSuperAdmin();
  return finish(async () => {
    assertFields(formData, [
      "secret",
      "reason",
      "operationId",
      "expectedEditVersion",
    ]);
    await replaceTranslationProviderCredential(
      {
        secret: formText(formData, "secret"),
        reason: formText(formData, "reason"),
        operationId: formText(formData, "operationId"),
        expectedEditVersion: positiveInteger(formData, "expectedEditVersion"),
      },
      principal,
    );
  });
}

export async function removeTranslationProviderCredentialAction(
  formData: FormData,
): Promise<ActionResult> {
  const principal = await requireSuperAdmin();
  return finish(async () => {
    assertFields(formData, [
      "reason",
      "operationId",
      "expectedEditVersion",
      "confirmation",
    ]);
    if (formText(formData, "confirmation") !== "confirmed") {
      throw new Error("Translation configuration input is invalid.");
    }
    await removeTranslationProviderCredential(
      {
        reason: formText(formData, "reason"),
        operationId: formText(formData, "operationId"),
        expectedEditVersion: positiveInteger(formData, "expectedEditVersion"),
      },
      principal,
    );
  });
}

export async function createTranslationModelConfigurationAction(
  formData: FormData,
): Promise<ActionResult> {
  const principal = await requireSuperAdmin();
  return finish(async () => {
    assertFields(formData, [
      "displayName",
      "providerModelId",
      "reason",
      "operationId",
    ]);
    await createTranslationModelConfiguration(
      {
        displayName: formText(formData, "displayName"),
        providerModelId: formText(formData, "providerModelId"),
        reason: formText(formData, "reason"),
        operationId: formText(formData, "operationId"),
      },
      principal,
    );
  });
}

export async function updateTranslationModelConfigurationAction(
  formData: FormData,
): Promise<ActionResult> {
  const principal = await requireSuperAdmin();
  return finish(async () => {
    assertFields(formData, [
      "id",
      "displayName",
      "providerModelId",
      "reason",
      "operationId",
      "expectedEditVersion",
    ]);
    await updateTranslationModelConfiguration(
      {
        id: formText(formData, "id"),
        displayName: formText(formData, "displayName"),
        providerModelId: formText(formData, "providerModelId"),
        reason: formText(formData, "reason"),
        operationId: formText(formData, "operationId"),
        expectedEditVersion: positiveInteger(formData, "expectedEditVersion"),
      },
      principal,
    );
  });
}

export async function setTranslationModelConfigurationAutomaticDefaultAction(
  formData: FormData,
): Promise<ActionResult> {
  const principal = await requireSuperAdmin();
  return finish(async () => {
    assertFields(formData, [
      "id",
      "reason",
      "operationId",
      "expectedEditVersion",
    ]);
    await setTranslationModelConfigurationAutomaticDefault(
      {
        id: formText(formData, "id"),
        reason: formText(formData, "reason"),
        operationId: formText(formData, "operationId"),
        expectedEditVersion: positiveInteger(formData, "expectedEditVersion"),
      },
      principal,
    );
  });
}

export async function setTranslationModelConfigurationEnabledAction(
  formData: FormData,
): Promise<ActionResult> {
  const principal = await requireSuperAdmin();
  return finish(async () => {
    assertFields(formData, [
      "id",
      "enabled",
      "reason",
      "operationId",
      "expectedEditVersion",
    ]);
    await setTranslationModelConfigurationEnabled(
      {
        id: formText(formData, "id"),
        enabled: booleanField(formData, "enabled"),
        reason: formText(formData, "reason"),
        operationId: formText(formData, "operationId"),
        expectedEditVersion: positiveInteger(formData, "expectedEditVersion"),
      },
      principal,
    );
  });
}
