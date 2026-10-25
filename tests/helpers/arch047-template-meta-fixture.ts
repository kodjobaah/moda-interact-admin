import { newMetaDraft } from "../../src/lib/admin/whatsapp-templates/authoring/draft-operations.ts";
import { compileTemplateAst } from "../../src/lib/admin/whatsapp-templates/authoring/compiler.ts";
import { templateHash } from "../../src/lib/admin/whatsapp-templates/authoring/identifiers.ts";
import { makeMetaSubmissionPlan } from "../../src/lib/admin/whatsapp-templates/meta/snapshot.ts";
import { META_LANGUAGES, expectedProviderLanguageCode } from "../../src/lib/admin/whatsapp-templates/meta/languages.ts";
import type { DefinitionForMeta, LocaleForMeta } from "../../src/lib/admin/whatsapp-templates/meta/snapshot.ts";

const ID = `wtdef_${"a".repeat(64)}`;
export function fixture() {
  const english = newMetaDraft("INITIAL", "NO_OFFER");
  english.header = [{ type: "text", value: "Welcome " }, { type: "variable", name: "shopBrand.brandName" }];
  english.body = [{ type: "text", value: "Customer " }, { type: "variable", name: "customer.firstName" },
    { type: "text", value: " sees " }, { type: "variable", name: "shopBrand.logoAltText" }];
  english.buttons = [{ type: "url", label: "Return to checkout", urlPrefix: "https://shop.example.org/checkout/", variable: "checkout.url" }];
  const definition: DefinitionForMeta = { id: ID, kind: "META_RECOVERY", purpose: "INITIAL", offerType: "NO_OFFER",
    providerTemplateName: "moda_initial_no_offer_a1234567890", category: "MARKETING",
    sourceHash: templateHash(english), sourceLanguageTag: "en", status: "SAVED" };
  const locales: LocaleForMeta[] = META_LANGUAGES.map((tag) => {
    const authoring = structuredClone(english);
    if (tag === "fr") {
      authoring.body = [{ type: "variable", name: "shopBrand.logoAltText" },
        { type: "text", value: " avant " }, { type: "variable", name: "customer.firstName" }];
    }
    const prepared = compileTemplateAst(authoring);
    return { id: `locale-${tag}`, definitionId: definition.id, languageTag: tag,
      providerLanguageCode: expectedProviderLanguageCode(tag),
      localeAst: { schemaVersion: 1, authoring, prepared }, contentHash: templateHash(prepared),
      status: tag === "en" ? "SOURCE_SAVED" : "REVIEWED",
      reviewedByAdminId: tag === "en" ? null : "admin-123", reviewedAt: tag === "en" ? null : new Date("2026-10-24T12:00:00Z") };
  });
  return { definition, locales, plan: () => makeMetaSubmissionPlan({ definition, locales, trustedWabaId: "123456789012" }) };
}
