import { templateHash } from "../../src/lib/admin/whatsapp-templates/authoring/identifiers.ts";
import { sourceLocations } from "../../src/lib/admin/whatsapp-templates/compilation/locations.ts";
import { reconstructAndCompile } from "../../src/lib/admin/whatsapp-templates/compilation/reconstruction.ts";
import type { TemplateAst } from "../../src/lib/admin/whatsapp-templates/authoring/types.ts";
import type { TranslationSourceSnapshot, TranslationSegmentResult } from "../../src/lib/admin/whatsapp-templates/compilation/contracts.ts";

const DEF_ID = `wtdef_${"a".repeat(64)}`;

/** ADMIN-004 contract fixture; this is deliberately not a second production segment-extractor. */
export function compilationFixture(english: TemplateAst) {
  let occurrence = 0;
  const source: TranslationSourceSnapshot = { schemaVersion: 1, definitionId: DEF_ID, sourceHash: templateHash(english), sourceLanguageTag: "en",
    segments: sourceLocations(english).map(({ key, nodes, buttonIndex }) => {
      const protectedTokens: Array<{ marker: string; variable: import("../../src/lib/admin/whatsapp-templates/authoring/types.ts").SemanticVariable }> = [];
      const mapped = (nodes ?? []).map((node) => {
        if (node.type === "text") return node.value;
        const marker = `{{${++occurrence}}}`;
        protectedTokens.push({ marker, variable: node.name });
        return marker;
      }).join("");
      const text = buttonIndex === undefined ? mapped : english.family === "META_RECOVERY" ? english.buttons[buttonIndex].label : "";
      return { key, text, protectedTokens };
    }) };
  const translated: TranslationSegmentResult = { schemaVersion: 1,
    segments: source.segments.map(({ key, text }) => ({ key, text })) };
  const run = (languageTag = "fr", changed = translated, snapshot = source) => reconstructAndCompile({
    definitionId: DEF_ID, definitionSourceHash: templateHash(english), runSourceHash: source.sourceHash,
    english, languageTag, snapshot, translated: changed, outputContentHash: templateHash(changed),
  });
  return { source, translated, run };
}
