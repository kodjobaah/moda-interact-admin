import type { TemplateAst } from "../authoring/types";
import { validateTemplateAst } from "../authoring/validation";
import type { SegmentLocation } from "./contracts";

/** Same deterministic component identities ADMIN-004 is required to emit. */
export function sourceLocations(ast: TemplateAst): SegmentLocation[] {
  const compliantInitial = ast.family === "META_RECOVERY" && ast.stage === "INITIAL" &&
    validateTemplateAst(ast, { requireInitialReply: true, contentLanguageTag: "en" }).ok;
  let bodyPrefix = ast.family === "META_RECOVERY" ? ast.body : [];
  let replyNodes: import("../authoring/types").ContentNode[] | undefined;
  if (compliantInitial && ast.family === "META_RECOVERY") {
    const tail = ast.body.slice(-3);
    if (tail[0]?.type === "text" && tail[1]?.type === "variable" && tail[1].name === "shop.name" && tail[2]?.type === "text") {
      const fromIndex = tail[0].value.lastIndexOf("From ");
      if (fromIndex >= 0) {
        const precedingText = tail[0].value.slice(0, fromIndex);
        bodyPrefix = ast.body.slice(0, -3);
        if (precedingText) bodyPrefix.push({ type: "text", value: precedingText });
        replyNodes = [
          { type: "text", value: "From " },
          tail[1],
          tail[2],
        ];
      }
    }
  }
  const locations: SegmentLocation[] = [
    { key: "header", nodes: ast.header },
    ...(ast.family === "META_RECOVERY" ? [
      { key: "body", nodes: bodyPrefix },
      ...(replyNodes ? [{ key: "body.replyInstruction", nodes: replyNodes }] : []),
    ] : []),
    { key: "footer", nodes: ast.footer },
  ];
  if (ast.family === "META_RECOVERY") {
    ast.buttons.forEach((_, index) => locations.push({ key: `buttons.${index}.label`, buttonIndex: index }));
  } else {
    ast.conditionals.forEach((c, index) => locations.push({ key: `conditionals.${index}.nodes`, nodes: c.nodes }));
  }
  // Omit empty display components, but never omit a variable-bearing component.
  return locations.filter(({ nodes, buttonIndex }) => buttonIndex !== undefined ||
    nodes?.some((node) => node.type === "variable" || (node.type === "text" && node.value.length > 0)));
}
