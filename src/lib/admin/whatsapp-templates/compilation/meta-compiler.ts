import { compileTemplateAst } from "../authoring/compiler";
import { templateHash } from "../authoring/identifiers";
import { makeExamplePreview } from "../authoring/preview";
import type { MetaTemplateAst, MetaPrepared } from "../authoring/types";
import type { CompilationCandidate } from "./contracts";

/** Port to the only Meta compiler/variable registry (ADMIN-003), with no duplicate compilation algorithm. */
export function compileMetaLocale(ast: MetaTemplateAst): CompilationCandidate {
  const prepared = compileTemplateAst(ast);
  if (prepared.family !== "META_RECOVERY") throw new Error("Meta template compiler returned the wrong family.");
  const typed: MetaPrepared = prepared;
  // Every positional binding refers to the semantic variable at the translated position.
  const seen = new Set(typed.parameterBindings.body.map((binding) => binding.position));
  if (seen.size !== typed.parameterBindings.body.length ||
      typed.parameterBindings.body.some((binding, i) => binding.position !== i + 1) ||
      (typed.parameterBindings.header ?? []).some((binding, i) => binding.position !== i + 1)) {
    throw new Error("Inconsistent positional Meta parameter bindings.");
  }
  return { record: { schemaVersion: 1, authoring: ast, prepared },
    contentHash: templateHash(prepared), preview: makeExamplePreview(prepared) };
}
