import { templateHash } from "../authoring/identifiers";
import { validateTemplateAst } from "../authoring/validation";
import type { TemplateAst } from "../authoring/types";
import type { CompilationCandidate } from "./contracts";
import { parseSourceSnapshot, parseTranslatedSegments, verifySourceAgainstAst, verifyTranslatedKeysAndMarkers } from "./segments";
import { reconstructLocaleAst } from "./restoration";
import { compileMetaLocale } from "./meta-compiler";
import { compileWrapperLocale } from "./wrapper-compiler";
import { providerLanguageCode } from "./language-codes";

export type ReconstructionInput = {
  definitionId: string;
  definitionSourceHash: string;
  runSourceHash: string;
  languageTag: string;
  english: TemplateAst;
  snapshot: unknown;
  translated: unknown;
  outputContentHash?: string | null;
};

/** Pure injected compilation port; works with prepared fixture JSONB before ADMIN-004/BG002 integration. */
export function reconstructAndCompile(input: ReconstructionInput): CompilationCandidate {
  if (!/^[a-f0-9]{64}$/.test(input.definitionSourceHash) ||
      input.definitionSourceHash !== input.runSourceHash ||
      templateHash(input.english) !== input.definitionSourceHash) {
    throw new Error("Translation is stale: source hash does not match the immutable English definition.");
  }
  const source = parseSourceSnapshot(input.snapshot);
  if (source.definitionId !== input.definitionId || source.sourceHash !== input.definitionSourceHash) {
    throw new Error("Translation snapshot belongs to a different source or definition.");
  }
  if (input.languageTag === "en") throw new Error("English source must never be reconstructed or overwritten.");
  providerLanguageCode(input.languageTag, input.english.family);
  verifySourceAgainstAst(source, input.english);
  const output = parseTranslatedSegments(input.translated);
  if (input.outputContentHash && templateHash(output) !== input.outputContentHash) {
    throw new Error("Translation output digest does not match the persisted result.");
  }
  verifyTranslatedKeysAndMarkers(source, output);
  const ast = reconstructLocaleAst(input.english, source, output, input.languageTag);
  const validated = validateTemplateAst(ast, { requireInitialReply: true, contentLanguageTag: input.languageTag });
  if (!validated.ok) throw new Error(`Translation violates provider/component limits: ${validated.issues[0].path}: ${validated.issues[0].message}`);
  return ast.family === "META_RECOVERY" ? compileMetaLocale(ast) : compileWrapperLocale(ast);
}
