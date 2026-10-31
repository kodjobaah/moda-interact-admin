import { newMetaDraft } from "../../src/lib/admin/whatsapp-templates/authoring/draft-operations.ts";
import { compileTemplateAst } from "../../src/lib/admin/whatsapp-templates/authoring/compiler.ts";
import { templateHash } from "../../src/lib/admin/whatsapp-templates/authoring/identifiers.ts";
import { localizedInitialReplyNodes } from "../../src/lib/admin/whatsapp-templates/authoring/initial-reply-instructions.ts";
import { makeMetaSubmissionPlan } from "../../src/lib/admin/whatsapp-templates/meta/snapshot.ts";
import { META_LANGUAGES, expectedProviderLanguageCode } from "../../src/lib/admin/whatsapp-templates/meta/languages.ts";
import type { DefinitionForMeta, LocaleForMeta } from "../../src/lib/admin/whatsapp-templates/meta/snapshot.ts";

const ID = `wtdef_${"a".repeat(64)}`;
export function localizedInitialCopy(ast: ReturnType<typeof newMetaDraft>, languageTag: string) {
  const localized = structuredClone(ast);
  if (languageTag === "en") return localized;
  const replyTail = localized.body.slice(-3);
  const intro = replyTail[0]?.type === "text" ? replyTail[0].value : "";
  const fromIndex = intro.lastIndexOf("From ");
  if (fromIndex < 0 || replyTail[1]?.type !== "variable" || replyTail[1].name !== "shop.name" || replyTail[2]?.type !== "text") {
    throw new Error(`Fixture initial copy is missing its Reply instruction for ${languageTag}.`);
  }
  const beforeReply = intro.slice(0, fromIndex);
  localized.body = [
    ...localized.body.slice(0, -3),
    ...(beforeReply ? [{ type: "text" as const, value: beforeReply }] : []),
    ...localizedInitialReplyNodes(languageTag, localized.promotionTarget),
  ];
  return localized;
}

export function fixture() {
  const english = newMetaDraft("INITIAL", "NO_OFFER");
  english.header = [{ type: "text", value: "Welcome " }, { type: "variable", name: "shopBrand.brandName" }];
  english.body = [{ type: "text", value: "Customer " }, { type: "variable", name: "customer.firstName" },
    { type: "text", value: " sees " }, { type: "variable", name: "shopBrand.logoAltText" },
    { type: "text", value: ".\n\nFrom " }, { type: "variable", name: "shop.name" },
    { type: "text", value: ". Need help with this basket? Use WhatsApp's Reply option on this message, then type your question or send a voice note (up to 2 minutes)." }];
  english.buttons = [{ type: "url", label: "Return to checkout", urlPrefix: "https://shop.example.org/checkout/", variable: "checkout.url" }];
  const definition: DefinitionForMeta = { id: ID, kind: "META_RECOVERY", purpose: "INITIAL", offerType: "NO_OFFER",
    providerTemplateName: "moda_initial_no_offer_a1234567890", category: "MARKETING",
    sourceHash: templateHash(english), sourceLanguageTag: "en", status: "SAVED" };
  const locales: LocaleForMeta[] = META_LANGUAGES.map((tag) => {
    const authoring = structuredClone(english);
    if (tag === "fr") {
      authoring.body = [{ type: "variable", name: "shopBrand.logoAltText" },
        { type: "text", value: " avant " }, { type: "variable", name: "customer.firstName" },
        { type: "text", value: ".\n\nFrom " }, { type: "variable", name: "shop.name" },
        { type: "text", value: ". Need help with this basket? Use WhatsApp's Reply option on this message, then type your question or send a voice note (up to 2 minutes)." }];
    }
    const localizedAuthoring = localizedInitialCopy(authoring, tag);
    const prepared = compileTemplateAst(localizedAuthoring);
    return { id: `locale-${tag}`, definitionId: definition.id, languageTag: tag,
      providerLanguageCode: expectedProviderLanguageCode(tag),
      localeAst: { schemaVersion: 1, authoring: localizedAuthoring, prepared }, contentHash: templateHash(prepared),
      status: tag === "en" ? "SOURCE_SAVED" : "REVIEWED",
      reviewedByAdminId: tag === "en" ? null : "admin-123", reviewedAt: tag === "en" ? null : new Date("2026-10-24T12:00:00Z") };
  });
  return { definition, locales, plan: () => makeMetaSubmissionPlan({ definition, locales, trustedWabaId: "123456789012" }) };
}
