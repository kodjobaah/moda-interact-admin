import type { Prisma } from "@prisma/client";
import type { ApprovedSource } from "./source";
import type { BrandIndicator, ImpactKind, LanguageComparison, PublicationShopImpact } from "./types";
import { brandAvailability, classify, digest, emptyCounts, makeTemplateView, unavailableHistory } from "./validation";
import type { ShopCandidate } from "./discovery";

type ImpactReader = Pick<Prisma.TransactionClient, "whatsAppTemplateVariant" | "shopBrand">;
type Variant = {
  id: string; shopId: string; metaRegistrationId: string | null;
  providerTemplateName: string; providerLanguageCode: string; providerTemplateId: string | null;
  status: string; updatedAt: Date;
  metaRegistration: { providerTemplateName: string; providerLanguageCode: string;
    category: string; componentsSnapshot: Prisma.JsonValue; parameterBindingsSnapshot: Prisma.JsonValue;
    providerStatus: string | null } | null;
};
export type ShopImpact = { public: PublicationShopImpact; digest: string;
  variantsByLanguage: Map<string, Variant[]>; brand: BrandIndicator[] };

/** A matching registration FK is not sufficient for an unchanged slot: its
 * persisted Meta name, language and template identity must also match. */
export function impactKind(current: Variant[], locale: ApprovedSource["locales"][number]): ImpactKind {
  const kind = classify(current, locale.registrationId);
  if (kind !== "unchanged") return kind;
  const variant = current[0];
  return variant.providerTemplateName === locale.providerTemplateName &&
    variant.providerLanguageCode === locale.providerLanguageCode &&
    variant.providerTemplateId === locale.providerTemplateId ? "unchanged" : "conflict";
}

function matchesSelectedVariant(variant: Variant, source: ApprovedSource): boolean {
  const registration = variant.metaRegistration;
  if (!registration) return true;
  const bindings = registration.parameterBindingsSnapshot && typeof registration.parameterBindingsSnapshot === "object"
    ? registration.parameterBindingsSnapshot as Record<string, unknown> : {};
  const registeredTarget = bindings.promotionTarget ?? (source.offerType === "NO_OFFER" ? undefined : "CHECKOUT");
  if (registeredTarget !== source.promotionTarget) return false;
  const components = Array.isArray(registration.componentsSnapshot) ? registration.componentsSnapshot as Array<Record<string, unknown>> : [];
  const header = components.find((component) => component.type === "HEADER");
  const headerKind = header?.format === "IMAGE" ? "IMAGE" : header?.format === "TEXT" ? "TEXT" : "NONE";
  return headerKind === source.headerKind;
}

function brandState(keys: string[], row: Record<string, unknown> | null, verified: boolean): BrandIndicator[] {
  return brandAvailability(keys, row, verified);
}
export async function readShopImpacts(db: ImpactReader, source: ApprovedSource, shops: ShopCandidate[], includeBrand = true): Promise<ShopImpact[]> {
  if (!shops.length) return [];
  const ids = shops.map((s) => s.id);
  const variants = await db.whatsAppTemplateVariant.findMany({ where: {
    shopId: { in: ids }, providerAccountId: source.wabaId, purpose: source.purpose,
    languageTag: { in: source.locales.map((l) => l.languageTag) },
    status: "APPROVED", enabled: true,
  }, select: { id: true, shopId: true, providerAccountId: true, purpose: true, languageTag: true,
    providerLanguageCode: true, providerTemplateName: true, providerTemplateId: true,
    status: true, enabled: true, metaRegistrationId: true, updatedAt: true,
    metaRegistration: { select: { providerTemplateName: true, providerLanguageCode: true, category: true,
      componentsSnapshot: true, parameterBindingsSnapshot: true, providerStatus: true } } } });
  // For a failed optional ShopBrand query, availability becomes "unverifiable",
  // not absent, and publication eligibility is otherwise unaffected.
  let brands: Array<Record<string, unknown>> = []; let brandReadSucceeded = true;
  if (source.brandFields.length && includeBrand) {
    try {
      const result = await db.shopBrand.findMany({ where: { shopId: { in: ids } }, select: {
        shopId: true, brandName: true, logoUrl: true, logoAltText: true, logoWidth: true, logoHeight: true,
        squareLogoUrl: true, squareLogoAltText: true, coverImageUrl: true,
      } });
      brands = result as unknown as Array<Record<string, unknown>>;
    } catch { brandReadSucceeded = false; }
  }
  return shops.map((shop) => {
    const byLanguage = new Map<string, Variant[]>(source.locales.map((l) => [l.languageTag, variants.filter((v) =>
      v.shopId === shop.id && v.languageTag === l.languageTag && matchesSelectedVariant(v, source))]));
    const counts = emptyCounts();
    for (const locale of source.locales) counts[impactKind(byLanguage.get(locale.languageTag) ?? [], locale)]++;
    const brand = brandState(source.brandFields, brands.find((b) => b.shopId === shop.id) ?? null, brandReadSucceeded && includeBrand);
    const slotDigest = digest({ shop: [shop.id, shop.status, shop.platform, shop.wooStatus],
      slots: [...byLanguage].map(([language, entries]) => [language, entries.map((v) =>
        [v.id, v.metaRegistrationId, v.providerTemplateName, v.providerLanguageCode, v.providerTemplateId, v.updatedAt.toISOString()])]) });
    return { public: { shopId: shop.id, domain: shop.domain, platform: shop.platform, counts, brand },
      variantsByLanguage: byLanguage, brand, digest: slotDigest };
  });
}

export function comparison(source: ApprovedSource, impact: ShopImpact, shopId: string, languageTag: string): LanguageComparison {
  const locale = source.locales.find((l) => l.languageTag === languageTag);
  if (!locale) throw new Error("Unsupported language tag.");
  const variants = impact.variantsByLanguage.get(languageTag) ?? [];
  const current = variants[0];
  const previous = current?.metaRegistration ? makeTemplateView(current.metaRegistration) : unavailableHistory(current);
  if (variants.length > 1) previous.label = "Ambiguous current slot — resolve before publication";
  return { shopId, languageTag, impact: impactKind(variants, locale), previous,
    proposed: locale.view, brand: impact.brand.filter((b) => locale.brandFields.includes(b.key)) };
}
