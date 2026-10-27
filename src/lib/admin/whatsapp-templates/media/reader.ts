import type { PrismaClient } from "@prisma/client";
import type { PlatformAdminPrincipal } from "../../../auth/platform-admin";
import { PLATFORM_POLICY_REGISTRY, validateConfiguration } from "../../platform-configuration/contracts";
import { requireTemplateSuperAdmin } from "../authoring/super-admin";
import { projectShopBrandMedia, type ShopBrandMediaView } from "./readiness";

export class ShopBrandMediaReadError extends Error {
  constructor(readonly code: "INVALID_SHOP" | "NOT_FOUND" | "CONFIG_UNAVAILABLE") {
    super(code); this.name = "ShopBrandMediaReadError";
  }
}
export type MediaReadDatabase = Pick<PrismaClient, "shop" | "shopBrand" | "platformConfiguration">;

/** SUPER_ADMIN only, exact shopId scoping. Source URLs never leave this module. */
export async function readShopBrandMedia(input: {
  shopId: string; principal: PlatformAdminPrincipal; db: MediaReadDatabase; environment: string;
}): Promise<ShopBrandMediaView> {
  requireTemplateSuperAdmin(input.principal);
  if (typeof input.shopId !== "string" || !/^[A-Za-z0-9_-]{1,191}$/.test(input.shopId)) {
    throw new ShopBrandMediaReadError("INVALID_SHOP");
  }
  const policy = PLATFORM_POLICY_REGISTRY.get("shopBrand.publicMedia");
  if (!policy?.defaults || policy.kind !== "policy") throw new ShopBrandMediaReadError("CONFIG_UNAVAILABLE");
  const configured = await input.db.platformConfiguration.findUnique({
    where: { environment_key: { environment: input.environment, key: policy.key } }, select: { value: true },
  });
  const checked = validateConfiguration(policy, configured?.value ?? policy.defaults);
  if (!checked.ok || typeof checked.values.publicOrigin !== "string") {
    throw new ShopBrandMediaReadError("CONFIG_UNAVAILABLE");
  }
  const shop = await input.db.shop.findUnique({ where: { id: input.shopId }, select: { id: true, domain: true } });
  if (!shop) throw new ShopBrandMediaReadError("NOT_FOUND");
  const brand = await input.db.shopBrand.findUnique({ where: { shopId: shop.id }, select: { whatsAppMedia: true } });
  return projectShopBrandMedia({ media: brand?.whatsAppMedia, shopId: shop.id, domain: shop.domain,
    publicOrigin: checked.values.publicOrigin });
}

/** Production entrypoint supplies the real authenticated principal and active environment. */
