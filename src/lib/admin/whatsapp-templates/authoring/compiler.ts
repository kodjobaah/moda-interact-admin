import { commonMetaBody } from "./common-layout";
import { prepareValidatedTemplateProjection } from "./projection";
import { validateTemplateAst } from "./validation";
import type { ImmutableAuthoringRecord, PreparedTemplate, TemplateAst } from "./types";

/** New immutable source/locales always use the provider-valid current projection. */
export function compileTemplateAst(draft: TemplateAst): PreparedTemplate {
  const check = validateTemplateAst(draft);
  if (!check.ok) throw new Error(check.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "));
  return prepareValidatedTemplateProjection(draft, draft.family === "META_RECOVERY" ? commonMetaBody(draft) : []);
}

export function makeImmutableAuthoringRecord(draft: TemplateAst): ImmutableAuthoringRecord {
  return { schemaVersion: 1, authoring: draft, prepared: compileTemplateAst(draft) };
}
