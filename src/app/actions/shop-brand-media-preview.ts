"use server";

import { createLogger } from "@modainteract/moda-interact-shared/logging";
import { requirePlatformAdminRead } from "@/lib/auth/platform-admin";
import { resolveDeploymentEnvironmentName } from "@/lib/auth/environment";
import { prisma } from "@/lib/prisma";
import { readShopBrandMedia, ShopBrandMediaReadError } from "@/lib/admin/whatsapp-templates/media/reader";
import type { ShopBrandMediaView } from "@/lib/admin/whatsapp-templates/media/readiness";
import { requireTemplateSuperAdmin } from "@/lib/admin/whatsapp-templates/authoring/super-admin";
import { getConfigurationEnvironment } from "@/lib/admin/platform-configuration/environment";

const logger = createLogger({ serviceNamespace: "moda-interact", serviceName: "moda-interact-admin",
  environment: resolveDeploymentEnvironmentName() });
export type MediaPreviewResult = { ok: true; media: ShopBrandMediaView } |
  { ok: false; code: "INVALID_SHOP" | "NOT_FOUND" | "CONFIG_UNAVAILABLE" | "READ_FAILED" };

export async function loadVerifiedShopBrandMedia(shopId: string): Promise<MediaPreviewResult> {
  const principal = await requirePlatformAdminRead();
  requireTemplateSuperAdmin(principal);
  try {
    return { ok: true, media: await readShopBrandMedia({ shopId, principal, db: prisma, environment: getConfigurationEnvironment() }) };
  } catch (error) {
    if (error instanceof ShopBrandMediaReadError) {
      if (error.code === "CONFIG_UNAVAILABLE") logger.warn("admin.shop_brand_media.config_unavailable", { reasonCode: error.code });
      return { ok: false, code: error.code };
    }
    // Never leak untrusted merchant URL, credentials, query text, or database details.
    logger.error("admin.shop_brand_media.read_failed", { reasonCode: "READ_FAILED", error });
    return { ok: false, code: "READ_FAILED" };
  }
}
