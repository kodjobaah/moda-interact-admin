"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdminMutation } from "@/lib/auth/platform-admin";
import {
  OPENROUTER_CREDENTIAL_ERRORS,
  removeOpenRouterCredential,
  replaceOpenRouterCredential,
  setOpenRouterCredential,
  type OpenRouterCredentialStatus,
} from "@/lib/admin/openrouter-credential";
import { validateOpenRouterCredentialMutation } from "@/lib/admin/openrouter-credential-validation";

type ActionResult =
  | { ok: true; status: OpenRouterCredentialStatus }
  | { ok: false; message: string; refreshRequired: boolean };

function formText(formData: FormData, name: string): string {
  const values = formData.getAll(name);
  if (values.length !== 1 || typeof values[0] !== "string") {
    throw new Error(`${name} is invalid.`);
  }
  return values[0];
}

function assertFields(formData: FormData, allowed: readonly string[]): void {
  const allowedFields = new Set(allowed);
  for (const key of formData.keys()) {
    if (!allowedFields.has(key))
      throw new Error("OpenRouter credential input is invalid.");
  }
}

function expectedVersion(formData: FormData): number {
  const raw = formText(formData, "expectedEditVersion");
  if (!/^\d+$/.test(raw)) throw new Error("expectedEditVersion is invalid.");
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("expectedEditVersion is invalid.");
  }
  return value;
}

function clientMessage(cause: unknown): {
  message: string;
  refreshRequired: boolean;
} {
  const message = cause instanceof Error ? cause.message : "";
  if (message === OPENROUTER_CREDENTIAL_ERRORS.changed) {
    return { message, refreshRequired: true };
  }
  const bounded = new Set([
    OPENROUTER_CREDENTIAL_ERRORS.alreadyConfigured,
    OPENROUTER_CREDENTIAL_ERRORS.notConfiguredForReplace,
    OPENROUTER_CREDENTIAL_ERRORS.notConfigured,
    OPENROUTER_CREDENTIAL_ERRORS.superAdminRequired,
    "OpenRouter credential encryption is unavailable.",
    "OpenRouter credential is invalid.",
    "operationId is invalid.",
    "reason is invalid.",
    "expectedEditVersion is invalid.",
    "OpenRouter credential input is invalid.",
  ]);
  return {
    message: bounded.has(message)
      ? message
      : "OpenRouter credential update could not be completed.",
    refreshRequired: false,
  };
}

async function requireSuperAdmin() {
  const principal = await requirePlatformAdminMutation();
  if (principal.role !== "SUPER_ADMIN") {
    throw new Error(OPENROUTER_CREDENTIAL_ERRORS.superAdminRequired);
  }
  return principal;
}

async function finish(
  operation: () => Promise<OpenRouterCredentialStatus>,
): Promise<ActionResult> {
  try {
    const status = await operation();
    revalidatePath("/commerce-models/credentials");
    return { ok: true, status };
  } catch (cause) {
    return { ok: false, ...clientMessage(cause) };
  }
}

export async function setOpenRouterCredentialAction(
  formData: FormData,
): Promise<ActionResult> {
  const principal = await requireSuperAdmin();
  return finish(async () => {
    assertFields(formData, ["operationId", "reason", "secret"]);
    const input = validateOpenRouterCredentialMutation({
      operationId: formText(formData, "operationId"),
      reason: formText(formData, "reason"),
      secret: formText(formData, "secret"),
    });
    return setOpenRouterCredential(
      input as {
        operationId: string;
        reason: string;
        secret: string;
      },
      principal,
    );
  });
}

export async function replaceOpenRouterCredentialAction(
  formData: FormData,
): Promise<ActionResult> {
  const principal = await requireSuperAdmin();
  return finish(async () => {
    assertFields(formData, [
      "operationId",
      "reason",
      "secret",
      "expectedEditVersion",
    ]);
    const input = validateOpenRouterCredentialMutation({
      operationId: formText(formData, "operationId"),
      reason: formText(formData, "reason"),
      secret: formText(formData, "secret"),
      expectedEditVersion: expectedVersion(formData),
    });
    return replaceOpenRouterCredential(
      input as {
        operationId: string;
        reason: string;
        expectedEditVersion: number;
        secret: string;
      },
      principal,
    );
  });
}

export async function removeOpenRouterCredentialAction(
  formData: FormData,
): Promise<ActionResult> {
  const principal = await requireSuperAdmin();
  return finish(async () => {
    assertFields(formData, [
      "operationId",
      "reason",
      "expectedEditVersion",
      "confirmation",
    ]);
    if (formText(formData, "confirmation") !== "confirmed") {
      throw new Error("OpenRouter credential input is invalid.");
    }
    const input = validateOpenRouterCredentialMutation({
      operationId: formText(formData, "operationId"),
      reason: formText(formData, "reason"),
      expectedEditVersion: expectedVersion(formData),
    });
    return removeOpenRouterCredential(
      input as {
        operationId: string;
        reason: string;
        expectedEditVersion: number;
      },
      principal,
    );
  });
}
