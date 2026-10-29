import { createHash } from "node:crypto";
import { templateHash } from "../authoring/identifiers";
import { validateTemplateAst } from "../authoring/validation";
import type { ContentNode, ImmutableAuthoringRecord, TemplateAst, WrapperNode } from "../authoring/types";

export type ProtectedToken = { marker: string; variable: string };
export type TranslationSegment = { key: string; text: string; protectedTokens: ProtectedToken[] };
export type TemplateTranslationSourceSnapshot = {
  schemaVersion: 1;
  definitionId: string;
  sourceHash: string;
  sourceLanguageTag: "en";
  segments: TranslationSegment[];
};

const SEGMENT_KEY = /^(header|body|footer)\.(text|\d+\.text)$|^buttons\.\d+\.text$|^conditionals\.\d+\.nodes\.text$/;
const VARIABLE_MARKER = /⟦moda_[a-f0-9]{24}⟧/g;

/** Tokens are deterministic for each node occurrence but never expose a merchant or customer value. */
export function extractTranslationSegments(definitionId: string, ast: TemplateAst): TranslationSegment[] {
  const verified = validateTemplateAst(ast);
  if (!verified.ok) throw new Error(`Saved English template is invalid: ${verified.issues[0]?.path ?? "root"}`);
  const segments: TranslationSegment[] = [];
  const usedMarkers = new Set<string>();
  const addNodes = (key: string, nodes: readonly (ContentNode | WrapperNode)[]) => {
    if (!nodes.length) return;
    const protectedTokens: ProtectedToken[] = [];
    const chunks: string[] = [];
    for (const [index, node] of nodes.entries()) {
      if (node.type === "slot") throw new Error("The response.body insertion slot must not enter translation text.");
      if (node.type === "text") {
        // Prevent user-supplied text from masquerading as a protected variable marker.
        if (VARIABLE_MARKER.test(node.value)) throw new Error("Source text contains reserved translation token syntax.");
        VARIABLE_MARKER.lastIndex = 0;
        chunks.push(node.value);
      } else {
        const marker = `⟦moda_${createHash("sha256").update(`${definitionId}\0${key}\0${index}\0${node.name}`).digest("hex").slice(0, 24)}⟧`;
        if (usedMarkers.has(marker)) throw new Error("Duplicate protected translation marker.");
        usedMarkers.add(marker);
        protectedTokens.push({ marker, variable: node.name });
        chunks.push(marker);
      }
    }
    const text = chunks.join("");
    if (text.trim()) segments.push({ key, text, protectedTokens });
  };
  addNodes("header.text", ast.header);
  if (ast.family === "META_RECOVERY") {
    addNodes("body.text", ast.body);
    addNodes("footer.text", ast.footer);
    ast.buttons.forEach((button, index) => {
      if (button.label.trim()) segments.push({ key: `buttons.${index}.text`, text: button.label, protectedTokens: [] });
    });
  } else {
    // The response.body slot is structural: translate each surrounding contiguous region independently.
    let group: ContentNode[] = [];
    let start = 0;
    const flush = () => { addNodes(`body.${start}.text`, group); group = []; };
    ast.body.forEach((node, index) => {
      if (node.type === "slot") { flush(); start = index + 1; }
      else group.push(node);
    });
    flush();
    addNodes("footer.text", ast.footer);
    ast.conditionals.forEach((condition, index) => addNodes(`conditionals.${index}.nodes.text`, condition.nodes));
  }
  validateSegments(segments);
  return segments;
}

export function validateSegments(segments: TranslationSegment[]): void {
  if (!Array.isArray(segments) || segments.length > 64) throw new Error("Translation segment count is invalid.");
  const keys = new Set<string>();
  const markers = new Set<string>();
  for (const segment of segments) {
    if (!SEGMENT_KEY.test(segment.key) || keys.has(segment.key)) throw new Error("Duplicate or invalid translation segment key.");
    keys.add(segment.key);
    if (!segment.text || segment.text.length > 10000 || !Array.isArray(segment.protectedTokens)) throw new Error("Invalid translation segment text.");
    for (const token of segment.protectedTokens) {
      if (!/^⟦moda_[a-f0-9]{24}⟧$/.test(token.marker) || markers.has(token.marker) ||
          segment.text.split(token.marker).length !== 2) throw new Error("Invalid, missing, or duplicated protected marker.");
      if (!/^(customer\.firstName|shop\.(name|categoryName)|checkout\.url|offer\.(code|description)|shopBrand\.(brandName|logoUrl|logoAltText|logoWidth|logoHeight|squareLogoUrl|squareLogoAltText|coverImageUrl))$/.test(token.variable)) {
        throw new Error("Unknown protected semantic variable.");
      }
      markers.add(token.marker);
    }
    const unknown = segment.text.match(VARIABLE_MARKER) ?? [];
    VARIABLE_MARKER.lastIndex = 0;
    if (unknown.length !== segment.protectedTokens.length) throw new Error("Unregistered protected marker in source segment.");
  }
}

/** The persisted English authoring AST is the source; prepared Meta/wrapper projections are never translated. */
export function makeTranslationSourceSnapshot(input: {
  definitionId: string;
  sourceHash: string;
  sourceLanguageTag: string;
  englishLocaleAst: unknown;
  englishContentHash: string | null;
}): TemplateTranslationSourceSnapshot {
  const record = input.englishLocaleAst as Partial<ImmutableAuthoringRecord> | null;
  if (input.sourceLanguageTag !== "en" || record?.schemaVersion !== 1 || !record.authoring || !record.prepared ||
      !/^[a-f0-9]{64}$/.test(input.sourceHash) || templateHash(record.authoring) !== input.sourceHash ||
      templateHash(record.prepared) !== input.englishContentHash) {
    throw new Error("Saved immutable English locale or source hash is missing or has changed.");
  }
  const segments = extractTranslationSegments(input.definitionId, record.authoring);
  if (!segments.length) throw new Error("English template has no translatable text.");
  const snapshot: TemplateTranslationSourceSnapshot = {
    schemaVersion: 1, definitionId: input.definitionId, sourceHash: input.sourceHash,
    sourceLanguageTag: "en", segments,
  };
  if (Buffer.byteLength(JSON.stringify(snapshot), "utf8") > 128 * 1024) throw new Error("Translation snapshot exceeds 128 KiB.");
  return snapshot;
}
