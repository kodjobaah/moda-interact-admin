import { newWrapperDraft } from "../../src/lib/admin/whatsapp-templates/authoring/draft-operations.ts";
import { compileTemplateAst } from "../../src/lib/admin/whatsapp-templates/authoring/compiler.ts";
import { templateHash } from "../../src/lib/admin/whatsapp-templates/authoring/identifiers.ts";
import { SHOP_BRAND_VARIABLES } from "../../src/lib/admin/whatsapp-templates/authoring/registry.ts";
import type { ContentNode, WrapperAudience, WrapperTemplateAst } from "../../src/lib/admin/whatsapp-templates/authoring/types.ts";
import { REVIEW_LANGUAGES } from "../../src/lib/admin/whatsapp-templates/compilation/language-codes.ts";
import type { WrapperDefinitionRow } from "../../src/lib/admin/whatsapp-templates/wrappers/contracts.ts";

export const FIXTURE_ID = `wtdef_${"a".repeat(64)}`;
export const ANOTHER_ID = `wtdef_${"b".repeat(64)}`;

/** Include every canonical ShopBrand field across the permitted wrapper sections. */
export function brandedWrapper(audience: WrapperAudience = "SHARED"): WrapperTemplateAst {
  const ast = newWrapperDraft(audience);
  const vars = (fields: readonly string[]): ContentNode[] => fields.map((name) => ({ type: "variable", name })) as ContentNode[];
  ast.header = [...vars(SHOP_BRAND_VARIABLES.slice(0, 3)), { type: "text", value: " Hello from us." }];
  ast.footer = [{ type: "text", value: "Thanks — " }, ...vars(SHOP_BRAND_VARIABLES.slice(3, 6))];
  ast.conditionals = [{ when: "checkout.available", nodes: [
    { type: "text", value: "Resume: " }, { type: "variable", name: "checkout.url" },
    { type: "text", value: " · " }, ...vars(SHOP_BRAND_VARIABLES.slice(6)),
  ] }];
  return ast;
}

export function wrapperRow({ id = FIXTURE_ID, audience = "SHARED", ast = brandedWrapper(audience) }: {
  id?: string; audience?: WrapperAudience; ast?: WrapperTemplateAst;
} = {}): WrapperDefinitionRow {
  const record = { schemaVersion: 1, authoring: ast, prepared: compileTemplateAst(ast) };
  const contentHash = templateHash(record.prepared);
  return {
    id, kind: "MODA_CONVERSATION_WRAPPER", audience, status: "SAVED", createdByAdminId: "fixture-admin",
    sourceLanguageTag: "en", astSchemaVersion: 1, sourceHash: templateHash(ast),
    publishedAt: null, retiredAt: null, createdAt: new Date("2026-10-25T12:00:00Z"),
    locales: REVIEW_LANGUAGES.map((languageTag) => ({ languageTag,
      status: languageTag === "en" ? "SOURCE_SAVED" : "REVIEWED", providerLanguageCode: null,
      localeAst: structuredClone(record), contentHash, reviewedByAdminId: languageTag === "en" ? null : "fixture-admin",
      reviewedAt: languageTag === "en" ? null : new Date("2026-10-25T12:00:00Z"),
    })),
  };
}
