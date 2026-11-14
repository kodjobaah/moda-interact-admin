import { compositeProfileDigest } from "./composite-profile";
import { positionalMetaText } from "./meta-body";
import { VARIABLE_REGISTRY } from "./registry";
import type { ContentNode, PreparedTemplate, RuntimeToken, TemplateAst, WrapperNode } from "./types";

function asRuntime(nodes: WrapperNode[]): RuntimeToken[] {
  return nodes.map((node) => node.type === "text" ? { kind: "text" as const, value: node.value }
    : node.type === "variable" ? { kind: "variable" as const, name: node.name }
    : { kind: "responseSlot" as const, name: "response.body" as const });
}

/** Internal deterministic projection; callers must validate authoring/admission separately. */
export function prepareValidatedTemplateProjection(draft: TemplateAst, bodyNodes: readonly ContentNode[]): PreparedTemplate {
  if (draft.family === "MODA_CONVERSATION_WRAPPER") return {
    schemaVersion: 1, family: "MODA_CONVERSATION_WRAPPER", responseSlot: "response.body",
    header: asRuntime(draft.header), body: asRuntime(draft.body), footer: asRuntime(draft.footer),
    ...(draft.compositeProfile ? { compositeProfile: { ...draft.compositeProfile }, compositeProfileSha256: compositeProfileDigest(draft.compositeProfile) } : {}),
    ...(draft.productImage ? { productImage: { ...draft.productImage } } : {}),
    conditionals: draft.conditionals.map((c) => ({ when: c.when, tokens: asRuntime(c.nodes) })),
  };
  const components: Array<Record<string, unknown>> = [];
  const header = positionalMetaText(draft.header);
  const footer = draft.commonLayout ? "" : draft.footer.map((n) => n.value).join("");
  if (draft.shopBrandMediaRole) {
    // Deliberately no Meta sample handle: this task does not acquire/authorise one.
    // The Meta submission boundary fails closed with IMAGE_SAMPLE_HANDLE_REQUIRED.
    components.push({ type: "HEADER", format: "IMAGE" });
  } else if (header.text.trim()) components.push({ type: "HEADER", format: "TEXT", text: header.text,
    ...(header.examples.length ? { example: { header_text: header.examples } } : {}) });
  const body = positionalMetaText(bodyNodes);
  components.push({ type: "BODY", text: body.text,
    ...(body.examples.length ? { example: { body_text: [body.examples] } } : {}) });
  if (footer.trim()) components.push({ type: "FOOTER", text: footer });
  const buttonBindings: Array<{ index: number; subType: "url"; variable: "checkout.url" | "promotion.productUrl" }> = [];
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
      ...(draft.promotionTarget ? { promotionTarget: draft.promotionTarget } : {}),
      header: header.bindings, body: body.bindings, buttons: buttonBindings,
    } };
}
