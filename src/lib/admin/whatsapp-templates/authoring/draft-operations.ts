import { ConversationProductImageBindingSchema } from "@modainteract/moda-interact-shared/commerce/presentation";
import type { ContentNode, MetaTemplateAst, TemplateAst, WrapperNode, WrapperTemplateAst, SemanticVariable } from "./types";

export function newMetaDraft(stage: MetaTemplateAst["stage"] = "INITIAL", offerType: MetaTemplateAst["offerType"] = "NO_OFFER"): MetaTemplateAst {
  return {
    schemaVersion: 1, family: "META_RECOVERY", sourceLanguageTag: "en", stage, offerType,
    header: [], body: [{ type: "text", value: "Hello " }, { type: "variable", name: "customer.firstName" },
      ...(stage === "INITIAL" ? [
        { type: "text" as const, value: ", your checkout is waiting for you.\n\nOriginal abandoned basket: " },
        { type: "variable" as const, name: "checkout.itemsSummary" as const },
        { type: "text" as const, value: ".\n\nFrom " }, { type: "variable" as const, name: "shop.name" as const },
        { type: "text" as const, value: ". Need help with this basket? Use WhatsApp's Reply option on this message, then type your question or send a voice note (up to 2 minutes)." },
      ] : [
        { type: "text" as const, value: ", your checkout at " }, { type: "variable" as const, name: "shop.name" as const },
        { type: "text" as const, value: " is waiting for you." },
      ])], footer: [], buttons: [],
  };
}
export function ensureInitialBasketSummary(nodes: ContentNode[]): ContentNode[] {
  const result = nodes.map((node) => ({ ...node }));
  const firstIndex = result.findIndex((node) => node.type === "variable" && node.name === "checkout.itemsSummary");
  if (firstIndex < 0) {
    const tail = result.slice(-3);
    const hasReplyTail = tail.length === 3 && tail[0]?.type === "text" && tail[0].value.endsWith("From ") &&
      tail[1]?.type === "variable" && tail[1].name === "shop.name" && tail[2]?.type === "text";
    const insertionIndex = hasReplyTail ? result.length - 3 : 0;
    result.splice(insertionIndex, 0,
      { type: "text", value: "Original abandoned basket: " },
      { type: "variable", name: "checkout.itemsSummary" },
      { type: "text", value: ". " });
  } else {
    for (let index = result.length - 1; index > firstIndex; index -= 1) {
      const node = result[index];
      if (node.type === "variable" && node.name === "checkout.itemsSummary") result.splice(index, 1);
    }
    const preceding = result[firstIndex - 1];
    if (preceding?.type !== "text" || !/Original abandoned basket:\s*$/.test(preceding.value)) {
      result.splice(firstIndex, 0, { type: "text", value: "Original abandoned basket: " });
    }
  }
  return result;
}

export function removeInitialBasketSummary(nodes: ContentNode[]): ContentNode[] {
  const result = nodes.map((node) => ({ ...node }));
  for (let index = result.length - 1; index >= 0; index -= 1) {
    const node = result[index];
    if (node.type !== "variable" || node.name !== "checkout.itemsSummary") continue;
    result.splice(index, 1);
    const preceding = result[index - 1];
    if (preceding?.type === "text") {
      preceding.value = preceding.value.replace(/Original abandoned basket:\s*$/, "");
      if (!preceding.value) result.splice(index - 1, 1);
    }
    const following = result[index];
    if (following?.type === "text") following.value = following.value.replace(/^\.\s*/, "");
  }
  return result;
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

/** Toggle a structured binding; omission preserves legacy hashes. */
export function setWrapperProductImage(draft: WrapperTemplateAst, enabled: boolean): WrapperTemplateAst {
  const next = { ...draft };
  delete next.productImage;
  if (enabled && draft.audience === "AI") next.productImage = ConversationProductImageBindingSchema.parse({
    variable: "response.productImage", placement: "BEFORE_BODY", optional: true,
  });
  return next;
}
export function setWrapperAudience(draft: WrapperTemplateAst, audience: WrapperTemplateAst["audience"]): WrapperTemplateAst {
  const next = { ...draft, audience };
  return audience === "AI" ? next : setWrapperProductImage(next, false);
}
