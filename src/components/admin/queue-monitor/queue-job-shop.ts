import { adminI18n } from "@/i18n";

import type { QueueJobAttribution } from "./queue-monitor.types";

export function formatQueueJobShop(
  shop: string | null,
  attribution: QueueJobAttribution,
  shopDomain: string | null = null,
) {
  if (shopDomain) return shopDomain;
  if (shop) {
    return attribution === "identified"
      ? adminI18n.t("queue.shopIdLabel", { shopId: shop })
      : shop;
  }
  return attribution === "unresolved"
    ? adminI18n.t("queue.unresolved")
    : adminI18n.t("queue.orphanShop");
}
