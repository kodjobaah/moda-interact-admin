import { createHash } from "node:crypto";
import { MODA_SUPPORTED_LANGUAGE_TAGS } from "@modainteract/moda-interact-shared/internationalization";
import { stableJson } from "../authoring/canonical";
import { SHOP_BRAND_VARIABLES } from "../authoring/registry";
import { templateHash } from "../authoring/identifiers";
import type { BrandIndicator, CompiledTemplateView, ImpactKind, PublicationScope } from "./types";
import { MAX_SELECTED_SHOPS } from "./types";

export const LANGUAGES = [...MODA_SUPPORTED_LANGUAGE_TAGS];
const ID = /^[a-zA-Z0-9_-]{1,191}$/;
const BINDING = /^(?:customer\.firstName|shop\.name|checkout\.url|offer\.(?:code|description)|shopBrand\.(?:brandName|logoUrl|logoAltText|logoWidth|logoHeight|squareLogoUrl|squareLogoAltText|coverImageUrl))$/;

export class PublicationError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = "PublicationError"; }
}
export const reject = (code: string, message: string): never => { throw new PublicationError(code, message); };
export const digest = (value: unknown): string => createHash("sha256").update(stableJson(value)).digest("hex");
export function parseScope(value: unknown): PublicationScope {
  if (!value || typeof value !== "object" || Array.isArray(value)) return reject("INPUT", "Select a publication scope.");
  const raw = value as Record<string, unknown>;
  if (raw.mode === "all" && Object.keys(raw).length === 1) return { mode: "all" };
  if (raw.mode === "one" && Object.keys(raw).sort().join() === "mode,shopId" && typeof raw.shopId === "string" && ID.test(raw.shopId)) return { mode: "one", shopId: raw.shopId };
  if (raw.mode === "selected" && Object.keys(raw).sort().join() === "mode,shopIds" && Array.isArray(raw.shopIds) &&
      raw.shopIds.length > 0 && raw.shopIds.length <= MAX_SELECTED_SHOPS && raw.shopIds.every((v) => typeof v === "string" && ID.test(v)) &&
      new Set(raw.shopIds).size === raw.shopIds.length) return { mode: "selected", shopIds: [...raw.shopIds].sort() };
  return reject("INPUT", "Select one, up to 200 distinct shops, or all eligible shops.");
}
export const isValidKey = (key: unknown): key is string => typeof key === "string" && ID.test(key);
export const isValidDefinitionId = (id: unknown): id is string => typeof id === "string" && /^wtdef_[a-f0-9]{64}$/.test(id);
export const isValidFingerprint = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
export function reasonText(value: unknown): string {
  if (typeof value !== "string" || value.trim().length < 8 || value.trim().length > 1000 || /[\x00-\x08\x0b\x0e-\x1f\x7f]/.test(value)) return reject("INPUT", "Provide an audit reason of 8–1000 characters.");
  return value.trim();
}
export function parseBindings(input: unknown): NonNullable<CompiledTemplateView["bindings"]> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return reject("CONTENT", "Missing frozen parameter bindings.");
  const v = input as Record<string, unknown>;
  if (Object.keys(v).some((k) => !["schemaVersion", "headerMediaRole", "header", "body", "buttons"].includes(k)) ||
      (v.schemaVersion !== undefined && v.schemaVersion !== 1)) return reject("CONTENT", "Unrecognised frozen parameter bindings.");
  if (v.headerMediaRole !== undefined &&
      !["LOGO", "SQUARE_LOGO", "COVER_IMAGE"].includes(String(v.headerMediaRole))) {
    return reject("CONTENT", "Unknown IMAGE media role.");
  }
  function positions(value: unknown, optional = false): Array<{ position: number; variable: string }> {
    if (optional && value === undefined) return [];
    if (!Array.isArray(value) || value.length > 50) return reject("CONTENT", "Invalid positional bindings.");
    const out = value.map((p, i) => {
      if (!p || typeof p !== "object" || Array.isArray(p) || (p as Record<string, unknown>).position !== i + 1 || !BINDING.test(String((p as Record<string, unknown>).variable))) return reject("CONTENT", "Invalid variable position or key.");
      return { position: i + 1, variable: (p as Record<string, string>).variable };
    });
    return out;
  }
  if (!Array.isArray(v.buttons) || v.buttons.length > 10) return reject("CONTENT", "Invalid button bindings.");
  const buttons = v.buttons.map((p) => {
    if (!p || typeof p !== "object" || Array.isArray(p)) return reject("CONTENT", "Invalid button binding.");
    const b = p as Record<string, unknown>;
    if (typeof b.index !== "number" || !Number.isInteger(b.index) || b.index < 0 || b.index > 9 || b.subType !== "url" || b.variable !== "checkout.url") return reject("CONTENT", "Invalid URL button binding.");
    return { index: Number(b.index), variable: "checkout.url" };
  });
  if (new Set(buttons.map((b) => b.index)).size !== buttons.length) return reject("CONTENT", "Duplicate URL button binding.");
  const header = positions(v.header, true);
  if (v.headerMediaRole && (v.schemaVersion !== 1 || header.length > 0)) {
    return reject("CONTENT", "IMAGE header may not contain text bindings.");
  }
  return { header, body: positions(v.body), buttons,
    ...(v.headerMediaRole ? { headerMediaRole: v.headerMediaRole as "LOGO" | "SQUARE_LOGO" | "COVER_IMAGE" } : {}) };
}
export function parseComponents(input: unknown): Pick<CompiledTemplateView, "header" | "headerFormat" | "body" | "footer" | "buttons"> {
  if (!Array.isArray(input) || !input.length || input.length > 4) return reject("CONTENT", "Invalid frozen provider components.");
  const components = input as unknown[];
  const part = (type: string) => components.find((v) => v && typeof v === "object" && !Array.isArray(v) && (v as Record<string, unknown>).type === type) as Record<string, unknown> | undefined;
  if (part("HEADER") && !["TEXT", "IMAGE"].includes(String(part("HEADER")?.format))) {
    return reject("CONTENT", "Unsupported Meta header format.");
  }
  if (part("HEADER")?.format === "IMAGE" &&
      (part("HEADER")?.text !== undefined || part("HEADER")?.url !== undefined)) {
    return reject("CONTENT", "IMAGE headers cannot contain source URLs or text.");
  }
  if (!part("BODY") || components.some((p) => !p || typeof p !== "object" || !["HEADER", "BODY", "FOOTER", "BUTTONS"].includes(String((p as Record<string, unknown>).type)))) return reject("CONTENT", "Invalid Meta components.");
  if (new Set(components.map((p) => (p as Record<string, unknown>).type)).size !== components.length) return reject("CONTENT", "Duplicate Meta component.");
  const text = (item: Record<string, unknown> | undefined) => item ? typeof item.text === "string" ? item.text : reject("CONTENT", "Invalid text component.") : null;
  const rawButtons = part("BUTTONS")?.buttons;
  if (rawButtons !== undefined && (!Array.isArray(rawButtons) || rawButtons.length > 10)) return reject("CONTENT", "Invalid Meta buttons.");
  const buttons = Array.isArray(rawButtons) ? rawButtons.map((b) => {
    if (!b || typeof b !== "object" || typeof b.text !== "string" || typeof b.url !== "string" || b.type !== "URL") return reject("CONTENT", "Invalid Meta button.");
    return { type: "URL", text: String(b.text), url: String(b.url) };
  }) : [];
  return { header: part("HEADER")?.format === "IMAGE" ? null : text(part("HEADER")),
    body: text(part("BODY")), footer: text(part("FOOTER")), buttons,
    ...(part("HEADER")?.format === "IMAGE" ? { headerFormat: "IMAGE" as const } : {}) };
}
export function brandKeys(bindings: NonNullable<CompiledTemplateView["bindings"]>): string[] {
  const present = new Set([...bindings.header, ...bindings.body, ...bindings.buttons].map((b) => b.variable));
  return SHOP_BRAND_VARIABLES.filter((key) => present.has(key));
}
export function makeTemplateView(row: {
  providerTemplateName: string; providerLanguageCode: string; category: string;
  componentsSnapshot: unknown; parameterBindingsSnapshot: unknown; providerStatus: string | null;
}): CompiledTemplateView {
  return { provenance: "moda", label: "Moda-authored Meta registration", providerTemplateName: row.providerTemplateName,
    providerLanguageCode: row.providerLanguageCode, status: row.providerStatus, category: row.category,
    ...parseComponents(row.componentsSnapshot), bindings: parseBindings(row.parameterBindingsSnapshot) };
}
export function unavailableHistory(row?: { providerTemplateName: string; providerLanguageCode: string; status: string } | null): CompiledTemplateView {
  return { provenance: row ? "legacy" : "none", label: row ? "Historical content not preserved in this legacy assignment" : "No previous assignment",
    providerTemplateName: row?.providerTemplateName ?? null, providerLanguageCode: row?.providerLanguageCode ?? null,
    status: row?.status ?? null, category: null, header: null, body: null, footer: null, buttons: null, bindings: null };
}
export function classify(current: Array<{ metaRegistrationId: string | null }>, proposedId: string): ImpactKind {
  if (current.length > 1) return "conflict";
  if (!current.length) return "new";
  if (current[0].metaRegistrationId === proposedId) return "unchanged";
  return current[0].metaRegistrationId === null ? "override" : "replaced";
}
export function emptyCounts(): Record<ImpactKind, number> { return { new: 0, unchanged: 0, replaced: 0, override: 0, conflict: 0 }; }
export function brandAvailability(keys: string[], record: Record<string, unknown> | null | undefined, verified: boolean): BrandIndicator[] {
  return keys.map((key) => {
    const value = record?.[key.slice("shopBrand.".length)];
    return { key, availability: !verified ? "unverifiable" as const : value === null || value === undefined || value === "" ? "missing" as const : "configured" as const };
  });
}
/** Enforce exact submitted versus reviewed projection; approval alone is insufficient. */
export function equivalentRegistration(record: {
  componentsSnapshot: unknown; parameterBindingsSnapshot: unknown; category: string;
  submittedContentHash: string; providerStatus: string | null; providerTemplateId: string | null;
  driftDetectedAt: Date | null; lastObservedContentHash: string | null; lastObservedCategory: string | null;
  failureCode: string | null;
}, locale: { contentHash: string | null; localeAst: unknown; reviewedAt: Date | null; reviewedByAdminId: string | null; languageTag: string }): boolean {
  if (record.providerStatus !== "APPROVED" || !record.providerTemplateId || record.driftDetectedAt || record.failureCode ||
      record.lastObservedContentHash && record.lastObservedContentHash !== record.submittedContentHash ||
      record.lastObservedCategory && record.lastObservedCategory !== record.category) return false;
  if (locale.languageTag !== "en" && (!locale.reviewedAt || !locale.reviewedByAdminId)) return false;
  const wrapper = locale.localeAst;
  if (!wrapper || typeof wrapper !== "object" || Array.isArray(wrapper)) return false;
  const prepared = (wrapper as Record<string, unknown>).prepared;
  if (!prepared || typeof prepared !== "object" || Array.isArray(prepared)) return false;
  try {
    const p = prepared as Record<string, unknown>;
    const expected = { schemaVersion: 1, family: "META_RECOVERY", category: record.category,
      components: record.componentsSnapshot, parameterBindings: record.parameterBindingsSnapshot };
    const pieces = parseComponents(record.componentsSnapshot);
    const mappings = parseBindings(record.parameterBindingsSnapshot);
    const exactPlaceholders = (text: string | null, list: Array<{ position: number }>) => {
      const matches = [...(text ?? "").matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])).sort((a, b) => a - b);
      return stableJson(matches) === stableJson(list.map((b) => b.position).sort((a, b) => a - b));
    };
    if (pieces.headerFormat === "IMAGE") {
      if (!mappings.headerMediaRole || mappings.header.length !== 0) return false;
    } else if (mappings.headerMediaRole) return false;
    if (!exactPlaceholders(pieces.header, mappings.header) || !exactPlaceholders(pieces.body, mappings.body)) return false;
    if (mappings.buttons.some((entry) => entry.index >= (pieces.buttons ?? []).length)) return false;
    for (const [index, button] of (pieces.buttons ?? []).entries()) {
      const variable = mappings.buttons.some((entry) => entry.index === index);
      if ((button.url.match(/\{\{1\}\}/g) ?? []).length !== (variable ? 1 : 0)) return false;
    }
    return p.schemaVersion === 1 && p.family === "META_RECOVERY" &&
      templateHash(prepared) === locale.contentHash && locale.contentHash === record.submittedContentHash &&
      stableJson(prepared) === stableJson(expected) && !!parseComponents(record.componentsSnapshot) && !!parseBindings(record.parameterBindingsSnapshot);
  } catch { return false; }
}
