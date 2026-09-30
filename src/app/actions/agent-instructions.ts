"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdminMutation } from "@/lib/auth/platform-admin";
import { ensureDevelopmentPlatformAdmin } from "@/lib/auth/development-platform-admin";
import { mutateAgentInstructions, validatePromptText, type PromptMutation } from "@/lib/admin/agent-instructions";
import { prisma } from "@/lib/prisma";

function text(formData: FormData, key: string, maxLength: number): string {
  const value = formData.get(key);
  if (typeof value !== "string") throw new Error(`${key} is required.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) throw new Error(`${key} must be between 1 and ${maxLength} characters.`);
  return normalized;
}

function version(formData: FormData, key: string): number {
  const value = Number(formData.get(key));
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${key} is invalid.`);
  return value;
}

function mutationFromForm(formData: FormData): PromptMutation {
  const intent = formData.get("intent");
  const reason = text(formData, "reason", 1000);
  if (intent === "create-draft") {
    const scope = formData.get("scope");
    if (scope !== "PLATFORM" && scope !== "SHOP") throw new Error("Prompt scope is invalid.");
    const shopIdValue = formData.get("shopId");
    const shopId = typeof shopIdValue === "string" && shopIdValue ? shopIdValue : null;
    return { kind: intent, scope, shopId, reason };
  }
  if (intent === "update-draft") {
    const promptText = validatePromptText(String(formData.get("promptText") ?? ""));
    return {
      kind: intent,
      revisionId: text(formData, "revisionId", 128),
      expectedEditVersion: version(formData, "expectedEditVersion"),
      promptText,
      reason,
    };
  }
  if (intent === "publish") {
    return {
      kind: intent,
      revisionId: text(formData, "revisionId", 128),
      expectedRevisionEditVersion: version(formData, "expectedRevisionEditVersion"),
      expectedConfigurationPromptEditVersion: version(formData, "expectedConfigurationPromptEditVersion"),
      reason,
    };
  }
  if (intent === "activate") {
    const scope = formData.get("scope");
    if (scope !== "PLATFORM" && scope !== "SHOP") throw new Error("Prompt scope is invalid.");
    const shopIdValue = formData.get("shopId");
    const shopId = typeof shopIdValue === "string" && shopIdValue ? shopIdValue : null;
    return {
      kind: intent,
      promptRevisionId: text(formData, "promptRevisionId", 128),
      scope,
      shopId,
      expectedConfigurationPromptEditVersion: version(formData, "expectedConfigurationPromptEditVersion"),
      reason,
    };
  }
  throw new Error("Unsupported Agent Instructions action.");
}

function databaseCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
}

export async function mutateAgentInstructionsAction(formData: FormData): Promise<void> {
  const mutation = mutationFromForm(formData);
  const principal = await requirePlatformAdminMutation();
  if (principal.role !== "SUPER_ADMIN") throw new Error("SUPER_ADMIN access is required.");
  try {
    await prisma.$transaction(async (transaction) => {
      await ensureDevelopmentPlatformAdmin(transaction, principal);
      await mutateAgentInstructions(transaction, mutation, principal.id);
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (databaseCode(error) === "P2002") throw new Error("Agent Instructions configuration conflicts with an existing record.");
    if (databaseCode(error) === "P2034") throw new Error("Agent Instructions changed; reload and retry.");
    throw error;
  }
  revalidatePath("/system-controls/agent-instructions");
}