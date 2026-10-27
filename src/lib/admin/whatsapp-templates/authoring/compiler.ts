import { VARIABLE_REGISTRY } from "./registry";
import { validateTemplateAst } from "./validation";
import type { ContentNode, ImmutableAuthoringRecord, PreparedTemplate, RuntimeToken, TemplateAst, VariableBinding, WrapperNode } from "./types";

function asRuntime(nodes: WrapperNode[]): RuntimeToken[] {
  return nodes.map((node) => node.type === "text" ? { kind: "text" as const, value: node.value }
    : node.type === "variable" ? { kind: "variable" as const, name: node.name }
    : { kind: "responseSlot" as const, name: "response.body" as const });
}

function bodyText(nodes: ContentNode[]): { text: string; bindings: VariableBinding[]; examples: string[] } {
  const bindings: VariableBinding[] = [];
  const examples: string[] = [];
  const text = nodes.map((node) => {
    if (node.type === "text") return node.value;
    const position = bindings.length + 1;
    bindings.push({ position, variable: node.name });
    examples.push(VARIABLE_REGISTRY[node.name].sample);
    return `{{${position}}}`;
  }).join("");
  return { text, bindings, examples };
}

/**
 * Single Admin-owned pure English/translated locale compiler, reused by ADMIN-005.
 * The AST sourceLanguageTag remains "en" even when translated text nodes are
 * reconstructed. The target locale identity lives on WhatsAppTemplateLocale,
 * not in this immutable template-source descriptor.
 */
export function compileTemplateAst(draft: TemplateAst): PreparedTemplate {
  const check = validateTemplateAst(draft);
  if (!check.ok) throw new Error(check.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "));
  if (draft.family === "MODA_CONVERSATION_WRAPPER") return {
    schemaVersion: 1, family: "MODA_CONVERSATION_WRAPPER", responseSlot: "response.body",
    header: asRuntime(draft.header), body: asRuntime(draft.body), footer: asRuntime(draft.footer),
    conditionals: draft.conditionals.map((c) => ({ when: c.when, tokens: asRuntime(c.nodes) })),
  };
  const components: Array<Record<string, unknown>> = [];
  const header = bodyText(draft.header);
  const footer = draft.footer.map((n) => n.value).join("");
  if (draft.shopBrandMediaRole) {
    // Deliberately no Meta sample handle: this task does not acquire/authorise one.
    // The Meta submission boundary fails closed with IMAGE_SAMPLE_HANDLE_REQUIRED.
    components.push({ type: "HEADER", format: "IMAGE" });
  } else if (header.text.trim()) components.push({ type: "HEADER", format: "TEXT", text: header.text,
    ...(header.examples.length ? { example: { header_text: header.examples } } : {}) });
  const body = bodyText(draft.body);
  components.push({ type: "BODY", text: body.text,
    ...(body.examples.length ? { example: { body_text: [body.examples] } } : {}) });
  if (footer.trim()) components.push({ type: "FOOTER", text: footer });
  const buttonBindings: Array<{ index: number; subType: "url"; variable: "checkout.url" }> = [];
  if (draft.buttons.length) {
    const buttons = draft.buttons.map((button, index) => {
      if (!button.variable) return { type: "URL", text: button.label, url: button.urlPrefix };
      buttonBindings.push({ index, subType: "url", variable: button.variable });
      return { type: "URL", text: button.label,
        url: `${button.urlPrefix}{{1}}`, example: [`${button.urlPrefix}${encodeURIComponent(VARIABLE_REGISTRY[button.variable].sample)}`] };
    });
    components.push({ type: "BUTTONS", buttons });
  }
  return { schemaVersion: 1, family: "META_RECOVERY", category: "MARKETING", components,
    parameterBindings: {
      ...(draft.shopBrandMediaRole ? { schemaVersion: 1 as const, headerMediaRole: draft.shopBrandMediaRole } : {}),
      header: header.bindings, body: body.bindings, buttons: buttonBindings,
    } };
}

export function makeImmutableAuthoringRecord(draft: TemplateAst): ImmutableAuthoringRecord {
  return { schemaVersion: 1, authoring: draft, prepared: compileTemplateAst(draft) };
}
