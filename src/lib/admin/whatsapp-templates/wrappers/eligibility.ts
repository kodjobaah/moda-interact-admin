import { stableJson } from "../authoring/canonical";
import { compileTemplateAst } from "../authoring/compiler";
import { templateHash } from "../authoring/identifiers";
import { SHOP_BRAND_VARIABLES } from "../authoring/registry";
import { validateTemplateAst } from "../authoring/validation";
import type { RuntimeToken, WrapperPrepared } from "../authoring/types";
import { REVIEW_LANGUAGES } from "../compilation/language-codes";
import type { Audience, WrapperDefinitionRow, WrapperEligibility } from "./contracts";

function fail(reason: string): WrapperEligibility { return { eligible: false, reason }; }
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function identities(tokens: RuntimeToken[]): string[] {
  return tokens.filter((token) => token.kind !== "text")
    .map((token) => token.kind === "responseSlot" ? "response.body" : token.name).sort();
}
function preservesProtectedTokens(source: WrapperPrepared, translation: WrapperPrepared): boolean {
  const same = (a: RuntimeToken[], b: RuntimeToken[]) => stableJson(identities(a)) === stableJson(identities(b));
  return same(source.header, translation.header) && same(source.body, translation.body) &&
    same(source.footer, translation.footer) && source.conditionals.length === translation.conditionals.length &&
    source.conditionals.every((item, i) => item.when === translation.conditionals[i].when &&
      same(item.tokens, translation.conditionals[i].tokens));
}

/**
 * Reject tampered/missing locale snapshots. The existing Admin compiler is the
 * sole source of prepared semantics; this module never authors or compiles a
 * different AST format. No merchant-specific values are admitted here.
 */
export function checkWrapperEligibility(definition: WrapperDefinitionRow, audience: Audience): WrapperEligibility {
  if (definition.kind !== "MODA_CONVERSATION_WRAPPER" || definition.audience !== audience ||
      !definition.createdByAdminId || definition.sourceLanguageTag !== "en" || definition.astSchemaVersion !== 1 ||
      !["SAVED", "PUBLISHED"].includes(definition.status) || definition.retiredAt !== null) {
    return fail("Definition is not an available, centrally authored wrapper for the selected audience.");
  }
  if (!/^[a-f0-9]{64}$/.test(definition.sourceHash)) return fail("Invalid immutable English source digest.");
  const expected = new Set(REVIEW_LANGUAGES);
  if (expected.size !== 20 || definition.locales.length !== expected.size ||
      new Set(definition.locales.map((locale) => locale.languageTag)).size !== expected.size ||
      definition.locales.some((locale) => !expected.has(locale.languageTag))) {
    return fail("All 20 canonical languages must be present exactly once.");
  }
  const projections: Record<string, WrapperPrepared> = {};
  for (const locale of definition.locales) {
    const english = locale.languageTag === "en";
    if (locale.status !== (english ? "SOURCE_SAVED" : "REVIEWED") ||
        locale.providerLanguageCode !== null ||
        (!english && (!locale.reviewedAt || !locale.reviewedByAdminId))) {
      return fail(`${locale.languageTag}: locale is not immutably reviewed.`);
    }
    if (!record(locale.localeAst) || locale.localeAst.schemaVersion !== 1 ||
        !record(locale.localeAst.authoring) || !record(locale.localeAst.prepared)) {
      return fail(`${locale.languageTag}: prepared runtime projection is missing or malformed.`);
    }
    const saved = locale.localeAst;
    const storedPrepared = saved.prepared;
    if (!record(storedPrepared)) return fail(`${locale.languageTag}: missing prepared projection.`);
    const checked = validateTemplateAst(saved.authoring);
    if (!checked.ok || checked.value.family !== "MODA_CONVERSATION_WRAPPER" ||
        checked.value.audience !== audience) {
      return fail(`${locale.languageTag}: invalid wrapper authoring or audience.`);
    }
    if (english && templateHash(checked.value) !== definition.sourceHash) {
      return fail("The immutable English source hash has changed.");
    }
    try {
      const prepared = compileTemplateAst(checked.value);
      if (prepared.family !== "MODA_CONVERSATION_WRAPPER" ||
          storedPrepared.family !== "MODA_CONVERSATION_WRAPPER" ||
          stableJson(storedPrepared) !== stableJson(prepared) ||
          locale.contentHash !== templateHash(prepared) ||
          prepared.body.filter((token) => token.kind === "responseSlot").length !== 1 ||
          prepared.responseSlot !== "response.body") {
        return fail(`${locale.languageTag}: immutable compiled projection, digest or response slot mismatch.`);
      }
      projections[locale.languageTag] = prepared;
    } catch {
      return fail(`${locale.languageTag}: compilation or runtime-projection integrity check failed.`);
    }
  }
  const english = projections.en;
  for (const [tag, translated] of Object.entries(projections)) {
    if (!preservesProtectedTokens(english, translated)) {
      return fail(`${tag}: protected variable identities differ from the English source.`);
    }
  }
  // Explicitly retain all eight ShopBrand semantic names as data references. The
  // validator/compiler already checks permitted placement and rejects unknown keys.
  const supported = new Set<string>(SHOP_BRAND_VARIABLES);
  for (const prepared of Object.values(projections)) {
    const sections = [prepared.header, prepared.body, prepared.footer,
      ...prepared.conditionals.map((conditional) => conditional.tokens)];
    if (sections.flat().some((token) => token.kind === "variable" && token.name.startsWith("shopBrand.") && !supported.has(token.name))) {
      return fail("Prepared wrapper contains an unknown ShopBrand binding.");
    }
  }
  return { eligible: true, projections };
}
