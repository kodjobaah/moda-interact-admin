import { eligibleHeaderVariables, eligibleVariables } from "./registry";
import type { AuthoringIssue, TemplateAst } from "./types";

const MAX_JSON_BYTES = 32_768;
const MAX_NODES = 80;
const TOKEN_PATTERN = /\{\{[^{}]*\}\}|\{\{|\}\}/;
const ownKeys = (o: Record<string, unknown>, keys: string[]) => Object.keys(o).every((k) => keys.includes(k));
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const enumMember = (v: unknown, choices: readonly string[]): v is string => typeof v === "string" && choices.includes(v);

export function validateTemplateAst(raw: unknown): { ok: true; value: TemplateAst } | { ok: false; issues: AuthoringIssue[] } {
  const issues: AuthoringIssue[] = [];
  const fail = (path: string, message: string) => issues.push({ path, message });
  if (!object(raw)) return { ok: false, issues: [{ path: "root", message: "Expected a template object." }] };
  let byteSize = Infinity;
  try { byteSize = new TextEncoder().encode(JSON.stringify(raw)).length; } catch { /* rejects below */ }
  if (byteSize > MAX_JSON_BYTES) fail("root", "Template exceeds 32 KiB or is not serialisable.");
  if (raw.schemaVersion !== 1) fail("schemaVersion", "Unsupported AST version.");
  if (raw.sourceLanguageTag !== "en") fail("sourceLanguageTag", "Select English (en) as the source language.");
  if (!enumMember(raw.family, ["META_RECOVERY", "MODA_CONVERSATION_WRAPPER"])) {
    fail("family", "Unknown template family.");
    return { ok: false, issues };
  }
  const family = raw.family;
  const meta = family === "META_RECOVERY";
  const common = ["schemaVersion", "family", "sourceLanguageTag", "header", "body", "footer"];
  if (!ownKeys(raw, meta ? [...common, "stage", "offerType", "buttons"] : [...common, "audience", "conditionals"])) fail("root", "Unknown template fields.");
  if (meta) {
    if (!enumMember(raw.stage, ["INITIAL", "FOLLOW_UP"])) fail("stage", "Select a recovery stage.");
    if (!enumMember(raw.offerType, ["NO_OFFER", "CODE_OFFER", "AUTOMATIC_OFFER"])) fail("offerType", "Select an offer type.");
  } else if (!enumMember(raw.audience, ["SHARED", "AI", "HUMAN"])) fail("audience", "Select a wrapper audience.");

  const checkNodes = (input: unknown, path: string, maxChars: number, allowed: Array<"text" | "variable" | "slot">) => {
    if (!Array.isArray(input) || input.length > MAX_NODES) { fail(path, "Expected up to 80 content nodes."); return; }
    for (const [i, n] of input.entries()) {
      const key = `${path}.${i}`;
      if (!object(n) || !enumMember(n.type, allowed)) { fail(key, "Unsupported content node."); continue; }
      if (n.type === "text") {
        if (!ownKeys(n, ["type", "value"]) || typeof n.value !== "string" || n.value.length > maxChars || TOKEN_PATTERN.test(n.value)) {
          fail(key, `Text must be at most ${maxChars} characters; use the variable palette rather than raw {{...}} placeholders.`);
        }
      } else if (n.type === "variable") {
        // One semantic registry; unrecognised/offer-ineligible variables are refused.
        const draft = raw as unknown as TemplateAst;
        const allowedVariables = meta && path === "header" ? eligibleHeaderVariables(draft) : eligibleVariables(draft);
        if (!ownKeys(n, ["type", "name"]) || !enumMember(n.name, allowedVariables)) fail(key, "Unknown or ineligible semantic variable for this component.");
        if (!meta && n.name === "checkout.url" && !path.startsWith("conditionals.")) fail(key, "Checkout links in wrappers require a checkout.available conditional.");
      } else if (!ownKeys(n, ["type", "name"]) || n.name !== "response.body" || meta || path !== "body") fail(key, "Response slot is only supported once in a wrapper body.");
    }
    let nextPosition = 0;
    const projectionLength = (input as unknown[]).reduce<number>((count, n) => {
      if (!object(n)) return count;
      if (n.type === "text") return count + (typeof n.value === "string" ? n.value.length : 0);
      if (n.type === "variable" && meta && path === "body") return count + `{{${++nextPosition}}}`.length;
      return count + 5;
    }, 0);
    if (projectionLength > maxChars) fail(path, `Rendered content exceeds ${maxChars} characters.`);
  };
  checkNodes(raw.header, "header", meta ? 60 : 1500, ["text", "variable"]);
  checkNodes(raw.body, "body", meta ? 1024 : 4000, meta ? ["text", "variable"] : ["text", "variable", "slot"]);
  checkNodes(raw.footer, "footer", meta ? 60 : 1500, meta ? ["text"] : ["text", "variable"]);
  if (!Array.isArray(raw.body) || raw.body.length === 0 || (raw.body as unknown[]).every((n) => object(n) && n.type === "text" && typeof n.value === "string" && !n.value.trim())) fail("body", "Body cannot be empty.");
  if (meta) {
    if (!Array.isArray(raw.buttons) || raw.buttons.length > 1) fail("buttons", "At most one URL button is supported.");
    else for (const [i, b] of raw.buttons.entries()) {
      const key = `buttons.${i}`;
      if (!object(b) || !ownKeys(b, ["type", "label", "urlPrefix", "variable"]) || b.type !== "url" || typeof b.label !== "string" || !b.label.trim() || b.label.length > 25) { fail(key, "Unsupported URL button or invalid label (max 25). "); continue; }
      if (typeof b.urlPrefix !== "string" || b.urlPrefix.length > 1900 || TOKEN_PATTERN.test(b.urlPrefix)) { fail(key, "Invalid URL prefix."); continue; }
      try { const url = new URL(b.urlPrefix); if (url.protocol !== "https:" || url.username || url.password || url.hostname.endsWith(".invalid") || !url.hostname.includes(".")) fail(key, "URL requires a genuine HTTPS host."); } catch { fail(key, "URL requires a valid HTTPS prefix."); }
      if (b.variable !== undefined && b.variable !== "checkout.url") fail(key, "Only the checkout.url dynamic URL parameter is supported.");
      if (b.variable && !/[/?=&]$/.test(b.urlPrefix)) fail(key, "Dynamic URL prefix must end at a path or query parameter boundary.");
    }
    const headerNodes = Array.isArray(raw.header) ? raw.header : [];
    if (headerNodes.filter((n) => object(n) && n.type === "variable").length > 1) {
      fail("header", "Meta text headers support at most one variable.");
    }
    const bodyNodes = Array.isArray(raw.body) ? raw.body : [];
    if (bodyNodes.filter((n) => object(n) && n.type === "variable").length > 10) fail("body", "Meta supports at most 10 body variables in this editor.");
  } else {
    if (!Array.isArray(raw.conditionals) || raw.conditionals.length > 1) fail("conditionals", "Only one checkout-aware conditional is supported.");
    else for (const [i, c] of raw.conditionals.entries()) {
      if (!object(c) || !ownKeys(c, ["when", "nodes"]) || c.when !== "checkout.available") fail(`conditionals.${i}`, "Unsupported conditional.");
      else checkNodes(c.nodes, `conditionals.${i}.nodes`, 1500, ["text", "variable"]);
    }
    const count = Array.isArray(raw.body) ? raw.body.filter((n) => object(n) && n.type === "slot" && n.name === "response.body").length : 0;
    if (count !== 1) fail("body", "Exactly one response.body slot is required.");
  }
  return issues.length ? { ok: false, issues } : { ok: true, value: raw as TemplateAst };
}
