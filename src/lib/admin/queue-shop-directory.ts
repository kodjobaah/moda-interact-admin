import { prisma } from "@/lib/prisma";

import type { QueueJobDetail, QueueJobSnapshot } from "./queue-monitor";

const SHOP_DIRECTORY_TIMEOUT_MS = 1_000;

type ShopDomainLookup = (shopIds: string[]) => Promise<Map<string, string>>;

function uniqueShopIds(values: Iterable<string>) {
  return [...new Set([...values].filter(Boolean))];
}

async function withDirectoryTimeout<T>(promise: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Shop directory lookup timed out")),
          SHOP_DIRECTORY_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function lookupQueueShopDomains(
  shopIds: string[],
): Promise<Map<string, string>> {
  const uniqueIds = uniqueShopIds(shopIds);
  if (uniqueIds.length === 0) return new Map();

  try {
    const shops = await withDirectoryTimeout(
      prisma.shop.findMany({
        where: { id: { in: uniqueIds } },
        select: { id: true, domain: true },
      }),
    );
    return new Map(shops.map((shop) => [shop.id, shop.domain]));
  } catch {
    // Queue diagnostics must remain usable when PostgreSQL is unavailable.
    // In that case the UI falls back to the canonical shop ID from the job.
    return new Map();
  }
}

export async function enrichQueueJobSnapshotShopDomains(
  snapshot: QueueJobSnapshot,
  lookup: ShopDomainLookup = lookupQueueShopDomains,
): Promise<QueueJobSnapshot> {
  const identifiedShopIds = uniqueShopIds([
    ...snapshot.jobs.flatMap((job) =>
      job.attribution === "identified" && job.shop ? [job.shop] : [],
    ),
    ...snapshot.facets.shops.flatMap((facet) =>
      facet.value.startsWith("id:") ? [facet.value.slice(3)] : [],
    ),
  ]);
  if (identifiedShopIds.length === 0) return snapshot;

  let domains: Map<string, string>;
  try {
    domains = await lookup(identifiedShopIds);
  } catch {
    domains = new Map();
  }

  return {
    ...snapshot,
    jobs: snapshot.jobs.map((job) =>
      job.attribution === "identified" && job.shop
        ? { ...job, shopDomain: domains.get(job.shop) ?? null }
        : job,
    ),
    facets: {
      ...snapshot.facets,
      shops: snapshot.facets.shops.map((facet) => {
        if (!facet.value.startsWith("id:")) return facet;
        const shopId = facet.value.slice(3);
        const domain = domains.get(shopId);
        return domain ? { ...facet, label: domain } : facet;
      }),
    },
  };
}

export async function enrichQueueJobDetailShopDomain(
  detail: QueueJobDetail,
  lookup: ShopDomainLookup = lookupQueueShopDomains,
): Promise<QueueJobDetail> {
  if (detail.attribution !== "identified" || !detail.shop) return detail;

  let domains: Map<string, string>;
  try {
    domains = await lookup([detail.shop]);
  } catch {
    domains = new Map();
  }
  return { ...detail, shopDomain: domains.get(detail.shop) ?? null };
}
