import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { readCommonRecoveryLayoutReference, type CommonRecoveryLayoutReference } from "@modainteract/moda-interact-shared/commerce/presentation";
import type { ContentNode, MetaTemplateAst } from "./types";

/** The canonical parser is identical on server and browser; never substitute a caller's digest. */
export const layoutDigest = (text: string): string => bytesToHex(sha256(new TextEncoder().encode(text)));
export function requireCommonLayout(raw: unknown): CommonRecoveryLayoutReference {
  const result = readCommonRecoveryLayoutReference(raw, layoutDigest);
  if (result.kind !== "ok") throw new Error("Choose an intact common shop layout with a name, website and checkout footer.");
  return result.reference;
}
/** Provider projection of the saved structure, not another authored frame. Shared joins sections with one newline. */
function projectCommonMetaBody(draft: MetaTemplateAst, historical: boolean): ContentNode[] {
  if (!draft.commonLayout) return draft.body;
  const { prepared } = requireCommonLayout(draft.commonLayout);
  const nodes = (tokens: typeof prepared.header): ContentNode[] => tokens.map(token => {
    if (token.kind === "responseSlot") throw new Error("Common frame cannot contain a response slot outside its body.");
    return token.kind === "text" ? { type: "text", value: token.value } : { type: "variable", name: token.name };
  });
  const optOut: ContentNode[] = draft.footer.length ? [{ type: "text", value: "\n" }, ...draft.footer] : [];
  const checkout: ContentNode[] = [{ type: "text", value: "\n" }, ...nodes(prepared.conditionals[0].tokens)];
  // Historical order is verification-only: never use it for new authoring/submissions.
  return [...nodes(prepared.header), { type: "text", value: "\n" }, ...draft.body,
    ...(historical ? [...optOut, ...checkout] : [...checkout, ...optOut])];
}

export function commonMetaBody(draft: MetaTemplateAst): ContentNode[] { return projectCommonMetaBody(draft, false); }
/** Only the server-side frozen verifier may use this exact pre-ADMIN007 ordering. */
export function historicalCommonMetaBody(draft: MetaTemplateAst): ContentNode[] { return projectCommonMetaBody(draft, true); }
