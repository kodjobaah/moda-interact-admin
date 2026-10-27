import { compileTemplateAst } from "../authoring/compiler";
import { templateHash } from "../authoring/identifiers";
import type { ImmutableAuthoringRecord, MetaPrepared, MetaTemplateAst } from "../authoring/types";
import { DIGEST, MetaSubmissionError, type MetaLocaleSnapshot, type MetaSubmissionPlan } from "./contracts";
import { expectedProviderLanguageCode, META_LANGUAGES } from "./languages";

export type DefinitionForMeta = {
  id: string; kind: string; purpose: string | null; offerType: string | null;
  providerTemplateName: string | null; category: string | null;
  sourceHash: string; sourceLanguageTag: string; status: string;
};
export type LocaleForMeta = {
  id: string; definitionId: string; languageTag: string; providerLanguageCode: string | null;
  localeAst: unknown; contentHash: string | null; status: string;
  reviewedAt: Date | null; reviewedByAdminId: string | null;
};

const jsonObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const fail = (code: string, message: string): never => { throw new MetaSubmissionError(code, message); };

/** Frozen projection must be byte-for-byte digest compatible with the Admin compiler.
 * The IMAGE branch deliberately contains no merchant URL or sample upload handle. */
export function imageHeaderRegistrationBindings(prepared: MetaPrepared): MetaLocaleSnapshot["bindings"] {
  const role = prepared.parameterBindings.headerMediaRole;
  if (!role || prepared.parameterBindings.schemaVersion !== 1 ||
      (prepared.parameterBindings.header ?? []).length !== 0 ||
      !prepared.components.some((component) => component.type === "HEADER" && component.format === "IMAGE")) {
    throw new MetaSubmissionError("BINDINGS_INVALID", "An immutable IMAGE role projection is required.");
  }
  return JSON.parse(JSON.stringify(prepared.parameterBindings)) as MetaLocaleSnapshot["bindings"];
}

/** Verify the saved AST by calling the ONE Admin compiler, never compiling Meta in this module. */
export function frozenLocaleSnapshot(row: LocaleForMeta, def: DefinitionForMeta): MetaLocaleSnapshot {
  if (row.definitionId !== def.id) fail("INVALID_LOCALE", "Locale is not owned by this definition.");
  const code = expectedProviderLanguageCode(row.languageTag);
  if (row.providerLanguageCode !== code) fail("INVALID_PROVIDER_LANGUAGE", `Provider language does not match ${row.languageTag}.`);
  if (row.languageTag === "en") {
    if (!["SOURCE_SAVED", "REVIEWED", "APPROVED"].includes(row.status)) fail("LOCALE_NOT_REVIEWED", "English source is not ready.");
  } else if (!["REVIEWED", "APPROVED"].includes(row.status) || !row.reviewedAt || !row.reviewedByAdminId) {
    fail("LOCALE_NOT_REVIEWED", `Review ${row.languageTag} before submitting.`);
  }
  if (!jsonObject(row.localeAst) || row.localeAst.schemaVersion !== 1 ||
      !jsonObject(row.localeAst.authoring) || !jsonObject(row.localeAst.prepared)) {
    fail("INVALID_LOCALE", `No immutable compiled Meta projection for ${row.languageTag}.`);
  }
  const record = row.localeAst as unknown as ImmutableAuthoringRecord;
  const source = record.authoring;
  if (source.family !== "META_RECOVERY" || source.schemaVersion !== 1 ||
      source.stage !== def.purpose || source.offerType !== def.offerType || source.sourceLanguageTag !== "en") {
    fail("INVALID_LOCALE", `Inconsistent template kind or purpose for ${row.languageTag}.`);
  }
  const contentHash = row.contentHash;
  if (!contentHash || !DIGEST.test(contentHash) || templateHash(record.prepared) !== contentHash) {
    throw new MetaSubmissionError("LOCALE_HASH_MISMATCH", `Frozen content digest differs for ${row.languageTag}.`);
  }
  // This also detects forged or stale positional/header/button semantic bindings,
  // including reordered brand variables in the translated AST.
  const recompiled = (() => {
    try { return compileTemplateAst(source as MetaTemplateAst) as MetaPrepared; }
    catch { throw new MetaSubmissionError("INVALID_LOCALE", `Stored Meta projection is invalid for ${row.languageTag}.`); }
  })();
  if (templateHash(recompiled) !== contentHash || record.prepared.family !== "META_RECOVERY" ||
      record.prepared.category !== "MARKETING") {
    fail("BINDING_HASH_MISMATCH", `Component/variable mapping differs for ${row.languageTag}.`);
  }
  if (row.languageTag === "en" && templateHash(source) !== def.sourceHash) {
    fail("SOURCE_HASH_MISMATCH", "Saved English definition has changed.");
  }
  // No trusted Media Upload sample producer exists yet. Saving/translating IMAGE
  // definitions is allowed; provider registration is not. This is never a link.
  const imageHeader = recompiled.components.find((component) => component.type === "HEADER" && component.format === "IMAGE");
  if (imageHeader) {
    const example = imageHeader.example;
    if (!jsonObject(example) || !Array.isArray(example.header_handle) ||
        example.header_handle.length !== 1 || typeof example.header_handle[0] !== "string" ||
        !example.header_handle[0].trim()) {
      fail("IMAGE_SAMPLE_HANDLE_REQUIRED", "A trusted, server-produced Meta image sample handle is required before IMAGE template submission.");
    }
  }
  // JSON copies detach the frozen registration payloads from the mutable Prisma result.
  const prepared = record.prepared as MetaPrepared;
  return {
    localeId: row.id, languageTag: row.languageTag, providerLanguageCode: code, contentHash,
    components: JSON.parse(JSON.stringify(prepared.components)) as Array<Record<string, unknown>>,
    bindings: prepared.parameterBindings.headerMediaRole
      ? imageHeaderRegistrationBindings(prepared)
      : {
        // The existing TEXT registration format is retained to avoid rewriting
        // accepted ARCH-047 records. IMAGE snapshots use the exact new v1 binding.
        schemaVersion: 1, sourceHash: def.sourceHash, localeContentHash: contentHash,
        header: JSON.parse(JSON.stringify(prepared.parameterBindings.header ?? [])) as MetaLocaleSnapshot["bindings"]["header"],
        body: JSON.parse(JSON.stringify(prepared.parameterBindings.body)) as MetaLocaleSnapshot["bindings"]["body"],
        buttons: JSON.parse(JSON.stringify(prepared.parameterBindings.buttons)) as MetaLocaleSnapshot["bindings"]["buttons"],
      },
  };
}

/** All twenty reviewed versions or nothing. Hash includes trusted WABA and every submitted byte. */
export function makeMetaSubmissionPlan(input: {
  definition: DefinitionForMeta; locales: LocaleForMeta[]; trustedWabaId: string;
}): MetaSubmissionPlan {
  const { definition: def, locales, trustedWabaId } = input;
  if (!/^\d{4,32}$/.test(trustedWabaId)) fail("SENDER_UNAVAILABLE", "A trusted WhatsApp Business Account is not configured.");
  const providerTemplateName = def.providerTemplateName;
  if (!providerTemplateName) throw new MetaSubmissionError("INVALID_DEFINITION", "Provider name is missing.");
  if (def.kind !== "META_RECOVERY" || !["INITIAL", "FOLLOW_UP"].includes(def.purpose ?? "") ||
      !["NO_OFFER", "CODE_OFFER", "AUTOMATIC_OFFER"].includes(def.offerType ?? "") ||
      def.category !== "MARKETING" || def.sourceLanguageTag !== "en" || !DIGEST.test(def.sourceHash) ||
      !/^moda_[a-z0-9_]{8,240}$/.test(providerTemplateName) ||
      def.status === "RETIRED") {
    fail("INVALID_DEFINITION", "Only immutable Moda-authored recovery definitions in a supported Meta category can be submitted.");
  }
  if (locales.length !== META_LANGUAGES.length || new Set(locales.map((l) => l.languageTag)).size !== META_LANGUAGES.length) {
    fail("INCOMPLETE_LOCALES", "All 20 reviewed languages are required for submission.");
  }
  const byTag = new Map(locales.map((locale) => [locale.languageTag, locale]));
  const snapshots = META_LANGUAGES.map((tag) => {
    const locale = byTag.get(tag);
    if (!locale) throw new MetaSubmissionError("INCOMPLETE_LOCALES", `Missing reviewed language ${tag}.`);
    return frozenLocaleSnapshot(locale, def);
  });
  const identity = { definitionId: def.id, sourceHash: def.sourceHash, providerTemplateName,
    category: "MARKETING" as const, wabaId: trustedWabaId };
  return { ...identity, digest: templateHash({ ...identity, locales: snapshots }), locales: snapshots };
}
