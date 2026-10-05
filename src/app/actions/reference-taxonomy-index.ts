"use server";

import { revalidatePath } from "next/cache";
import { createLogger } from "@modainteract/moda-interact-shared/logging";

import { requirePlatformAdminMutation } from "@/lib/auth/platform-admin";
import { resolveDeploymentEnvironmentName } from "@/lib/auth/environment";
import {
  clearReferenceTaxonomyIndex,
  syncReferenceTaxonomyIndex,
  type ReferenceTaxonomyIndexStatus,
} from "@/lib/admin/shopify-taxonomy-index-management";
import { EMBEDDING_CONFIGURATION_ERRORS } from "@/lib/admin/embedding-configuration";
import { EMBEDDING_CREDENTIAL_ENCRYPTION_UNAVAILABLE } from "@/lib/admin/embedding-configuration-crypto";

const logger = createLogger({
  serviceNamespace: "moda-interact",
  serviceName: "moda-interact-admin",
  environment: resolveDeploymentEnvironmentName(),
});

type ActionResult =
  | { ok: true; status: ReferenceTaxonomyIndexStatus }
  | { ok: false; message: string };

const SAFE_MESSAGES = new Set([
  EMBEDDING_CONFIGURATION_ERRORS.notConfigured,
  EMBEDDING_CREDENTIAL_ENCRYPTION_UNAVAILABLE,
  "Reference taxonomy embedding configuration is not supported by the taxonomy index.",
  "Reference taxonomy Redis is not configured.",
  "Reference taxonomy index management is already in progress.",
  "Reference taxonomy synchronization could not be started.",
  "SUPER_ADMIN access is required.",
]);

function safeMessage(cause: unknown, fallback: string): string {
  const message = cause instanceof Error ? cause.message : "";
  if (SAFE_MESSAGES.has(message)) return message;
  if (message.startsWith("Shopify taxonomy sync failed:")) return message;
  return fallback;
}

async function requireSuperAdmin() {
  const principal = await requirePlatformAdminMutation();
  if (principal.role !== "SUPER_ADMIN") {
    throw new Error("SUPER_ADMIN access is required.");
  }
  return principal;
}

export async function syncReferenceTaxonomyIndexAction(): Promise<ActionResult> {
  let actorAdminId: string | null = null;
  try {
    const principal = await requireSuperAdmin();
    actorAdminId = principal.id;
    logger.info("admin.reference_taxonomy.sync", {
      actorAdminId,
      outcome: "started",
    });
    const status = await syncReferenceTaxonomyIndex();
    logger.info("admin.reference_taxonomy.sync", {
      actorAdminId,
      outcome: "succeeded",
      state: status.state,
      taxonomyVersion: status.index?.taxonomyVersion ?? null,
      embeddingModel: status.embedding?.model ?? null,
      embeddingDimensions: status.embedding?.dimensions ?? null,
    });
    revalidatePath("/system-controls/store-categories");
    return { ok: true, status };
  } catch (cause) {
    logger.info("admin.reference_taxonomy.sync", {
      actorAdminId,
      outcome: "failed",
      reason: cause instanceof Error ? cause.message : "unknown",
    });
    return {
      ok: false,
      message: safeMessage(
        cause,
        "Reference taxonomy synchronization could not be completed.",
      ),
    };
  }
}

export async function clearReferenceTaxonomyIndexAction(): Promise<ActionResult> {
  let actorAdminId: string | null = null;
  try {
    const principal = await requireSuperAdmin();
    actorAdminId = principal.id;
    const status = await clearReferenceTaxonomyIndex();
    logger.info("admin.reference_taxonomy.clear", {
      actorAdminId,
      outcome: "succeeded",
      state: status.state,
    });
    revalidatePath("/system-controls/store-categories");
    return { ok: true, status };
  } catch (cause) {
    logger.info("admin.reference_taxonomy.clear", {
      actorAdminId,
      outcome: "failed",
      reason: cause instanceof Error ? cause.message : "unknown",
    });
    return {
      ok: false,
      message: safeMessage(
        cause,
        "Reference taxonomy search index could not be cleared.",
      ),
    };
  }
}
