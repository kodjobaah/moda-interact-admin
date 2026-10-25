import type { ContentNode, MetaTemplateAst, TemplateAst, WrapperNode, WrapperTemplateAst, SemanticVariable } from "./types";

export function newMetaDraft(stage: MetaTemplateAst["stage"] = "INITIAL", offerType: MetaTemplateAst["offerType"] = "NO_OFFER"): MetaTemplateAst {
  return {
    schemaVersion: 1, family: "META_RECOVERY", sourceLanguageTag: "en", stage, offerType,
    header: [], body: [{ type: "text", value: "Hello " }, { type: "variable", name: "customer.firstName" },
      { type: "text", value: ", your checkout at " }, { type: "variable", name: "shop.name" },
      { type: "text", value: " is waiting for you." }], footer: [], buttons: [],
  };
}
export function newWrapperDraft(audience: WrapperTemplateAst["audience"] = "SHARED"): WrapperTemplateAst {
  return {
    schemaVersion: 1, family: "MODA_CONVERSATION_WRAPPER", sourceLanguageTag: "en", audience,
    header: [{ type: "text", value: "" }], body: [{ type: "slot", name: "response.body" }],
    footer: [{ type: "text", value: "" }], conditionals: [],
  };
}
export function addVariable(nodes: ContentNode[], name: SemanticVariable): ContentNode[] {
  return [...nodes, { type: "variable", name }];
}
export function replaceNode<T extends WrapperNode>(nodes: T[], index: number, replacement: T): T[] {
  return nodes.map((node, pos) => pos === index ? replacement : node);
}
export function removeNode<T extends WrapperNode>(nodes: T[], index: number): T[] {
  return nodes.filter((_, pos) => pos !== index);
}
export function cloneDraft(value: TemplateAst): TemplateAst {
  return structuredClone(value);
}

/** Human-readable editing notation. The AST remains the only saved representation. */
export function formatEditorNodes(nodes: WrapperNode[]): string {
  return nodes.map((node) => node.type === "text" ? node.value : `{{${node.name}}}`).join("");
}

/** Only explicitly allowed semantic tokens become AST nodes; unknown tokens remain text and fail server validation. */
export function parseEditorNodes(value: string, options: {
  variables: readonly SemanticVariable[];
  allowResponseSlot?: boolean;
}): WrapperNode[] {
  const pattern = /\{\{([^{}]*)\}\}/g;
  const result: WrapperNode[] = [];
  let consumed = 0;
  const text = (part: string) => {
    if (!part) return;
    const previous = result[result.length - 1];
    if (previous?.type === "text") previous.value += part;
    else result.push({ type: "text", value: part });
  };
  for (const match of value.matchAll(pattern)) {
    const index = match.index;
    text(value.slice(consumed, index));
    const name = match[1];
    if (name === "response.body" && options.allowResponseSlot) result.push({ type: "slot", name });
    else if (options.variables.includes(name as SemanticVariable)) result.push({ type: "variable", name: name as SemanticVariable });
    else text(match[0]);
    consumed = index + match[0].length;
  }
  text(value.slice(consumed));
  return result;
}

/** Insertion is cursor-aware and works with selected text, including mobile textarea selection. */
export function insertEditorToken(value: string, name: SemanticVariable | "response.body", start: number, end: number) {
  const left = Math.min(value.length, Math.max(0, Math.min(start, end)));
  const right = Math.min(value.length, Math.max(left, Math.max(start, end)));
  const token = `{{${name}}}`;
  return { text: value.slice(0, left) + token + value.slice(right), caret: left + token.length };
}
