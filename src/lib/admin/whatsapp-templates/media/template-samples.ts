/** Admin-only, environment-scoped sample images for template authoring.
 * They are NOT ShopBrand records, and must never be used for merchant delivery.
 */
import type { ShopBrandMediaRole } from "../authoring/types";
import { SHOP_BRAND_MEDIA_ROLES, type MediaRoleView } from "./readiness";

export const TEMPLATE_SAMPLE_MEDIA_KEY = "whatsapp.templateSamples";
export type TemplateSampleMediaView = {
  label: "Moda template example";
  roles: Record<ShopBrandMediaRole, MediaRoleView>;
};

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const SHA256 = /^[0-9a-f]{64}$/;
const ENVIRONMENTS = new Set(["development", "test"]);

export function emptyTemplateSamples(): TemplateSampleMediaView {
  return { label: "Moda template example", roles: {
    LOGO: { role: "LOGO", status: "MISSING" },
    SQUARE_LOGO: { role: "SQUARE_LOGO", status: "MISSING" },
    COVER_IMAGE: { role: "COVER_IMAGE", status: "MISSING" },
  } };
}

/** Only project content-addressed R2 objects from a fixed, seed-owned prefix.
 * Never trust persisted URLs or return original merchant image URLs.
 */
export function projectTemplateSamples(value: unknown, environment: string, publicOrigin: string): TemplateSampleMediaView {
  const output = emptyTemplateSamples();
  if (!ENVIRONMENTS.has(environment) || !object(value) || value.schemaVersion !== 1 ||
      value.environment !== environment || !object(value.assets)) return output;
  let origin: URL;
  try {
    origin = new URL(publicOrigin);
    if (origin.protocol !== "https:" || origin.username || origin.password || origin.port ||
        origin.search || origin.hash || origin.pathname !== "/" || origin.href !== origin.origin + "/") return output;
  } catch { return output; }
  for (const role of SHOP_BRAND_MEDIA_ROLES) {
    const asset = value.assets[role];
    if (!object(asset) || typeof asset.contentSha256 !== "string" || !SHA256.test(asset.contentSha256) ||
        asset.contentType !== "image/png" || !Number.isSafeInteger(asset.width) || !Number.isSafeInteger(asset.height) ||
        (asset.width as number) < 1 || (asset.height as number) < 1 ||
        (asset.width as number) * (asset.height as number) > 40_000_000 ||
        !Number.isSafeInteger(asset.sizeBytes) || (asset.sizeBytes as number) < 1 ||
        (asset.sizeBytes as number) >= 5 * 1024 * 1024 ||
        typeof asset.verifiedAt !== "string" || !Number.isFinite(Date.parse(asset.verifiedAt))) continue;
    const objectKey = `template-samples/${environment}/${role.toLowerCase()}/sha256-${asset.contentSha256}.png`;
    if (asset.objectKey !== objectKey) continue;
    output.roles[role] = {
      role, status: "READY", contentType: "image/png", width: asset.width as number,
      height: asset.height as number, sizeBytes: asset.sizeBytes as number,
      url: new URL(objectKey.split("/").map(encodeURIComponent).join("/"), origin).href,
    };
  }
  return output;
}
