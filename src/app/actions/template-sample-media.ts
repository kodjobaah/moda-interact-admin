"use server";

import { createLogger } from "@modainteract/moda-interact-shared/logging";
import { requirePlatformAdminRead } from "@/lib/auth/platform-admin";
import { resolveDeploymentEnvironmentName } from "@/lib/auth/environment";
import { prisma } from "@/lib/prisma";
import { requireTemplateSuperAdmin } from "@/lib/admin/whatsapp-templates/authoring/super-admin";
import { readTemplateSampleMedia, TemplateSampleReadError } from "@/lib/admin/whatsapp-templates/media/template-sample-reader";
import type { TemplateSampleMediaView } from "@/lib/admin/whatsapp-templates/media/template-samples";
import { getConfigurationEnvironment } from "@/lib/admin/platform-configuration/environment";

const logger = createLogger({ serviceNamespace: "moda-interact", serviceName: "moda-interact-admin",
  environment: resolveDeploymentEnvironmentName() });
export type TemplateSampleResult = { ok: true; media: TemplateSampleMediaView } |
  { ok: false; code: "CONFIG_UNAVAILABLE" | "READ_FAILED" };

export async function loadTemplateSampleMedia(): Promise<TemplateSampleResult> {
  const principal = await requirePlatformAdminRead();
  requireTemplateSuperAdmin(principal);
  try {
    return { ok: true, media: await readTemplateSampleMedia({ principal, db: prisma, environment: getConfigurationEnvironment() }) };
  } catch (error) {
    if (error instanceof TemplateSampleReadError) {
      logger.warn("admin.template_samples.config_unavailable", { error });
      return { ok: false, code: "CONFIG_UNAVAILABLE" };
    }
    logger.error("admin.template_samples.read_failed", { error });
    return { ok: false, code: "READ_FAILED" };
  }
}
