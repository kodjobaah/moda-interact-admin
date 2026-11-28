import { splitInitialReplyBody } from "../authoring/initial-reply-instructions";
import type { TemplateAst } from "../authoring/types";
import { validateTemplateAst } from "../authoring/validation";
import type { SegmentLocation } from "./contracts";

/** Same deterministic component identities ADMIN-004 is required to emit. */
export function sourceLocations(ast: TemplateAst): SegmentLocation[] {
  const compliantInitial =
    ast.family === "META_RECOVERY" &&
    ast.stage === "INITIAL" &&
    validateTemplateAst(ast, {
      requireInitialReply: true,
      contentLanguageTag: "en",
    }).ok;
  const parts =
    compliantInitial && ast.family === "META_RECOVERY"
      ? splitInitialReplyBody(
          ast.body,
          ast.promotionTarget,
          "en",
          !!ast.commonLayout,
        )
      : null;
  const bodyPrefix =
    ast.family === "META_RECOVERY" ? (parts?.body ?? ast.body) : [];
  const replyNodes = parts?.reply;
  const locations: SegmentLocation[] = [
    { key: "header", nodes: ast.header },
    ...(ast.family === "META_RECOVERY"
      ? [
          { key: "body", nodes: bodyPrefix },
          ...(replyNodes
            ? [{ key: "body.replyInstruction", nodes: replyNodes }]
            : []),
        ]
      : []),
    { key: "footer", nodes: ast.footer },
  ];
  if (ast.family === "META_RECOVERY") {
    ast.buttons.forEach((_, index) =>
      locations.push({ key: `buttons.${index}.label`, buttonIndex: index }),
    );
  } else {
    ast.conditionals.forEach((c, index) =>
      locations.push({ key: `conditionals.${index}.nodes`, nodes: c.nodes }),
    );
  }
  // Omit empty display components, but never omit a variable-bearing component.
  return locations.filter(
    ({ nodes, buttonIndex }) =>
      buttonIndex !== undefined ||
      nodes?.some(
        (node) =>
          node.type === "variable" ||
          (node.type === "text" && node.value.length > 0),
      ),
  );
}
