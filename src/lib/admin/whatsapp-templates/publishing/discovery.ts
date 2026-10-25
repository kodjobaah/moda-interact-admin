import type { Prisma } from "@prisma/client";
import { reject } from "./validation";
import { MAX_SNAPSHOT_SHOPS } from "./types";
import type { PublicationScope } from "./types";

type ShopReader = Pick<Prisma.TransactionClient, "shop">;
export type ShopCandidate = { id: string; domain: string; platform: string; status: string; wooStatus: string | null };
export type DiscoveredScope = { shops: ShopCandidate[]; exclusions: Array<{ reason: string; count: number }> };
export function eligibleShop(shop: ShopCandidate): string | null {
  if (shop.status !== "ACTIVE") return "Shop is not ACTIVE";
  if (shop.platform === "WOOCOMMERCE" && shop.wooStatus !== "ACTIVE") return "WooCommerce installation is not ACTIVE";
  if (!["SHOPIFY", "WOOCOMMERCE"].includes(shop.platform)) return "Unsupported commerce platform";
  return null;
}
const asCandidate = (row: {
  id: string; domain: string; platform: string; status: string;
  wooCommerceInstallation: { status: string } | null;
}): ShopCandidate => ({ id: row.id, domain: row.domain, platform: row.platform,
  status: row.status, wooStatus: row.wooCommerceInstallation?.status ?? null });

/** Cursor paging bounds each SQL read and freezes an exact shop ID list at confirmation.
 * The stored list is NOT a live query, so future merchants are never added implicitly. */
export async function discoverScope(db: ShopReader, scope: PublicationScope): Promise<DiscoveredScope> {
  const selectedIds = scope.mode === "all" ? null : scope.mode === "one" ? [scope.shopId] : scope.shopIds;
  const shops: ShopCandidate[] = []; const excluded = new Map<string, number>();
  const read = async (cursor?: string) => db.shop.findMany({
    ...(selectedIds ? { where: { id: { in: selectedIds } } } : {}),
    select: { id: true, domain: true, status: true, platform: true,
      wooCommerceInstallation: { select: { status: true } } },
    orderBy: { id: "asc" }, take: 250,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  let cursor: string | undefined;
  let found = 0;
  while (true) {
    const rows = await read(cursor);
    for (const row of rows) {
      found++;
      const candidate = asCandidate(row);
      const reason = eligibleShop(candidate);
      if (reason) excluded.set(reason, (excluded.get(reason) ?? 0) + 1);
      else shops.push(candidate);
      if (found > MAX_SNAPSHOT_SHOPS) return reject("BOUNDED_SCOPE", "This scope exceeds 20,000 shops. Use bounded selection instead.");
    }
    if (rows.length < 250) break;
    cursor = rows[rows.length - 1].id;
  }
  if (selectedIds) {
    const missing = selectedIds.length - found;
    if (missing) excluded.set("Shop not found", missing);
  }
  if (!shops.length) return reject("NO_TARGETS", "No currently eligible shops were found.");
  return { shops, exclusions: [...excluded].map(([reason, count]) => ({ reason, count })) };
}
