import { compileTemplateAst } from "../authoring/compiler";
import { templateHash } from "../authoring/identifiers";
import { makeExamplePreview } from "../authoring/preview";
import type { WrapperTemplateAst, WrapperPrepared } from "../authoring/types";
import type { CompilationCandidate } from "./contracts";

/** Prepared typed runtime tokens: Background never needs this module or the authoring AST. */
export function compileWrapperLocale(ast: WrapperTemplateAst): CompilationCandidate {
  const prepared = compileTemplateAst(ast);
  if (prepared.family !== "MODA_CONVERSATION_WRAPPER") throw new Error("Wrapper compiler returned the wrong family.");
  const typed: WrapperPrepared = prepared;
  if (typed.responseSlot !== "response.body" || typed.body.filter((token) => token.kind === "responseSlot").length !== 1) {
    throw new Error("Prepared wrapper must preserve exactly one response slot.");
  }
  return { record: { schemaVersion: 1, authoring: ast, prepared },
    contentHash: templateHash(prepared), preview: makeExamplePreview(prepared) };
}
