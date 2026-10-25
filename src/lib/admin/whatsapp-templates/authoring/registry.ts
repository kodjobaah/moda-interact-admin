import type { SemanticVariable, ShopBrandVariable, TemplateAst } from "./types";

type VariableDefinition = { label: string; sample: string; sourceField?: string };

/** Only merchant-display attributes are exposed, never ShopBrand row IDs or audit timestamps.
 * Image URLs are inserted as URL *text*, not WhatsApp media/image attachments.
 * Background must resolve each value for the sending shop and fail closed when absent.
 */
export const SHOP_BRAND_VARIABLES = [
  "shopBrand.brandName", "shopBrand.logoUrl", "shopBrand.logoAltText",
  "shopBrand.logoWidth", "shopBrand.logoHeight", "shopBrand.squareLogoUrl",
  "shopBrand.squareLogoAltText", "shopBrand.coverImageUrl",
] as const satisfies readonly ShopBrandVariable[];

export const VARIABLE_REGISTRY: Record<SemanticVariable, VariableDefinition> = {
  "customer.firstName": { label: "Customer's first name", sample: "Alex" },
  "shop.name": { label: "Shop name", sample: "Example Shop" },
  "checkout.url": { label: "Checkout link", sample: "https://www.example.com/checkout/demo" },
  "offer.code": { label: "Verified offer code", sample: "SAMPLE10" },
  "offer.description": { label: "Verified offer description", sample: "an example discount" },
  "shopBrand.brandName": { label: "Brand name", sample: "Example Brand", sourceField: "ShopBrand.brandName" },
  "shopBrand.logoUrl": { label: "Logo URL (text)", sample: "https://example.com/brand/logo.png", sourceField: "ShopBrand.logoUrl" },
  "shopBrand.logoAltText": { label: "Logo alt text", sample: "Example Brand logo", sourceField: "ShopBrand.logoAltText" },
  "shopBrand.logoWidth": { label: "Logo width", sample: "240", sourceField: "ShopBrand.logoWidth" },
  "shopBrand.logoHeight": { label: "Logo height", sample: "120", sourceField: "ShopBrand.logoHeight" },
  "shopBrand.squareLogoUrl": { label: "Square logo URL (text)", sample: "https://example.com/brand/square.png", sourceField: "ShopBrand.squareLogoUrl" },
  "shopBrand.squareLogoAltText": { label: "Square logo alt text", sample: "Example Brand square logo", sourceField: "ShopBrand.squareLogoAltText" },
  "shopBrand.coverImageUrl": { label: "Cover image URL (text)", sample: "https://example.com/brand/cover.jpg", sourceField: "ShopBrand.coverImageUrl" },
};

export function eligibleVariables(draft: TemplateAst): SemanticVariable[] {
  const base: SemanticVariable[] = ["customer.firstName", "shop.name", "checkout.url", ...SHOP_BRAND_VARIABLES];
  if (draft.family === "MODA_CONVERSATION_WRAPPER" || draft.offerType === "NO_OFFER") return base;
  if (draft.offerType === "AUTOMATIC_OFFER") return [...base, "offer.description"];
  return [...base, "offer.code", "offer.description"];
}

/** Meta permits at most one text header parameter, but not dynamic footer parameters.
 * Long image URLs and numerical sizing metadata are inappropriate as text headers.
 * Wrapper headers do not have the one-parameter Meta limitation.
 */
export function eligibleHeaderVariables(draft: TemplateAst): SemanticVariable[] {
  if (draft.family !== "META_RECOVERY") return eligibleVariables(draft).filter((name) => name !== "checkout.url");
  return ["customer.firstName", "shop.name", "shopBrand.brandName", "shopBrand.logoAltText", "shopBrand.squareLogoAltText"];
}
