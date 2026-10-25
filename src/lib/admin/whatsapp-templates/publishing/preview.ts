import type { Prisma } from "@prisma/client";
import type { PublicationPreview, PublicationScope, PublicationShopImpact, ImpactKind, LanguageComparison } from "./types";
import { EXPECTED_LANGUAGES, PREVIEW_TTL_MS, SHOP_PAGE_SIZE } from "./types";
import { approvedSource, type ApprovedSource } from "./source";
import { discoverScope } from "./discovery";
import { readShopImpacts, comparison } from "./impact";
import { digest, emptyCounts, isValidDefinitionId, isValidFingerprint, LANGUAGES, reject } from "./validation";

type PreviewReader = Pick<Prisma.TransactionClient, "whatsAppTemplateDefinition" | "shop" | "whatsAppTemplateVariant" | "shopBrand">;
export type VerifiedPreview = {
  source: ApprovedSource;
  shopIds: string[]; shopDigests: Record<string, string>;
  previewFingerprint: string; impactCounts: Record<ImpactKind, number>;
  excludedCount: number; exclusionReasons: Array<{ reason: string; count: number }>;
  pageItems: PublicationShopImpact[]; hasNext: boolean;
};

/** Derived from server-side shop, slot, registration and reviewed-content state.
 * Never trust browser preview impact summaries when confirming or applying. */
export async function computePreview(db: PreviewReader, definitionId: string, scope: PublicationScope,
  wabaId: string, issuedAt: string, page = 1): Promise<VerifiedPreview> {
  if (!isValidDefinitionId(definitionId) || !Number.isSafeInteger(page) || page < 1 || page > 2000) return reject("INPUT", "Invalid preview page.");
  const source = await approvedSource(db, definitionId, wabaId);
  const found = await discoverScope(db, scope);
  const overall = emptyCounts(); const shopDigests: Record<string, string> = Object.create(null);
  const pageItems: PublicationShopImpact[] = []; const offset = (page - 1) * SHOP_PAGE_SIZE;
  for (let start = 0; start < found.shops.length; start += 50) {
    const slice = found.shops.slice(start, start + 50);
    const rows = await readShopImpacts(db, source, slice);
    rows.forEach((row, index) => {
      shopDigests[row.public.shopId] = row.digest;
      (Object.keys(overall) as ImpactKind[]).forEach((kind) => { overall[kind] += row.public.counts[kind]; });
      if (start + index >= offset && start + index < offset + SHOP_PAGE_SIZE) pageItems.push(row.public);
    });
  }
  const shopIds = found.shops.map((shop) => shop.id);
  return { source, shopIds, shopDigests, impactCounts: overall, pageItems,
    excludedCount: found.exclusions.reduce((sum, e) => sum + e.count, 0), exclusionReasons: found.exclusions,
    hasNext: offset + SHOP_PAGE_SIZE < shopIds.length,
    previewFingerprint: digest({ issuedAt, scope, definitionId, wabaId,
      source: source.fingerprint, shopIds, shopDigests }) };
}
export function publicPreview(state: VerifiedPreview, definitionId: string, page: number, issuedAt: string): PublicationPreview {
  return { definitionId, fingerprint: state.previewFingerprint, totalShops: state.shopIds.length,
    totalTargets: state.shopIds.length * EXPECTED_LANGUAGES, excludedCount: state.excludedCount,
    exclusionReasons: state.exclusionReasons, page, pageSize: SHOP_PAGE_SIZE, hasNext: state.hasNext,
    shops: state.pageItems, impactCounts: state.impactCounts, brandFields: state.source.brandFields,
    issuedAt, expiresAt: new Date(new Date(issuedAt).getTime() + PREVIEW_TTL_MS).toISOString() };
}
export function assertFreshPreview(issuedAt: unknown, fingerprint: unknown): asserts issuedAt is string {
  if (typeof issuedAt !== "string" || !Number.isFinite(Date.parse(issuedAt)) ||
      Date.now() - Date.parse(issuedAt) < 0 || Date.now() - Date.parse(issuedAt) > PREVIEW_TTL_MS ||
      !isValidFingerprint(fingerprint)) return reject("STALE_PREVIEW", "Preview expired. Review current impact again.");
}
export async function languageComparison(db: PreviewReader, definitionId: string, scope: PublicationScope,
  wabaId: string, shopId: string, languageTag: string): Promise<LanguageComparison> {
  if (!LANGUAGES.includes(languageTag as typeof LANGUAGES[number]) ||
      typeof shopId !== "string" || !/^[a-zA-Z0-9_-]{1,191}$/.test(shopId)) return reject("INPUT", "Invalid shop or language.");
  // An arbitrary shop ID cannot override the selected scope.
  if (scope.mode === "one" && scope.shopId !== shopId ||
      scope.mode === "selected" && !scope.shopIds.includes(shopId)) return reject("FORBIDDEN", "Shop is outside the selected scope.");
  const shop = await db.shop.findUnique({ where: { id: shopId }, select: {
    id: true, domain: true, platform: true, status: true,
    wooCommerceInstallation: { select: { status: true } },
  } });
  if (!shop || shop.status !== "ACTIVE" || shop.platform === "WOOCOMMERCE" && shop.wooCommerceInstallation?.status !== "ACTIVE") return reject("INELIGIBLE", "Shop is no longer eligible.");
  const source = await approvedSource(db, definitionId, wabaId);
  const [impact] = await readShopImpacts(db, source, [{ id: shop.id, domain: shop.domain, status: shop.status,
    platform: shop.platform, wooStatus: shop.wooCommerceInstallation?.status ?? null }]);
  return comparison(source, impact, shopId, languageTag);
}
