import type {
  ContentNode,
  MetaTemplateAst,
  SemanticVariable,
  TemplateAst,
} from "../authoring/types";
import { sourceLocations } from "./locations";
import { localizedInitialReplyNodes } from "../authoring/initial-reply-instructions";
import type {
  SourceSegment,
  TranslationSegmentResult,
  TranslationSourceSnapshot,
} from "./contracts";

/** Never interpret a translator string as an authoring expression; only certified markers become variable nodes. */
export function restoreProtectedNodes(
  output: string,
  segment: SourceSegment,
): ContentNode[] {
  const occurrences = segment.protectedTokens
    .map(({ marker, variable }) => ({
      start: output.indexOf(marker),
      end: output.indexOf(marker) + marker.length,
      marker,
      variable,
    }))
    .sort((a, b) => a.start - b.start);
  const nodes: ContentNode[] = [];
  let offset = 0;
  const pushText = (text: string) => {
    if (!text) return;
    const last = nodes.at(-1);
    if (last?.type === "text") last.value += text;
    else nodes.push({ type: "text", value: text });
  };
  for (const { start, end, variable } of occurrences) {
    if (start < offset)
      throw new Error(`${segment.key}: overlapping protected markers.`);
    pushText(output.slice(offset, start));
    nodes.push({ type: "variable", name: variable as SemanticVariable });
    offset = end;
  }
  pushText(output.slice(offset));
  return nodes;
}

/** The verified source segment determines which approved instruction form to restore.
 * The standalone form must not re-introduce a second merchant binding. */
function appendLocalizedReply(
  ast: MetaTemplateAst,
  segment: SourceSegment,
  languageTag: string,
): void {
  const standalone = segment.protectedTokens.length === 0;
  if (standalone) {
    if (!ast.commonLayout)
      throw new Error(
        "Standalone Reply instruction requires a common shop layout.",
      );
    // Translation providers may trim trailing whitespace from the preceding segment.
    // Restore a separate paragraph without modifying the frozen English source.
    const last = ast.body.at(-1);
    if (last?.type === "text") last.value = last.value.trimEnd() + "\n\n";
    else ast.body.push({ type: "text", value: "\n\n" });
  }
  ast.body.push(
    ...localizedInitialReplyNodes(languageTag, ast.promotionTarget, standalone),
  );
}

/** English structure is the anchor; URLs, checkout actions and response slots are never translated. */
export function reconstructLocaleAst(
  english: TemplateAst,
  source: TranslationSourceSnapshot,
  translated: TranslationSegmentResult,
  languageTag?: string,
): TemplateAst {
  const reconstructed = structuredClone(english);
  const outputs = new Map(
    translated.segments.map(({ key, text }) => [key, text]),
  );
  const sources = new Map(
    source.segments.map((segment) => [segment.key, segment]),
  );
  if (source.segments.some((segment) => segment.key.endsWith(".text"))) {
    // Restore the exact segments emitted by the real translation source extractor.
    // Response slots and image binding stay anchored to immutable English.
    const bodyRegions: Array<{ start: number; nodes: ContentNode[] }> = [];
    const localizedReply = sources.has("body.replyInstruction.text");
    if (localizedReply && reconstructed.family === "META_RECOVERY")
      reconstructed.body = [];
    for (const segment of source.segments) {
      const value = outputs.get(segment.key);
      if (value === undefined)
        throw new Error(`${segment.key}: missing translation content.`);
      const nodes = restoreProtectedNodes(value, segment);
      const body = /^body\.(\d+)\.text$/.exec(segment.key);
      const conditional = /^conditionals\.(\d+)\.nodes\.text$/.exec(
        segment.key,
      );
      const button = /^buttons\.(\d+)\.text$/.exec(segment.key);
      if (segment.key === "header.text") reconstructed.header = nodes;
      else if (segment.key === "footer.text")
        reconstructed.footer = nodes as typeof reconstructed.footer;
      else if (body && reconstructed.family === "MODA_CONVERSATION_WRAPPER")
        bodyRegions.push({ start: Number(body[1]), nodes });
      else if (
        conditional &&
        reconstructed.family === "MODA_CONVERSATION_WRAPPER"
      )
        reconstructed.conditionals[Number(conditional[1])].nodes = nodes;
      else if (button && reconstructed.family === "META_RECOVERY")
        reconstructed.buttons[Number(button[1])].label = value;
      else if (
        segment.key === "body.text" &&
        reconstructed.family === "META_RECOVERY"
      )
        reconstructed.body = nodes;
      else if (
        segment.key === "body.replyInstruction.text" &&
        reconstructed.family === "META_RECOVERY"
      ) {
        appendLocalizedReply(reconstructed, segment, languageTag ?? "en");
      } else
        throw new Error(`${segment.key}: unsupported translated component.`);
    }
    if (reconstructed.family === "MODA_CONVERSATION_WRAPPER") {
      for (const { start, nodes } of bodyRegions.sort(
        (a, b) => b.start - a.start,
      )) {
        let count = 0;
        while (
          reconstructed.body[start + count] &&
          reconstructed.body[start + count].type !== "slot"
        )
          count++;
        reconstructed.body.splice(start, count, ...nodes);
      }
    }
    return reconstructed;
  }
  const hasLocalizedReply = sources.has("body.replyInstruction");
  if (hasLocalizedReply && reconstructed.family === "META_RECOVERY")
    reconstructed.body = [];
  for (const { key, buttonIndex } of sourceLocations(english)) {
    const value = outputs.get(key);
    const origin = sources.get(key);
    if (value === undefined || !origin)
      throw new Error(`${key}: missing translation content.`);
    if (buttonIndex !== undefined) {
      if (reconstructed.family !== "META_RECOVERY")
        throw new Error("Unknown translated button component.");
      reconstructed.buttons[buttonIndex].label = value;
      continue;
    }
    const nodes = restoreProtectedNodes(value, origin);
    if (
      key === "body.replyInstruction" &&
      reconstructed.family === "META_RECOVERY"
    ) {
      appendLocalizedReply(reconstructed, origin, languageTag ?? "en");
    } else if (key === "header") reconstructed.header = nodes;
    else if (key === "footer")
      reconstructed.footer = nodes as typeof reconstructed.footer;
    else if (key === "body" && reconstructed.family === "META_RECOVERY")
      reconstructed.body = nodes;
    else if (
      key.startsWith("conditionals.") &&
      reconstructed.family === "MODA_CONVERSATION_WRAPPER"
    ) {
      const index = Number(key.split(".")[1]);
      if (!reconstructed.conditionals[index])
        throw new Error(`${key}: unknown conditional.`);
      reconstructed.conditionals[index].nodes = nodes;
    } else throw new Error(`${key}: unsupported translated component.`);
  }
  return reconstructed;
}
