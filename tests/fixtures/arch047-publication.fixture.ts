import { newMetaDraft } from "../../src/lib/admin/whatsapp-templates/authoring/draft-operations.ts";
import { makeImmutableAuthoringRecord } from "../../src/lib/admin/whatsapp-templates/authoring/compiler.ts";
import { templateHash } from "../../src/lib/admin/whatsapp-templates/authoring/identifiers.ts";
import { localizedInitialReplyNodes } from "../../src/lib/admin/whatsapp-templates/authoring/initial-reply-instructions.ts";
import { LANGUAGES } from "../../src/lib/admin/whatsapp-templates/publishing/validation.ts";

export const DEFINITION_ID = `wtdef_${"a".repeat(64)}`;
export const WABA = "1234567890";
export const ACTOR_ID = "arch047-publication-admin";
export const PROVIDER_NAME = "moda_initial_no_offer_arch047_fixture";

/** Direct, independently approved Database fixtures; no ADMIN-004/005/006 dependency. */
export function definitionFixture(withBrand = true) {
  const draft = newMetaDraft();
  if (withBrand) draft.header = [{ type: "text", value: "From " }, { type: "variable", name: "shopBrand.brandName" }];
  const record = makeImmutableAuthoringRecord(draft);
  const prepared = record.prepared;
  if (prepared.family !== "META_RECOVERY") throw new Error("Expected Meta fixture");
  const hash = templateHash(prepared);
  const localizedRecord = (languageTag: string) => {
    const authoring = structuredClone(draft);
    if (languageTag !== "en") {
      const tail = authoring.body.slice(-3);
      const first = tail[0]?.type === "text" ? tail[0].value : "";
      const fromIndex = first.lastIndexOf("From ");
      if (fromIndex < 0) throw new Error(`Fixture initial copy is missing its Reply instruction for ${languageTag}.`);
      const prefix = first.slice(0, fromIndex);
      authoring.body = [
        ...authoring.body.slice(0, -3),
        ...(prefix ? [{ type: "text" as const, value: prefix }] : []),
        ...localizedInitialReplyNodes(languageTag, authoring.promotionTarget),
      ];
    }
    return makeImmutableAuthoringRecord(authoring);
  };
  const definition = {
    id: DEFINITION_ID, kind: "META_RECOVERY", purpose: "INITIAL", offerType: "NO_OFFER",
    audience: null, providerTemplateName: PROVIDER_NAME, category: "MARKETING",
    sourceLanguageTag: "en", astSchemaVersion: 1, status: "SAVED", sourceHash: templateHash(draft),
    retiredAt: null, publishedAt: null,
    locales: LANGUAGES.map((languageTag, index) => {
      const localeRecord = localizedRecord(languageTag);
      const localePrepared = localeRecord.prepared;
      if (localePrepared.family !== "META_RECOVERY") throw new Error("Expected localized Meta projection.");
      const contentHash = templateHash(localePrepared);
      return {
        id: `locale_${index}`, definitionId: DEFINITION_ID, languageTag,
        providerLanguageCode: languageTag, localeAst: localeRecord, contentHash,
        status: languageTag === "en" ? "SOURCE_SAVED" : "REVIEWED",
        reviewedAt: languageTag === "en" ? null : new Date("2026-10-25T10:00:00Z"),
        reviewedByAdminId: languageTag === "en" ? null : ACTOR_ID,
        metaRegistrations: [{
          id: `registration_${index}`, localeId: `locale_${index}`, wabaId: WABA,
          providerTemplateName: PROVIDER_NAME, providerLanguageCode: languageTag,
          category: "MARKETING", providerTemplateId: String(1000 + index),
          componentsSnapshot: structuredClone(localePrepared.components),
          parameterBindingsSnapshot: structuredClone(localePrepared.parameterBindings),
          submittedContentHash: contentHash, providerStatus: "APPROVED", submissionState: "APPROVED",
          driftDetectedAt: null, lastObservedContentHash: contentHash, lastObservedCategory: "MARKETING",
          failureCode: null,
        }],
      };
    }),
  };
  return definition;
}
export function shopFixture(index: number, platform = "SHOPIFY", status = "ACTIVE", wooStatus: string | null = null) {
  return { id: `shop_${String(index).padStart(4, "0")}`, domain: `shop${index}.example.com`, platform, status,
    wooCommerceInstallation: platform === "WOOCOMMERCE" && wooStatus ? { status: wooStatus } : null,
  };
}

export function fixtureDatabase(input: {
  definition?: ReturnType<typeof definitionFixture>;
  shops?: ReturnType<typeof shopFixture>[];
  variants?: Array<Record<string, any>>; brands?: Array<Record<string, any>>;
} = {}) {
  const definition = input.definition ?? definitionFixture();
  const shops = input.shops ?? [shopFixture(1), shopFixture(2)];
  const variants = input.variants ?? [];
  const brands = input.brands ?? [];
  const db = {
    whatsAppTemplateDefinition: { findUnique: async ({ where }: any) => where.id === definition.id ? definition : null },
    shop: {
      findUnique: async ({ where }: any) => shops.find((s) => s.id === where.id) ?? null,
      findMany: async ({ where, cursor, skip, take }: any) => {
        let results = [...shops].sort((a, b) => a.id.localeCompare(b.id));
        if (where?.id?.in) results = results.filter((s) => where.id.in.includes(s.id));
        if (cursor) results = results.filter((s) => s.id > cursor.id);
        return results.slice(skip && !cursor ? skip : 0, (skip && !cursor ? skip : 0) + take);
      },
    },
    whatsAppTemplateVariant: { findMany: async ({ where }: any) => variants.filter((v) =>
      where.shopId.in.includes(v.shopId) && where.languageTag.in.includes(v.languageTag) &&
      v.purpose === where.purpose && v.providerAccountId === where.providerAccountId && v.enabled && v.status === "APPROVED"),
    },
    shopBrand: { findMany: async ({ where }: any) => brands.filter((b) => where.shopId.in.includes(b.shopId)) },
  };
  return { db, definition, shops, variants, brands };
}
