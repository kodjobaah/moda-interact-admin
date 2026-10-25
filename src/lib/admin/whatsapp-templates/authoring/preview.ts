import { VARIABLE_REGISTRY } from "./registry";
import type { PreparedTemplate, RuntimeToken, TemplatePreviewDTO } from "./types";

function renderTokens(tokens: RuntimeToken[]): string {
  return tokens.map((token) => token.kind === "text" ? token.value
    : token.kind === "variable" ? VARIABLE_REGISTRY[token.name].sample : "Example AI or merchant response").join("");
}

/** Fixture-only projection; no customer/shop context or network access. */
export function makeExamplePreview(prepared: PreparedTemplate): TemplatePreviewDTO {
  if (prepared.family === "MODA_CONVERSATION_WRAPPER") return {
    family: prepared.family, header: renderTokens(prepared.header), body: renderTokens(prepared.body), footer: renderTokens(prepared.footer),
    buttons: [], conditional: prepared.conditionals.map((c) => renderTokens(c.tokens)).join("\n"),
  };
  const components = prepared.components;
  const part = (type: string) => components.find((c) => c.type === type);
  const header = part("HEADER");
  let renderedHeader = typeof header?.text === "string" ? header.text : "";
  for (const { position, variable } of (prepared.parameterBindings.header ?? []).toReversed()) {
    renderedHeader = renderedHeader.replace(`{{${position}}}`, VARIABLE_REGISTRY[variable].sample);
  }
  const body = part("BODY");
  let renderedBody = typeof body?.text === "string" ? body.text : "";
  for (const { position, variable } of prepared.parameterBindings.body.toReversed()) {
    renderedBody = renderedBody.replace(`{{${position}}}`, VARIABLE_REGISTRY[variable].sample);
  }
  const buttons = part("BUTTONS")?.buttons;
  const variableButtonIndexes = new Map(prepared.parameterBindings.buttons.map((binding) => [binding.index, binding.variable]));
  return {
    family: prepared.family,
    header: renderedHeader, body: renderedBody, footer: String(part("FOOTER")?.text ?? ""),
    buttons: Array.isArray(buttons) ? buttons.map((b, i) => {
      const button = b as { text: string; url: string };
      const variable = variableButtonIndexes.get(i);
      return { label: button.text,
        url: variable ? button.url.replace("{{1}}", encodeURIComponent(VARIABLE_REGISTRY[variable].sample)) : button.url };
    }) : [],
  };
}

/** The editing preview must remain usable while a button or another field is invalid.
 * This never creates a prepared/validated projection or becomes a save authority. */
export function makeDraftExamplePreview(draft: import("./types").TemplateAst): TemplatePreviewDTO {
  const sampleNodes = (nodes: import("./types").WrapperNode[]) => nodes.map((node) => {
    if (node.type === "text") return node.value;
    if (node.type === "slot") return "Example AI or merchant response";
    return VARIABLE_REGISTRY[node.name]?.sample ?? "[Unknown variable]";
  }).join("");
  const result: TemplatePreviewDTO = {
    family: draft.family,
    header: sampleNodes(draft.header),
    body: sampleNodes(draft.body),
    footer: sampleNodes(draft.footer),
    buttons: [],
  };
  if (draft.family === "MODA_CONVERSATION_WRAPPER") {
    result.conditional = draft.conditionals.map((conditional) => sampleNodes(conditional.nodes)).join("\n");
  } else {
    result.buttons = draft.buttons.map((button) => ({
      label: button.label,
      url: button.urlPrefix.startsWith("https://") && button.urlPrefix.length > 8
        ? button.urlPrefix + (button.variable ? encodeURIComponent(VARIABLE_REGISTRY[button.variable].sample) : "")
        : "Set a valid HTTPS destination to preview the link",
    }));
  }
  return result;
}
