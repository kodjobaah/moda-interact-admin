import { commonMetaBody } from "./common-layout";
import { VARIABLE_REGISTRY } from "./registry";
import type { AuthoringIssue, ContentNode, MetaTemplateAst, VariableBinding } from "./types";

/** One positional projection for validation, preview, compilation and frozen verification. */
export function positionalMetaText(nodes: readonly ContentNode[]): { text: string; bindings: VariableBinding[]; examples: string[] } {
  const bindings: VariableBinding[] = [];
  const examples: string[] = [];
  const text = nodes.map(node => {
    if (node.type === "text") return node.value;
    const position = bindings.length + 1;
    bindings.push({ position, variable: node.name });
    examples.push(VARIABLE_REGISTRY[node.name].sample);
    return `{{${position}}}`;
  }).join("");
  return { text, bindings, examples };
}
export function projectMetaBody(draft: MetaTemplateAst) {
  return positionalMetaText(commonMetaBody(draft));
}

/** Meta2388299: parameters need real fixed text on both sides, not padding. */
export function metaBodyIssues(text: string): AuthoringIssue[] {
  const issues: AuthoringIssue[] = [];
  const parameters = [...text.matchAll(/\{\{\d+\}\}/g)];
  if (text.length > 1024) issues.push({ path: "body", message: "Final Meta BODY exceeds 1024 characters. Shorten the reviewed source; no content was removed." });
  if (parameters.length > 10) issues.push({ path: "body", message: "Final Meta BODY exceeds the 10-parameter limit." });
  const meaningfulText = (value: string) => /\p{L}/u.test(value.replace(/\p{Default_Ignorable_Code_Point}/gu, ""));
  if (parameters.length) {
    const first = parameters[0];
    const last = parameters[parameters.length - 1];
    if (!meaningfulText(text.slice(0, first.index))) issues.push({ path: "body", message: "Meta BODY must begin with meaningful fixed text before its first parameter. For a common layout, clone and review a shop header with a localized label before shop.name." });
    if (!meaningfulText(text.slice(last.index! + last[0].length))) issues.push({ path: "body", message: "Meta BODY must end with meaningful fixed text after its last parameter. For a common layout, retain the reviewed localized opt-out after the checkout link; clone saved content to correct it." });
  }
  return issues;
}

/** Admission guard for frozen provider components, also used by technical retries. */
export function preparedMetaBodyIssues(components: unknown): AuthoringIssue[] {
  if (!Array.isArray(components)) return [{ path: "body", message: "Frozen Meta BODY is missing; clone and review a corrected source." }];
  const bodies = components.filter(component => component && typeof component === "object" && component.type === "BODY");
  if (bodies.length !== 1 || typeof bodies[0].text !== "string" || !bodies[0].text.trim()) {
    return [{ path: "body", message: "Exactly one frozen Meta BODY is required; clone and review a corrected source." }];
  }
  return metaBodyIssues(bodies[0].text);
}
