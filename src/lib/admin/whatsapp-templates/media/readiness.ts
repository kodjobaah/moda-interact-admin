import type { ShopBrandMediaRole } from "../authoring/types";

export const SHOP_BRAND_MEDIA_ROLES = ["LOGO", "SQUARE_LOGO", "COVER_IMAGE"] as const;
export type MediaReadiness = "MISSING" | "PENDING" | "PROCESSING" | "FAILED" | "STALE" | "READY";
export type ReadyMedia = {
  status: "READY";
  role: ShopBrandMediaRole;
  url: string;
  contentType: "image/jpeg" | "image/png";
  width: number;
  height: number;
  sizeBytes: number;
};
export type MediaRoleView = ReadyMedia | {
  status: Exclude<MediaReadiness, "READY">;
  role: ShopBrandMediaRole;
};
export type ShopBrandMediaView = {
  shopId: string;
  domain: string;
  roles: Record<ShopBrandMediaRole, MediaRoleView>;
};

const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const digest = /^[0-9a-f]{64}$/;
const fingerprint = /^sha256:[0-9a-f]{64}$/;
const shopIdPattern = /^[A-Za-z0-9_-]{1,191}$/;

/** A media URL is derived solely from configured public origin + an immutable R2 key. */
export function verifiedRoleMedia(input: {
  media: unknown; shopId: string; role: ShopBrandMediaRole; publicOrigin: string;
}): MediaRoleView {
  const { media, shopId, role, publicOrigin } = input;
  const missing: MediaRoleView = { role, status: "MISSING" };
  if (!object(media) || media.schemaVersion !== 1 || !object(media.roles)) return missing;
  const entry = media.roles[role];
  if (!object(entry)) return missing;
  const work = object(entry.work) ? entry.work : null;
  const source = object(entry.source) ? entry.source : null;
  const ready = object(entry.ready) ? entry.ready : null;
  const status = work?.status;
  if (status === "MISSING") return missing;
  if (status === "PENDING" || status === "PROCESSING" || status === "FAILED") {
    return { role, status };
  }
  if (status !== "READY" || !source || !ready) return { role, status: "STALE" };
  if (typeof source.url !== "string" || !source.url.trim() ||
      !Number.isSafeInteger(source.generation) || (source.generation as number) < 1 ||
      typeof source.fingerprint !== "string" || !fingerprint.test(source.fingerprint) ||
      ready.sourceGeneration !== source.generation || ready.sourceFingerprint !== source.fingerprint) {
    return { role, status: "STALE" };
  }
  if (!shopIdPattern.test(shopId) || typeof ready.objectKey !== "string" ||
      typeof ready.contentSha256 !== "string" || !digest.test(ready.contentSha256) ||
      (ready.contentType !== "image/jpeg" && ready.contentType !== "image/png") ||
      !Number.isSafeInteger(ready.sizeBytes) || (ready.sizeBytes as number) <= 0 || (ready.sizeBytes as number) >= 5 * 1024 * 1024 ||
      !Number.isSafeInteger(ready.width) || !Number.isSafeInteger(ready.height) ||
      (ready.width as number) <= 0 || (ready.height as number) <= 0 ||
      (ready.width as number) * (ready.height as number) > 40_000_000 ||
      typeof ready.verifiedAt !== "string" || !Number.isFinite(Date.parse(ready.verifiedAt))) {
    return { role, status: "STALE" };
  }
  const ext = ready.contentType === "image/jpeg" ? "jpg" : "png";
  const key = `shop-brands/${shopId}/${role.toLowerCase()}/sha256-${ready.contentSha256}.${ext}`;
  if (ready.objectKey !== key) return { role, status: "STALE" };
  try {
    const origin = new URL(publicOrigin);
    if (origin.protocol !== "https:" || origin.username || origin.password || origin.search || origin.hash ||
        origin.pathname !== "/" || origin.origin + "/" !== origin.href) return { role, status: "STALE" };
    const url = new URL(key.split("/").map(encodeURIComponent).join("/"), origin);
    if (url.origin !== origin.origin || !url.pathname.startsWith("/shop-brands/")) return { role, status: "STALE" };
    return { role, status: "READY", url: url.href, contentType: ready.contentType, width: ready.width as number,
      height: ready.height as number, sizeBytes: ready.sizeBytes as number };
  } catch {
    return { role, status: "STALE" };
  }
}

export function projectShopBrandMedia(input: {
  media: unknown; shopId: string; domain: string; publicOrigin: string;
}): ShopBrandMediaView {
  return { shopId: input.shopId, domain: input.domain,
    roles: Object.fromEntries(SHOP_BRAND_MEDIA_ROLES.map((role) => [role, verifiedRoleMedia({ ...input, role })])) as ShopBrandMediaView["roles"] };
}
