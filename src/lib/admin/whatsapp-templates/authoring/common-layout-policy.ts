import type { RuntimeToken } from "./types";

type CommonSections = { header: readonly RuntimeToken[]; body: readonly RuntimeToken[]; footer: readonly RuntimeToken[];
  productImage?: unknown; conditionals: readonly { when: "checkout.available"; tokens: readonly RuntimeToken[] }[] };

/** Admin-owned trusted binding/placement policy; Shared only parses and binds immutable bytes. */
export function commonLayoutPolicyError(p: CommonSections): string | null {
  if (Object.hasOwn(p, "productImage")) return "Common layout uses the fixed verified product source, not the AI-only productImage binding.";
  const count = (tokens: readonly RuntimeToken[], name: string) => tokens.filter(t => t.kind === "variable" && t.name === name).length;
  const permitted = (tokens: readonly RuntimeToken[], names: string[]) => tokens.every(t => t.kind === "text" || t.kind === "variable" && names.includes(t.name));
  if (!permitted(p.header, ["shop.name", "shop.websiteUrl"]) || count(p.header, "shop.name") !== 1) return "Common shop header must bind shop.name exactly once; only trusted shop identity variables are allowed.";
  if (p.body.length !== 1 || p.body[0].kind !== "responseSlot" || p.body[0].name !== "response.body") return "Common body must contain only the response.body slot.";
  if (p.footer.some(token => token.kind !== "text" || token.value !== "")) return "Keep the common static footer empty. Put the clickable website in the checkout.available footer before the final checkout.url.";
  if (p.conditionals.length !== 1 || p.conditionals[0].when !== "checkout.available") return "Common layout requires one checkout.available footer.";
  const checkout = p.conditionals[0].tokens;
  const final = checkout.at(-1);
  if (!permitted(checkout, ["shop.websiteUrl", "checkout.url"]) || count(checkout, "checkout.url") !== 1 || final?.kind !== "variable" || final.name !== "checkout.url") return "Common checkout footer must bind checkout.url exactly once as its final token, with the clickable website before it.";
  const prefix = checkout.slice(0, -1);
  let suffix = "";
  for (let i = prefix.length - 1; i >= 0 && prefix[i].kind === "text"; i--) {
    const token = prefix[i]; if (token.kind === "text") suffix = token.value + suffix;
  }
  if (prefix.length && !suffix.endsWith("\n") && !(prefix.every(token => token.kind === "text") && suffix === "")) return "Place the canonical checkout.url alone on the final line of the checkout.available footer.";
  if (count(p.header, "shop.websiteUrl") + count(checkout, "shop.websiteUrl") !== 1) return "Common layout must bind shop.websiteUrl exactly once. For a clickable website, place it in the checkout.available footer before checkout.url.";
  return null;
}
