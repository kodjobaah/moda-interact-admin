import { VARIABLE_REGISTRY, SHOP_BRAND_VARIABLES } from "../authoring/registry";
import type { RuntimeToken, SemanticVariable, ShopBrandVariable, WrapperPrepared } from "../authoring/types";

export const EXAMPLE_RESPONSES = {
  AI: "Example AI reply: I can help answer questions about these products.",
  HUMAN: "Example human reply: I can help you with your checkout.",
  SHARED: "Example AI or human reply: How can I help?",
} as const;

export type WrapperPreviewContext =
  | { kind: "FICTIONAL" }
  | { kind: "SHOP_SCOPED"; shopBrand: Partial<Record<ShopBrandVariable, string | number | null>>;
      customerFirstName?: string | null; shopName?: string | null; checkoutUrl?: string | null };

export type VariableDisclosure = { name: SemanticVariable; label: string; placement: string; availability: string };
export type RenderedWrapperPreview = {
  header: string;
  body: string;
  footer: string;
  conditional: string | null;
  disclosures: VariableDisclosure[];
  exampleOnly: boolean;
};

/** Preview never stores response content and never performs a shop/checkout lookup. */
export function renderWrapperPreview(prepared: WrapperPrepared, options: {
  response: string;
  checkoutAvailable: boolean;
  context?: WrapperPreviewContext;
}): RenderedWrapperPreview {
  const context = options.context ?? { kind: "FICTIONAL" };
  const disclosures: VariableDisclosure[] = [];
  const shopBrands = new Set<string>(SHOP_BRAND_VARIABLES);
  const variable = (name: SemanticVariable, placement: string): string => {
    const info = VARIABLE_REGISTRY[name];
    // This is defensive display-only handling; eligibility must already have
    // validated every semantic token before projection reaches this function.
    if (!info) throw new Error("Invalid prepared semantic variable.");
    let result: string;
    let availability: string;
    if (context.kind === "FICTIONAL") {
      result = info.sample;
      availability = shopBrands.has(name) ? "Example only; live ShopBrand field may be null." : "Illustrative value only.";
    } else {
      const value = shopBrands.has(name)
        ? context.shopBrand[name as ShopBrandVariable]
        : name === "customer.firstName" ? context.customerFirstName
        : name === "shop.name" ? context.shopName
        : name === "checkout.url" ? context.checkoutUrl : undefined;
      if (value === undefined || value === null || String(value).trim() === "") {
        result = `[Unavailable: ${name}]`;
        availability = "Missing optional/trusted field — no value substituted.";
      } else {
        result = String(value);
        availability = "Supplied in explicitly scoped preview.";
      }
    }
    disclosures.push({ name, label: info.label, placement, availability });
    return result;
  };
  const tokens = (parts: RuntimeToken[], placement: string) => parts.map((token) => {
    if (token.kind === "text") return token.value;
    if (token.kind === "responseSlot") return options.response;
    return variable(token.name, placement);
  }).join("");
  const conditional = options.checkoutAvailable && (context.kind === "FICTIONAL" ||
    (typeof context.checkoutUrl === "string" && /^https:\/\//.test(context.checkoutUrl)))
    ? prepared.conditionals.map((section, i) => tokens(section.tokens, `checkout conditional ${i + 1}`)).join("\n")
    : null;
  return {
    header: tokens(prepared.header, "header"),
    body: tokens(prepared.body, "body"),
    footer: tokens(prepared.footer, "footer"),
    conditional,
    disclosures,
    exampleOnly: context.kind === "FICTIONAL",
  };
}
