import type { Prisma } from "@prisma/client";
import { LANGUAGES, equivalentRegistration, isValidDefinitionId, makeTemplateView, brandKeys, digest, reject } from "./validation";
import { stableJson } from "../authoring/canonical";
import { templateHash } from "../authoring/identifiers";
import type { CompiledTemplateView } from "./types";

type SourceReader = Pick<Prisma.TransactionClient, "whatsAppTemplateDefinition">;
export type ApprovedLocale = { languageTag: string; registrationId: string; view: CompiledTemplateView;
  providerLanguageCode: string; providerTemplateName: string; providerTemplateId: string; brandFields: string[] };
export type ApprovedSource = { id: string; purpose: string; offerType: string; promotionTarget?: "CHECKOUT" | "ALTERNATIVE_PRODUCT";
  headerKind: "NONE" | "TEXT" | "IMAGE"; wabaId: string; name: string;
  fingerprint: string; locales: ApprovedLocale[]; brandFields: string[] };

/** Content equivalence, Meta approval and provider identity are verified together.
 * Never use provider catalogue listings or an external/legacy template as the source. */
export async function approvedSource(db: SourceReader, definitionId: string, wabaId: string): Promise<ApprovedSource> {
  if (!isValidDefinitionId(definitionId) || !/^\d{4,32}$/.test(wabaId)) return reject("INPUT", "Invalid template identity.");
  const definition = await db.whatsAppTemplateDefinition.findUnique({ where: { id: definitionId }, include: {
    locales: { include: { metaRegistrations: { where: { wabaId } } } },
  } });
  if (!definition || definition.kind !== "META_RECOVERY" || !["INITIAL", "FOLLOW_UP"].includes(definition.purpose || "") ||
      !["NO_OFFER", "CODE_OFFER", "AUTOMATIC_OFFER"].includes(definition.offerType || "") ||
      !["SAVED", "PUBLISHED"].includes(definition.status) || definition.retiredAt ||
      definition.astSchemaVersion !== 1 || definition.sourceLanguageTag !== "en" ||
      definition.category !== "MARKETING" || !definition.providerTemplateName) return reject("NOT_READY", "A saved, active Moda recovery definition is required.");
  if (definition.locales.length !== LANGUAGES.length ||
      definition.locales.some((locale) => !LANGUAGES.includes(locale.languageTag as typeof LANGUAGES[number]))) return reject("NOT_READY", "All 20 supported locales must exist.");
  const english = definition.locales.find((locale) => locale.languageTag === "en")?.localeAst;
  if (!english || typeof english !== "object" || Array.isArray(english) ||
      !("authoring" in english) || templateHash((english as Record<string, unknown>).authoring) !== definition.sourceHash) return reject("CONTENT", "English immutable source hash mismatch.");
  const authoring = (english as { authoring: Record<string, unknown> }).authoring;
  const prepared = (english as { prepared: Record<string, unknown> }).prepared;
  const bindings = prepared?.parameterBindings as Record<string, unknown> | undefined;
  const promotionTarget = authoring.promotionTarget === "CHECKOUT" || authoring.promotionTarget === "ALTERNATIVE_PRODUCT"
    ? authoring.promotionTarget : definition.offerType === "NO_OFFER" ? undefined : "CHECKOUT";
  if (authoring.offerType !== definition.offerType || authoring.stage !== definition.purpose ||
      (authoring.promotionTarget !== undefined && authoring.promotionTarget !== promotionTarget) ||
      (definition.offerType === "NO_OFFER" && bindings?.promotionTarget !== undefined) ||
      (authoring.promotionTarget !== undefined && bindings?.promotionTarget !== authoring.promotionTarget)) {
    return reject("CONTENT", "Approved target differs from the immutable authoring and compiled projection.");
  }
  const components = Array.isArray(prepared?.components) ? prepared.components as Array<Record<string, unknown>> : [];
  const header = components.find((component) => component.type === "HEADER");
  const headerKind = header?.format === "IMAGE" ? "IMAGE" : header?.format === "TEXT" ? "TEXT" : "NONE";
  const locales = LANGUAGES.map((tag) => {
    const locale = definition.locales.find((row) => row.languageTag === tag);
    if (!locale || !["SOURCE_SAVED", "REVIEWED", "APPROVED", "READY"].includes(locale.status) ||
        locale.metaRegistrations.length !== 1) return reject("NOT_READY", `No approved registration for ${tag}.`);
    const reg = locale.metaRegistrations[0];
    if (!locale.providerLanguageCode || reg.wabaId !== wabaId || reg.submissionState !== "APPROVED" ||
        reg.providerLanguageCode !== locale.providerLanguageCode ||
        reg.providerTemplateName !== definition.providerTemplateName || reg.category !== definition.category ||
        !equivalentRegistration(reg, locale)) return reject("NOT_READY", `Meta approval or content verification failed for ${tag}.`);
    const view = makeTemplateView(reg);
    return { languageTag: tag, registrationId: reg.id, view, brandFields: brandKeys(view.bindings!),
      providerLanguageCode: reg.providerLanguageCode, providerTemplateName: reg.providerTemplateName,
      providerTemplateId: reg.providerTemplateId! };
  });
  // Translations may legitimately reorder placeholders, but may not introduce,
  // remove, or reassign semantic variables (or move a URL button binding). This
  // checks the 20 language projections against the authoritative English source.
  const bindingsSignature = (view: CompiledTemplateView): string => stableJson({
    promotionTarget: view.bindings?.promotionTarget,
    header: (view.bindings?.header ?? []).map((binding) => binding.variable).sort(),
    body: (view.bindings?.body ?? []).map((binding) => binding.variable).sort(),
    buttons: (view.bindings?.buttons ?? []).map((binding) => [binding.index, binding.variable])
      .sort((a, b) => Number(a[0]) - Number(b[0])),
  });
  const englishLocale = locales.find((locale) => locale.languageTag === "en");
  if (!englishLocale || locales.some((locale) => bindingsSignature(locale.view) !== bindingsSignature(englishLocale.view))) {
    return reject("CONTENT", "Reviewed translations do not preserve English semantic variable bindings.");
  }
  const purpose = `${definition.purpose}_${definition.offerType}`;
  return { id: definitionId, purpose, offerType: definition.offerType!, promotionTarget, headerKind, wabaId, name: definition.providerTemplateName,
    locales, brandFields: [...new Set(locales.flatMap((locale) => locale.brandFields))].sort(),
    fingerprint: digest({ definition: { id: definition.id, sourceHash: definition.sourceHash, purpose, promotionTarget, headerKind },
      locales: locales.map((item) => [item.languageTag, item.registrationId, item.view]) }) };
}
