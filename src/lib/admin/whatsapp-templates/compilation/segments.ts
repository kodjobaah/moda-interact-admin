import { VARIABLE_REGISTRY } from "../authoring/registry";
import { validateTemplateAst } from "../authoring/validation";
import type { TemplateAst } from "../authoring/types";
import type { SourceSegment, TranslationSegmentResult, TranslationSourceSnapshot } from "./contracts";
import { isRecord } from "./contracts";
import { sourceLocations } from "./locations";

const MAX_SEGMENT = 8192;
const MAX_SNAPSHOT = 40_000;
// Literal unprotected authoring variables and invented provider placeholders are never accepted.
const PLACEHOLDERS = /\{\{|\}\}|⟦|⟧|\[\[MODA/i;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/;
const SAFE_MARKER = /^(?:\{\{[1-9]\d{0,4}\}\}|[\[\]A-Za-z0-9_:-]{8,96}|⟦[A-Za-z0-9_:-]{1,90}⟧)$/;

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length > MAX_SEGMENT || CONTROL.test(value)) {
    throw new Error(`${label}: invalid or unsafe translated text.`);
  }
  return value;
}

function requireUniqueKeys(segments: Array<{ key: string }>, name: string): void {
  const seen = new Set<string>();
  for (const segment of segments) {
    if (!/^(header|body|footer|buttons\.\d+\.label|conditionals\.\d+\.nodes)$/.test(segment.key) || seen.has(segment.key)) {
      throw new Error(`${name}: duplicate or invalid segment key ${segment.key.slice(0, 80)}.`);
    }
    seen.add(segment.key);
  }
}

/** Parse untrusted JSONB without believing its types, marker identities or cardinality. */
export function parseSourceSnapshot(value: unknown): TranslationSourceSnapshot {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.sourceLanguageTag !== "en" ||
      typeof value.definitionId !== "string" || !/^wtdef_[a-f0-9]{64}$/.test(value.definitionId) ||
      typeof value.sourceHash !== "string" || !/^[a-f0-9]{64}$/.test(value.sourceHash) ||
      !Array.isArray(value.segments) || value.segments.length > 32 ||
      JSON.stringify(value).length > MAX_SNAPSHOT) throw new Error("Invalid keyed source snapshot or version.");
  const segments: SourceSegment[] = value.segments.map((entry: unknown, i) => {
    if (!isRecord(entry) || typeof entry.key !== "string" || !Array.isArray(entry.protectedTokens) ||
        entry.protectedTokens.length > 80) throw new Error(`Source segment ${i}: invalid structure.`);
    const protectedTokens = entry.protectedTokens.map((token: unknown) => {
      if (!isRecord(token) || typeof token.marker !== "string" || !SAFE_MARKER.test(token.marker) ||
          typeof token.variable !== "string" || !Object.hasOwn(VARIABLE_REGISTRY, token.variable)) {
        throw new Error(`Source segment ${i}: unknown or unsafe protected marker.`);
      }
      return { marker: token.marker, variable: token.variable as keyof typeof VARIABLE_REGISTRY };
    });
    return { key: entry.key, text: text(entry.text, entry.key), protectedTokens };
  });
  requireUniqueKeys(segments, "Source snapshot");
  const allMarkers = segments.flatMap((segment) => segment.protectedTokens.map((token) => token.marker));
  if (new Set(allMarkers).size !== allMarkers.length) throw new Error("Source snapshot: protected markers must be unique per occurrence.");
  return { schemaVersion: 1, definitionId: value.definitionId, sourceHash: value.sourceHash,
    sourceLanguageTag: "en", segments };
}

export function parseTranslatedSegments(value: unknown): TranslationSegmentResult {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.segments) ||
      value.segments.length > 32 || JSON.stringify(value).length > MAX_SNAPSHOT) {
    throw new Error("Unsupported or malformed translated-segment response.");
  }
  const segments = value.segments.map((entry: unknown, i) => {
    if (!isRecord(entry) || typeof entry.key !== "string") throw new Error(`Translated segment ${i}: malformed.`);
    return { key: entry.key, text: text(entry.text, entry.key) };
  });
  requireUniqueKeys(segments, "Translation result");
  return { schemaVersion: 1, segments };
}

/** Reject altered source snapshots even when a persisted run claims the matching hash. */
export function verifySourceAgainstAst(source: TranslationSourceSnapshot, ast: TemplateAst): void {
  const checked = validateTemplateAst(ast);
  if (!checked.ok) throw new Error(`English authoring AST invalid: ${checked.issues[0].message}`);
  const expected = sourceLocations(ast);
  if (source.segments.length !== expected.length) throw new Error("Source snapshot has missing or unexpected components.");
  for (const location of expected) {
    const segment = source.segments.find((s) => s.key === location.key);
    if (!segment) throw new Error(`Source segment ${location.key} is missing.`);
    if (location.buttonIndex !== undefined) {
      const button = ast.family === "META_RECOVERY" ? ast.buttons[location.buttonIndex] : null;
      if (!button || segment.text !== button.label || segment.protectedTokens.length) {
        throw new Error(`Source button label ${location.key} does not match immutable English.`);
      }
      continue;
    }
    const nodes = location.nodes ?? [];
    const variables = nodes.filter((n) => n.type === "variable").map((n) => n.name);
    if (segment.protectedTokens.length !== variables.length ||
        segment.protectedTokens.some((token, i) => token.variable !== variables[i])) {
      throw new Error(`${location.key}: protected variable identity/order differs from the saved English template.`);
    }
    let index = 0;
    const expectedText = nodes.map((node) => node.type === "text" ? node.value : segment.protectedTokens[index++].marker).join("");
    if (expectedText !== segment.text) throw new Error(`${location.key}: snapshot text does not match immutable English.`);
    for (const token of segment.protectedTokens) {
      if (segment.text.split(token.marker).length !== 2) throw new Error(`${location.key}: source marker multiplicity invalid.`);
    }
  }
}

/** Marker multiset is exact, preserving semantic identity while allowing reordering. */
export function verifyTranslatedKeysAndMarkers(source: TranslationSourceSnapshot, translated: TranslationSegmentResult): void {
  if (translated.segments.length !== source.segments.length) throw new Error("Translation has missing or unexpected component keys.");
  const known = new Set(source.segments.map((segment) => segment.key));
  for (const segment of translated.segments) {
    if (!known.has(segment.key)) throw new Error(`Unexpected translation component ${segment.key}.`);
    const original = source.segments.find((s) => s.key === segment.key)!;
    let plain = segment.text;
    for (const token of original.protectedTokens) {
      if (plain.split(token.marker).length !== 2) throw new Error(`${segment.key}: marker ${token.marker} must occur exactly once.`);
      plain = plain.replace(token.marker, "");
    }
    if (PLACEHOLDERS.test(plain)) throw new Error(`${segment.key}: unknown, mutated or invented protected marker.`);
  }
}
