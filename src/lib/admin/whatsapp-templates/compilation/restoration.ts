import type { ContentNode, SemanticVariable, TemplateAst } from "../authoring/types";
import { sourceLocations } from "./locations";
import type { SourceSegment, TranslationSegmentResult, TranslationSourceSnapshot } from "./contracts";

/** Never interpret a translator string as an authoring expression; only certified markers become variable nodes. */
export function restoreProtectedNodes(output: string, segment: SourceSegment): ContentNode[] {
  const occurrences = segment.protectedTokens.map(({ marker, variable }) => ({
    start: output.indexOf(marker), end: output.indexOf(marker) + marker.length, marker, variable,
  })).sort((a, b) => a.start - b.start);
  const nodes: ContentNode[] = [];
  let offset = 0;
  const pushText = (text: string) => {
    if (!text) return;
    const last = nodes.at(-1);
    if (last?.type === "text") last.value += text;
    else nodes.push({ type: "text", value: text });
  };
  for (const { start, end, variable } of occurrences) {
    if (start < offset) throw new Error(`${segment.key}: overlapping protected markers.`);
    pushText(output.slice(offset, start));
    nodes.push({ type: "variable", name: variable as SemanticVariable });
    offset = end;
  }
  pushText(output.slice(offset));
  return nodes;
}

/** English structure is the anchor; URLs, checkout actions and response slots are never translated. */
export function reconstructLocaleAst(english: TemplateAst, source: TranslationSourceSnapshot,
  translated: TranslationSegmentResult): TemplateAst {
  const reconstructed = structuredClone(english);
  const outputs = new Map(translated.segments.map(({ key, text }) => [key, text]));
  const sources = new Map(source.segments.map((segment) => [segment.key, segment]));
  for (const { key, buttonIndex } of sourceLocations(english)) {
    const value = outputs.get(key);
    const origin = sources.get(key);
    if (value === undefined || !origin) throw new Error(`${key}: missing translation content.`);
    if (buttonIndex !== undefined) {
      if (reconstructed.family !== "META_RECOVERY") throw new Error("Unknown translated button component.");
      reconstructed.buttons[buttonIndex].label = value;
      continue;
    }
    const nodes = restoreProtectedNodes(value, origin);
    if (key === "header") reconstructed.header = nodes;
    else if (key === "footer") reconstructed.footer = nodes as typeof reconstructed.footer;
    else if (key === "body" && reconstructed.family === "META_RECOVERY") reconstructed.body = nodes;
    else if (key.startsWith("conditionals.") && reconstructed.family === "MODA_CONVERSATION_WRAPPER") {
      const index = Number(key.split(".")[1]);
      if (!reconstructed.conditionals[index]) throw new Error(`${key}: unknown conditional.`);
      reconstructed.conditionals[index].nodes = nodes;
    } else throw new Error(`${key}: unsupported translated component.`);
  }
  return reconstructed;
}
